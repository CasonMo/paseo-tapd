import { Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { type EntityKind } from "../../shared/contracts";
import { Chip, type WorkbenchTheme } from "./bits";
import { statusTone, toneColor } from "./status-tones";

const KIND_TITLES: Record<EntityKind, string> = { story: "需求", task: "任务", bug: "缺陷" };

/** 选择看板显示哪些状态列 */
export function ColumnPickerModal({ open, onClose, theme, kind, statuses, counts, current, onSave }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  kind: EntityKind;
  statuses: readonly { value: string; label: string }[];
  counts: Record<string, number>;
  current: string[] | null;
  onSave: (keys: string[] | null) => void;
}) {
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, boolean> = {};
    for (const status of statuses) {
      const on = current ? current.includes(status.value) : true;
      if (on) next[status.value] = true;
    }
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedCount = statuses.filter((status) => draft[status.value]).length;

  const styles = useMemo<{
    row: ViewStyle;
    count: TextStyle;
    hint: TextStyle;
    footer: ViewStyle;
    link: TextStyle;
    primaryButton: ViewStyle;
    primaryLabel: TextStyle;
    disabledButton: ViewStyle;
  }>(() => ({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    count: { color: theme.colors.foregroundMuted, fontSize: 11 },
    hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
    footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10 },
    link: { color: theme.colors.accent, fontSize: 13 },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    primaryLabel: { color: theme.colors.accentForeground, fontSize: 13 },
    disabledButton: { opacity: 0.5 },
  }), [theme]);

  return (
    <Modal title={`选择状态列 · ${KIND_TITLES[kind]}`} open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        {statuses.length === 0 ? (
          <Text style={styles.hint}>暂无可选状态。</Text>
        ) : (
          statuses.map((status) => {
            const on = draft[status.value] === true;
            const tone = statusTone(kind, status.value);
            return (
              <Pressable
                key={status.value}
                accessibilityRole="button"
                style={styles.row}
                onPress={() =>
                  setDraft((currentDraft) => ({ ...currentDraft, [status.value]: !currentDraft[status.value] }))
                }
              >
                <Chip
                  label={status.label}
                  theme={theme}
                  tone={tone === "neutral" ? "muted" : "plain"}
                  color={toneColor(tone, theme)}
                />
                <View style={{ flex: 1 }} />
                <Text style={styles.count}>{counts[status.value] ?? 0} 条</Text>
                {on ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
              </Pressable>
            );
          })
        )}
        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={() => onSave(null)}>
            <Text style={styles.link}>恢复默认（全部状态）</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, selectedCount === 0 ? styles.disabledButton : null]}
            disabled={selectedCount === 0}
            onPress={() => onSave(statuses.filter((status) => draft[status.value]).map((status) => status.value))}
          >
            <Text style={styles.primaryLabel}>保存</Text>
          </Pressable>
        </View>
      </Modal.Content>
    </Modal>
  );
}
