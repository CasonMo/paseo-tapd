import type { RpcOutput } from "@getpaseo/plugin";
import { usePaseo } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { entityRpc, type TapdLink } from "../../shared/contracts";
import { type WorkbenchTheme } from "./bits";

type EntityData = RpcOutput<typeof entityRpc>;

interface RepoOption {
  path: string;
  name: string;
}

interface ModelOption {
  value: string;
  label: string;
}

interface ModelGroup {
  provider: string;
  label: string;
  models: ModelOption[];
}

type ModelRow =
  | { type: "header"; key: string; label: string; provider: string; count: number; collapsed: boolean }
  | { type: "model"; key: string; value: string; label: string };

const KIND_LABELS: Record<string, string> = { story: "需求", task: "任务", bug: "缺陷" };

function buildPrompt(data: EntityData): string {
  const description = data.description ? data.description.slice(0, 2000) : "（单据没有详细描述）";
  return [
    `你正在处理一张 TAPD ${KIND_LABELS[data.kind] ?? "单据"}，请在当前仓库中完成它。`,
    "",
    `单据：#${data.id}「${data.title}」`,
    `当前状态：${data.statusLabel}${data.owner ? ` · 处理人：${data.owner}` : ""}`,
    `链接：${data.url}`,
    "",
    "单据描述：",
    description,
    "",
    "工作要求：",
    "1. 先理解需求/问题背景，必要时给出简短的实施计划；",
    "2. 在当前仓库中定位相关代码，完成实现或修复，并运行必要的测试；",
    "3. 每轮结束时在回复最后给出一段结果摘要（改动内容、影响范围、验证结果），插件会把摘要自动回写到这张 TAPD 单据的评论。",
  ].join("\n");
}

/** 从单据派发 Agent：新建 worktree 工作区 + 起一个带单据上下文的 agent */
export function DispatchModal({ open, onClose, theme, data, defaultRepoPath, defaultProvider, onCreated }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  data: EntityData;
  defaultRepoPath: string;
  defaultProvider: string;
  onCreated: (input: { link: TapdLink; repoPath: string; provider: string }) => void;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const [mode, setMode] = useState<"form" | "repo" | "model">("form");
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repoPath, setRepoPath] = useState("");
  const [provider, setProvider] = useState("");
  const [branchName, setBranchName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("form");
    setLoadError(null);
    setCollapsedGroups({});
    setRepoPath(defaultRepoPath);
    setProvider(defaultProvider);
    setBranchName(`tapd/${data.kind}-${data.id}`);
    setPrompt(buildPrompt(data));
    setDispatching(false);
    void loadOptions(defaultRepoPath, defaultProvider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function loadOptions(fallbackRepo: string, fallbackProvider: string) {
    setLoading(true);
    try {
      const [projectsResult, snapshot] = await Promise.all([
        paseo.projects.list(),
        paseo.providers.snapshot(),
      ]);
      const repoList: RepoOption[] = (projectsResult.projects ?? [])
        .filter((project) => project.projectKind === "git")
        .map((project) => ({
          path: project.projectRootPath,
          name: project.projectCustomName ?? project.projectDisplayName,
        }));
      const groups: ModelGroup[] = [];
      for (const entry of snapshot.entries ?? []) {
        if (entry.enabled === false) continue;
        const entryModels = (entry.models ?? []).filter((model) => model.isSelectable !== false);
        if (entryModels.length === 0) continue;
        groups.push({
          provider: entry.provider,
          label: entry.label ?? entry.provider,
          models: entryModels.map((model) => ({
            value: `${entry.provider}/${model.id}`,
            label: `${model.label}${model.isDefault ? "（默认）" : ""}`,
          })),
        });
      }
      setRepos(repoList);
      setModelGroups(groups);
      if (!fallbackRepo && repoList[0]) setRepoPath(repoList[0].path);
      if (!fallbackProvider && groups[0]?.models[0]) setProvider(groups[0].models[0].value);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  const repoLabel = useMemo(
    () => repos.find((repo) => repo.path === repoPath)?.name ?? repoPath,
    [repos, repoPath],
  );
  const modelLabel = useMemo(() => {
    if (!provider) return "";
    for (const group of modelGroups) {
      const hit = group.models.find((model) => model.value === provider);
      if (hit) return `${group.label} · ${hit.label}`;
    }
    return provider;
  }, [modelGroups, provider]);

  const modelRows = useMemo<ModelRow[]>(() => {
    const rows: ModelRow[] = [];
    for (const group of modelGroups) {
      const collapsed = collapsedGroups[group.provider] === true;
      rows.push({
        type: "header",
        key: `h-${group.provider}`,
        label: group.label,
        provider: group.provider,
        count: group.models.length,
        collapsed,
      });
      if (!collapsed) {
        for (const model of group.models) {
          rows.push({ type: "model", key: `m-${model.value}`, value: model.value, label: model.label });
        }
      }
    }
    return rows;
  }, [modelGroups, collapsedGroups]);

  function toggleGroupCollapsed(provider: string) {
    setCollapsedGroups((current) => ({ ...current, [provider]: !current[provider] }));
  }

  const allCollapsed =
    modelGroups.length > 0 && modelGroups.every((group) => collapsedGroups[group.provider] === true);

  async function dispatch() {
    if (dispatching) return;
    const trimmedRepo = repoPath.trim();
    const trimmedProvider = provider.trim();
    if (!trimmedRepo || !trimmedProvider || !prompt.trim()) return;
    setDispatching(true);
    try {
      const workspaceTitle = `TAPD #${data.id} ${data.title}`.slice(0, 80);
      const workspace = await paseo.workspaces.create({
        title: workspaceTitle,
        source: {
          kind: "worktree",
          cwd: trimmedRepo,
          action: "branch-off",
          branchName: branchName.trim() || undefined,
        },
      });
      const agent = await workspace.agents.create({
        config: { provider: trimmedProvider },
        prompt,
        title: `TAPD #${data.id}`,
        labels: { "tapd-workbench": `${data.kind}-${data.id}` },
      });
      const link: TapdLink = {
        key: `${data.kind}-${data.id}`,
        kind: data.kind,
        id: data.id,
        workspaceId: workspace.id,
        agentId: agent.id,
        workspaceTitle: workspace.name || workspaceTitle,
        agentTitle: `TAPD #${data.id}`,
        createdAt: new Date().toISOString(),
        promptSnippet: prompt.trim().slice(0, 200),
      };
      onCreated({ link, repoPath: trimmedRepo, provider: trimmedProvider });
      toast.show("已派发，Agent 开始工作", { variant: "success" });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDispatching(false);
    }
  }

  const styles = useMemo<{
    row: ViewStyle;
    rowLabel: TextStyle;
    rowValue: TextStyle;
    input: TextStyle;
    inputMultiline: TextStyle;
    sectionTitle: TextStyle;
    hint: TextStyle;
    backRow: ViewStyle;
    link: TextStyle;
    footer: ViewStyle;
    primaryButton: ViewStyle;
    primaryLabel: TextStyle;
    disabledButton: ViewStyle;
    optionRow: ViewStyle;
    optionText: TextStyle;
    optionSub: TextStyle;
    groupHeader: TextStyle;
    groupRow: ViewStyle;
    groupCount: TextStyle;
  }>(() => ({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 9,
      paddingHorizontal: 2,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowLabel: { color: theme.colors.foregroundMuted, fontSize: 13, width: 64 },
    rowValue: { color: theme.colors.foreground, fontSize: 13, flex: 1 },
    input: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      color: theme.colors.foreground,
      fontSize: 13,
      flex: 1,
    },
    inputMultiline: { minHeight: 150, textAlignVertical: "top" },
    sectionTitle: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 },
    hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
    link: { color: theme.colors.accent, fontSize: 13 },
    footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 6 },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    primaryLabel: { color: theme.colors.accentForeground, fontSize: 13 },
    disabledButton: { opacity: 0.5 },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    optionText: { color: theme.colors.foreground, fontSize: 13, flex: 1 },
    optionSub: { color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1, textAlign: "right" },
    groupHeader: { color: theme.colors.foregroundMuted, fontSize: 12 },
    groupRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 4,
      paddingTop: 12,
      paddingBottom: 4,
    },
    groupCount: { color: theme.colors.foregroundMuted, fontSize: 11 },
  }), [theme]);

  if (mode === "repo") {
    return (
      <Modal title="派给 Agent · 选择仓库" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <View style={{ flex: 1, minHeight: 0, paddingTop: 8, paddingHorizontal: 14 }}>
            <Pressable accessibilityRole="button" style={styles.backRow} onPress={() => setMode("form")}>
              <Icon name="ChevronLeft" size={16} color={theme.colors.accent} />
              <Text style={styles.link}>返回</Text>
            </Pressable>
            {repos.length === 0 ? (
              <Text style={styles.hint}>没有找到 git 项目。请先在 Paseo 中添加项目后重试。</Text>
            ) : (
              <FlatList
                style={{ flex: 1, minHeight: 0 }}
                data={repos}
                keyExtractor={(item) => item.path}
                renderItem={({ item }) => (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.optionRow}
                    onPress={() => {
                      setRepoPath(item.path);
                      setMode("form");
                    }}
                  >
                    <Text style={styles.optionText} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.optionSub} numberOfLines={1}>{item.path}</Text>
                    {repoPath === item.path ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                  </Pressable>
                )}
              />
            )}
          </View>
        </Modal.Content>
      </Modal>
    );
  }

  if (mode === "model") {
    return (
      <Modal title="派给 Agent · 选择模型" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <View style={{ flex: 1, minHeight: 0, paddingTop: 8, paddingHorizontal: 14 }}>
            <Pressable accessibilityRole="button" style={styles.backRow} onPress={() => setMode("form")}>
              <Icon name="ChevronLeft" size={16} color={theme.colors.accent} />
              <Text style={styles.link}>返回</Text>
            </Pressable>
            {modelGroups.length === 0 ? (
              <Text style={styles.hint}>没有可用的模型，请检查 Paseo 的 Provider 配置。</Text>
            ) : (
              <>
                <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingVertical: 2 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setCollapsedGroups(
                        allCollapsed
                          ? {}
                          : Object.fromEntries(modelGroups.map((group) => [group.provider, true])),
                      )
                    }
                  >
                    <Text style={styles.link}>{allCollapsed ? "展开全部" : "全部收起"}</Text>
                  </Pressable>
                </View>
                <FlatList
                  style={{ flex: 1, minHeight: 0 }}
                  data={modelRows}
                  keyExtractor={(item) => item.key}
                  renderItem={({ item }) =>
                    item.type === "header" ? (
                      <Pressable
                        accessibilityRole="button"
                        style={styles.groupRow}
                        onPress={() => toggleGroupCollapsed(item.provider)}
                      >
                        <Icon
                          name={item.collapsed ? "ChevronRight" : "ChevronDown"}
                          size={14}
                          color={theme.colors.foregroundMuted}
                        />
                        <Text style={styles.groupHeader}>{item.label}</Text>
                        <View style={{ flex: 1 }} />
                        <Text style={styles.groupCount}>{item.count}</Text>
                      </Pressable>
                    ) : (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.optionRow}
                      onPress={() => {
                        setProvider(item.value);
                        setMode("form");
                      }}
                    >
                        <Text style={styles.optionText} numberOfLines={1}>{item.label}</Text>
                        {provider === item.value ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                      </Pressable>
                    )
                  }
                />
              </>
            )}
          </View>
        </Modal.Content>
      </Modal>
    );
  }

  const canDispatch = repoPath.trim().length > 0 && provider.trim().length > 0 && prompt.trim().length > 0 && !dispatching;

  return (
    <Modal title={`派给 Agent · #${data.id}`} open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        <View style={{ gap: 8 }}>
          {loading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
              <ActivityIndicator color={theme.colors.foreground} />
              <Text style={styles.hint}>正在读取项目与模型列表…</Text>
            </View>
          ) : null}
          {loadError ? (
            <Text style={[styles.hint, { color: theme.colors.statusDanger }]}>
              列表加载失败：{loadError}
            </Text>
          ) : null}
          <Pressable accessibilityRole="button" style={styles.row} onPress={() => setMode("repo")}>
            <Text style={styles.rowLabel}>仓库</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{repoLabel || "请选择（先在 Paseo 添加项目）"}</Text>
            <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.row} onPress={() => setMode("model")}>
            <Text style={styles.rowLabel}>模型</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{modelLabel || "请选择"}</Text>
            <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
          </Pressable>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>分支名</Text>
            <TextInput
              style={styles.input}
              placeholder={`tapd/${data.kind}-${data.id}`}
              placeholderTextColor={theme.colors.foregroundMuted}
              value={branchName}
              onChangeText={setBranchName}
            />
          </View>
          <Text style={styles.sectionTitle}>提示词（随任务发给 Agent，可编辑）</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            multiline
            value={prompt}
            onChangeText={setPrompt}
          />
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, !canDispatch ? styles.disabledButton : null]}
              disabled={!canDispatch}
              onPress={() => void dispatch()}
            >
              <Text style={styles.primaryLabel}>{dispatching ? "派发中…" : "派发"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}
