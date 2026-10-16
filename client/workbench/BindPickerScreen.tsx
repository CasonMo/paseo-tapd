import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { createRpc, searchRpc, tapdSettings, type EntityKind } from "../../shared/contracts";
import { Chip, type WorkbenchTheme } from "./bits";
import { bindNoticeText, makeLink, notifyAgent, parseEntityRef } from "./link-utils";

interface BindItem {
  key: string;
  kind: EntityKind;
  id: string;
  title: string;
  url: string;
  subtitle: string;
}

type SearchResultItem = { id: string; title: string; subtitle: string; url: string };

/** /paseo-tapd 落地页：搜索并绑定单据到当前 Agent；或创建新需求并绑定 */
export function BindPickerScreen({ theme, params }: PluginScreenProps) {
  return <BindPickerBody theme={theme} params={params} />;
}

function BindPickerBody({ theme, params }: { theme: WorkbenchTheme; params: Record<string, string> }) {
  const mode = params.mode === "create" ? "create" : "search";
  const agentId = params.agentId ?? "";
  const agentTitle = params.agentTitle ?? "";
  const workspaceId = params.workspaceId ?? "";

  const settings = useSettings(tapdSettings);
  const search = useRpc(searchRpc);
  const create = useRpc(createRpc);
  const paseo = usePaseo();
  const toast = useToast();

  const [query, setQuery] = useState(params.query ?? "");
  const [debounced, setDebounced] = useState((params.query ?? "").trim());
  const [boundKeys, setBoundKeys] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<{ id: string; title: string; url: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const autoBoundRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    autoBoundRef.current = false;
  }, [debounced]);

  const results = useQuery({
    queryKey: ["tapd-bind-search", debounced],
    queryFn: () => search({ query: debounced }),
    enabled: mode === "search" && debounced.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
  const resultItems = results.data?.items ?? [];

  const savedLinks = settings.status === "ready" ? settings.values.links : [];
  const isBound = (key: string) =>
    boundKeys[key] === true || savedLinks.some((link) => link.key === key && link.agentId === agentId);

  async function bindItem(item: BindItem, statusLabel?: string | null): Promise<void> {
    if (settings.status !== "ready") {
      toast.error("插件设置尚未就绪，请稍后重试");
      return;
    }
    if (savedLinks.some((link) => link.key === item.key && link.agentId === agentId)) {
      setBoundKeys((current) => ({ ...current, [item.key]: true }));
      toast.show(`#${item.id} 已关联过`, { variant: "info" });
      return;
    }
    const link = makeLink({ kind: item.kind, id: item.id, workspaceId, agentId, agentTitle });
    const ok = await settings.save(
      { ...settings.values, links: [...settings.values.links, link] },
      settings.revision,
    );
    if (!ok) {
      toast.error(settings.saveError ?? "保存关联失败，请重试");
      return;
    }
    setBoundKeys((current) => ({ ...current, [item.key]: true }));
    const notified = await notifyAgent(
      paseo,
      agentId,
      bindNoticeText({ kind: item.kind, id: item.id, title: item.title, statusLabel, url: item.url }),
    );
    toast.show(`已关联 #${item.id}${notified ? "，已通知 Agent 跟进" : ""}`, { variant: "success" });
  }

  function toBindItem(item: SearchResultItem): BindItem | null {
    const parsed = parseEntityRef(item.id);
    if (!parsed) return null;
    return {
      key: `${parsed.kind}-${parsed.id}`,
      kind: parsed.kind,
      id: parsed.id,
      title: item.title,
      url: item.url,
      subtitle: item.subtitle,
    };
  }

  async function createAndBind(title: string, kind: EntityKind, statusLabel?: string | null): Promise<void> {
    setBusy(true);
    try {
      const result = await create({ kind, title, description: "", owner: "", priority: "", iterationId: "" });
      setCreated({ id: result.id, title, url: result.url });
      await bindItem({ key: `${result.kind}-${result.id}`, kind: result.kind, id: result.id, title, url: result.url, subtitle: "" }, statusLabel);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  // 创建模式：进入后自动执行一次「创建 + 绑定 + 通知」
  useEffect(() => {
    if (mode !== "create" || startedRef.current || settings.status !== "ready") return;
    startedRef.current = true;
    const kind = (params.kind as EntityKind) || "story";
    const title = (params.title ?? "").trim();
    if (!title) {
      setCreateError("缺少标题");
      return;
    }
    void createAndBind(title, kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, settings.status]);

  // 搜索模式：恰好一条匹配时自动绑定
  useEffect(() => {
    if (mode !== "search" || autoBoundRef.current || settings.status !== "ready") return;
    if (debounced.length === 0 || resultItems.length !== 1) return;
    const parsed = parseEntityRef(resultItems[0].id);
    if (!parsed) return;
    const key = `${parsed.kind}-${parsed.id}`;
    if (isBound(key)) {
      autoBoundRef.current = true;
      setBoundKeys((current) => ({ ...current, [key]: true }));
      return;
    }
    autoBoundRef.current = true;
    const item = toBindItem(resultItems[0]);
    if (item) void bindItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultItems, debounced, mode, settings.status, agentId]);

  const styles = makeStyles(theme);

  if (mode === "create") {
    return (
      <View style={styles.screen}>
        {createError ? (
          <Text style={styles.error}>创建失败：{createError}</Text>
        ) : created ? (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>已创建并关联</Text>
            <Text style={styles.successText}>
              #{created.id}「{created.title}」
            </Text>
            <Text style={styles.successText}>{created.url}</Text>
            {agentId ? <Text style={styles.hint}>已发送跟进提示词给 Agent（{agentTitle || agentId}）</Text> : null}
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.foreground} />
            <Text style={styles.hint}>正在创建并关联…</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>
        {agentId ? `把单据关联到当前 Agent（${agentTitle || agentId}），并发送跟进提示词。` : "把单据关联到 Agent。"}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="输入关键词或单据 ID，例如：登录页优化 / 1234567890123456789"
        placeholderTextColor={theme.colors.foregroundMuted}
        value={query}
        onChangeText={setQuery}
        autoFocus
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        {results.isPending && debounced.length > 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.foreground} />
          </View>
        ) : null}
        {results.isError ? <Text style={styles.error}>搜索失败，请重试。</Text> : null}
        {resultItems.map((raw) => {
          const item = toBindItem(raw);
          if (!item) return null;
          const bound = isBound(item.key);
          return (
            <Pressable
              key={raw.id}
              accessibilityRole="button"
              style={styles.row}
              disabled={bound || busy}
              onPress={() => void bindItem(item)}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  #{item.id} {item.title}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              {bound ? <Chip label="已关联" theme={theme} color={theme.colors.accent} /> : <Text style={styles.link}>关联</Text>}
            </Pressable>
          );
        })}
        {debounced.length > 0 && !results.isPending && !results.isError && resultItems.length === 0 ? (
          <View style={styles.createBox}>
            <Text style={styles.hint}>没有找到匹配的单据</Text>
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, busy ? styles.disabledButton : null]}
              disabled={busy}
              onPress={() => void createAndBind(debounced, "story")}
            >
              <Text style={styles.primaryLabel}>创建需求并关联「{debounced}」</Text>
            </Pressable>
          </View>
        ) : null}
        {debounced.length === 0 ? (
          <Text style={styles.hint}>输入关键词开始搜索；没有匹配时可以直接创建一张需求并关联。</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(theme: WorkbenchTheme): {
  screen: ViewStyle;
  center: ViewStyle;
  hint: TextStyle;
  error: TextStyle;
  input: TextStyle;
  row: ViewStyle;
  rowTitle: TextStyle;
  rowSub: TextStyle;
  link: TextStyle;
  createBox: ViewStyle;
  primaryButton: ViewStyle;
  primaryLabel: TextStyle;
  disabledButton: ViewStyle;
  successBox: ViewStyle;
  successTitle: TextStyle;
  successText: TextStyle;
} {
  const styles = {
    screen: { flex: 1, backgroundColor: theme.colors.surface0, padding: 16, gap: 10 },
    center: { alignItems: "center", gap: 8, padding: 24 },
    hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
    error: { color: theme.colors.statusDanger, fontSize: 13, lineHeight: 19 },
    input: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: theme.colors.foreground,
      fontSize: 13,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
    },
    rowTitle: { color: theme.colors.foreground, fontSize: 13 },
    rowSub: { color: theme.colors.foregroundMuted, fontSize: 11 },
    link: { color: theme.colors.accent, fontSize: 13 },
    createBox: {
      gap: 8,
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
    },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start" },
    primaryLabel: { color: theme.colors.accentForeground, fontSize: 13 },
    disabledButton: { opacity: 0.5 },
    successBox: {
      gap: 6,
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 10,
      padding: 16,
    },
    successTitle: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" },
    successText: { color: theme.colors.foreground, fontSize: 13, lineHeight: 19 },
  };
  return styles as ReturnType<typeof makeStyles>;
}
