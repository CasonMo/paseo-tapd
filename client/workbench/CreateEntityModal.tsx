import { useRpc } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { createRpc, filterOptionsRpc, type EntityKind } from "../../shared/contracts";
import { Chip, type WorkbenchTheme } from "./bits";

const KIND_TITLES: Record<EntityKind, string> = { story: "需求", task: "任务", bug: "缺陷" };

export interface CreatedEntity {
  id: string;
  kind: EntityKind;
  url: string;
  title: string;
}

export function CreateEntityModal({ open, onClose, theme, onCreated }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  onCreated: (created: CreatedEntity) => void;
}) {
  const create = useRpc(createRpc);
  const fetchOptions = useRpc(filterOptionsRpc);
  const optionsQuery = useQuery({
    queryKey: ["tapd-filter-options"],
    queryFn: () => fetchOptions({}),
    enabled: open,
    staleTime: 600_000,
    retry: 1,
  });
  const toast = useToast();

  const [kind, setKind] = useState<EntityKind>("story");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState("");
  const [iterationId, setIterationId] = useState("");
  const [mode, setMode] = useState<"form" | "iteration">("form");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setKind("story");
      setTitle("");
      setDescription("");
      setOwner("");
      setPriority("");
      setIterationId("");
      setMode("form");
      setSubmitting(false);
    }
  }, [open]);

  const priorityOptions = useMemo(
    () => (optionsQuery.data?.priorities ?? []).filter((option) => option.kinds.includes(kind)),
    [optionsQuery.data, kind],
  );
  const iterations = optionsQuery.data?.iterations ?? [];
  const iterationLabel = iterationId
    ? iterations.find((item) => item.id === iterationId)?.name ?? iterationId
    : "全部迭代";

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await create({
        kind,
        title: trimmed,
        description: description.trim(),
        owner: owner.trim(),
        priority,
        iterationId,
      });
      toast.show(`已创建「${trimmed}」#${created.id}`, { variant: "success" });
      onCreated({ id: created.id, kind: created.kind, url: created.url, title: trimmed });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const styles = useMemo<{
    row: ViewStyle;
    rowLabel: TextStyle;
    input: TextStyle;
    inputMultiline: TextStyle;
    chips: ViewStyle;
    backRow: ViewStyle;
    link: TextStyle;
    footer: ViewStyle;
    primaryButton: ViewStyle;
    primaryLabel: TextStyle;
    disabledButton: ViewStyle;
    optionRow: ViewStyle;
    optionText: TextStyle;
  }>(() => ({
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    rowLabel: { color: theme.colors.foregroundMuted, fontSize: 13, width: 64 },
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
    inputMultiline: { minHeight: 72, textAlignVertical: "top" },
    chips: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 },
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
  }), [theme]);

  if (mode === "iteration") {
    const rows = [{ id: "", name: "全部迭代", status: "" }, ...iterations];
    return (
      <Modal title="新建单据 · 选择迭代" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <View style={{ flex: 1, minHeight: 0, paddingTop: 8, paddingHorizontal: 14 }}>
            <Pressable accessibilityRole="button" style={styles.backRow} onPress={() => setMode("form")}>
              <Icon name="ChevronLeft" size={16} color={theme.colors.accent} />
              <Text style={styles.link}>返回</Text>
            </Pressable>
            <FlatList
              style={{ flex: 1, minHeight: 0 }}
              data={rows}
              keyExtractor={(item) => item.id || "__all__"}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  style={styles.optionRow}
                  onPress={() => {
                    setIterationId(item.id);
                    setMode("form");
                  }}
                >
                  <Text style={styles.optionText} numberOfLines={1}>
                    {item.id === "" ? item.name : item.status === "done" ? `${item.name}（已关闭）` : item.name}
                  </Text>
                  {iterationId === item.id ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Modal.Content>
      </Modal>
    );
  }

  return (
    <Modal title="新建单据" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        <View style={{ gap: 10 }}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>类型</Text>
            <View style={styles.chips}>
              {(["story", "task", "bug"] as const).map((item) => (
                <Chip
                  key={item}
                  label={KIND_TITLES[item]}
                  theme={theme}
                  active={kind === item}
                  onPress={() => {
                    setKind(item);
                    setPriority("");
                  }}
                />
              ))}
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>标题</Text>
            <TextInput
              style={styles.input}
              placeholder="必填"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View style={[styles.row, { alignItems: "flex-start" }]}>
            <Text style={[styles.rowLabel, { paddingTop: 8 }]}>描述</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="可选，纯文本（保存时自动转 HTML）"
              placeholderTextColor={theme.colors.foregroundMuted}
              multiline
              value={description}
              onChangeText={setDescription}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>处理人</Text>
            <TextInput
              style={styles.input}
              placeholder="昵称，留空则不指定"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={owner}
              onChangeText={setOwner}
            />
          </View>
          {priorityOptions.length > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>优先级</Text>
              <View style={styles.chips}>
                {priorityOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label === option.value ? option.value : option.label}
                    theme={theme}
                    active={priority === option.value}
                    onPress={() => setPriority(priority === option.value ? "" : option.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" style={styles.optionRow} onPress={() => setMode("iteration")}>
            <Text style={[styles.optionText, { flex: undefined, width: 64, color: theme.colors.foregroundMuted, fontSize: 13 }]}>迭代</Text>
            <Text style={styles.optionText} numberOfLines={1}>{iterationLabel}</Text>
            <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
          </Pressable>
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, !title.trim() || submitting ? styles.disabledButton : null]}
              disabled={!title.trim() || submitting}
              onPress={() => void submit()}
            >
              <Text style={styles.primaryLabel}>{submitting ? "创建中…" : "创建"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}
