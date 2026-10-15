import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { addCommentRpc, filterOptionsRpc, updateStatusRpc, type EntityKind } from "../../shared/contracts";
import { type WorkbenchTheme } from "./bits";

/** 快捷修改单据状态（状态选项来自字段信息，动态获取） */
export function StatusModal({ open, onClose, theme, kind, id, current, onDone }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  kind: EntityKind;
  id: string;
  current: string;
  onDone: () => void;
}) {
  const fetchOptions = useRpc(filterOptionsRpc);
  const updateStatus = useRpc(updateStatusRpc);
  const toast = useToast();
  const [submitting, setSubmitting] = useState("");

  const optionsQuery = useQuery({
    queryKey: ["tapd-filter-options"],
    queryFn: () => fetchOptions({}),
    enabled: open,
    staleTime: 600_000,
    retry: 1,
  });

  useEffect(() => {
    if (!open) setSubmitting("");
  }, [open]);

  const options = optionsQuery.data?.statuses[kind] ?? [];

  async function apply(value: string, label: string) {
    if (submitting) return;
    setSubmitting(value);
    try {
      await updateStatus({ kind, id, status: value });
      toast.show(`状态已更新为「${label}」`, { variant: "success" });
      onDone();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting("");
    }
  }

  const styles = useMemo<{ row: ViewStyle; rowText: TextStyle; hint: TextStyle; center: ViewStyle }>(() => ({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowText: { color: theme.colors.foreground, fontSize: 13, flex: 1 },
    hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
    center: { alignItems: "center", padding: 20 },
  }), [theme]);

  return (
    <Modal title={`修改状态 · #${id}`} open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        {optionsQuery.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.foreground} />
          </View>
        ) : options.length === 0 ? (
          <Text style={styles.hint}>没有可用的状态选项，请稍后重试。</Text>
        ) : (
          options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              style={styles.row}
              onPress={() => void apply(option.value, option.label)}
            >
              <Text style={styles.rowText}>{option.label}</Text>
              {current === option.value ? (
                <Icon name="Check" size={16} color={theme.colors.foregroundMuted} />
              ) : submitting === option.value ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : null}
            </Pressable>
          ))
        )}
      </Modal.Content>
    </Modal>
  );
}

/** 写回评论（纯文本自动转 HTML） */
export function CommentModal({ open, onClose, theme, kind, id, onDone }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  kind: EntityKind;
  id: string;
  onDone: () => void;
}) {
  const addComment = useRpc(addCommentRpc);
  const toast = useToast();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setText("");
      setSubmitting(false);
    }
  }, [open]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await addComment({ kind, id, text: trimmed });
      toast.show("评论已写入 TAPD", { variant: "success" });
      onDone();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const styles = useMemo<{ input: TextStyle; footer: ViewStyle; primaryButton: ViewStyle; primaryLabel: TextStyle; disabledButton: ViewStyle }>(() => ({
    input: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: theme.colors.foreground,
      fontSize: 13,
      minHeight: 120,
      textAlignVertical: "top",
    },
    footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 8 },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    primaryLabel: { color: theme.colors.accentForeground, fontSize: 13 },
    disabledButton: { opacity: 0.5 },
  }), [theme]);

  return (
    <Modal title={`写回评论 · #${id}`} open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        <View style={{ gap: 10 }}>
          <TextInput
            style={styles.input}
            placeholder="输入要写回 TAPD 的内容（纯文本，自动转 HTML）"
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
            value={text}
            onChangeText={setText}
          />
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, !text.trim() || submitting ? styles.disabledButton : null]}
              disabled={!text.trim() || submitting}
              onPress={() => void submit()}
            >
              <Text style={styles.primaryLabel}>{submitting ? "提交中…" : "提交"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}
