import { useMemo, useState } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { Pressable, Text, View } from "react-native";
import type { WorkbenchTheme } from "./bits";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const WEEK_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** 挂载创建的日期字段选择：单选月历（同款思路来自 agent-usage 的自写日历，无宿主 picker 依赖） */
export function DatePicker({ theme, value, onChange }: {
  theme: WorkbenchTheme;
  value: string;
  onChange: (next: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const anchor = parseKey(value) ?? new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  const styles = useMemo(
    () =>
      ({
        section: { backgroundColor: theme.colors.surface1, borderRadius: 10, padding: 12, gap: 8 },
        header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
        navButton: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.colors.surface0 },
        navText: { fontSize: 14, color: theme.colors.foreground },
        monthText: { fontSize: 13, fontWeight: "600", color: theme.colors.foreground },
        weekRow: { flexDirection: "row" },
        weekLabel: { flex: 1, textAlign: "center", fontSize: 10, color: theme.colors.foregroundMuted },
        row: { flexDirection: "row" },
        cell: { flex: 1, alignItems: "center", paddingVertical: 3 },
        cellInner: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
        cellSelected: { backgroundColor: theme.colors.accent },
        cellText: { fontSize: 12, color: theme.colors.foreground },
        cellTextMuted: { color: theme.colors.foregroundMuted, opacity: 0.45 },
        cellTextSelected: { color: theme.colors.accentForeground, fontWeight: "600" },
        cellTextToday: { color: theme.colors.accent, fontWeight: "600" },
        footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
        valueText: { fontSize: 11, color: theme.colors.foregroundMuted },
      }) satisfies Record<string, ViewStyle | TextStyle>,
    [theme],
  );

  const weeks = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = addDays(first, -offset);
    const rows: Array<Array<{ key: string; day: number; inMonth: boolean }>> = [];
    for (let row = 0; row < 6; row += 1) {
      const cells: Array<{ key: string; day: number; inMonth: boolean }> = [];
      for (let column = 0; column < 7; column += 1) {
        const date = addDays(start, row * 7 + column);
        cells.push({ key: dateKeyOf(date), day: date.getDate(), inMonth: date.getMonth() === month.getMonth() });
      }
      rows.push(cells);
    }
    return rows;
  }, [month]);

  const todayKey = dateKeyOf(new Date());

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="上一月"
          style={styles.navButton}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.monthText}>{month.getFullYear()} 年 {month.getMonth() + 1} 月</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="下一月"
          style={styles.navButton}
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEK_LABELS.map((label) => (
          <Text key={label} style={styles.weekLabel}>
            {label}
          </Text>
        ))}
      </View>
      {weeks.map((week, index) => (
        <View key={index} style={styles.row}>
          {week.map((cell) => {
            const selected = cell.key === value;
            const isToday = cell.key === todayKey;
            return (
              <Pressable key={cell.key} style={styles.cell} onPress={() => onChange(cell.key)}>
                <View style={[styles.cellInner, selected && styles.cellSelected]}>
                  <Text
                    style={[
                      styles.cellText,
                      !cell.inMonth && styles.cellTextMuted,
                      isToday && !selected && styles.cellTextToday,
                      selected && styles.cellTextSelected,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.footerRow}>
        <Text style={styles.valueText} numberOfLines={1}>
          {parseKey(value) ? value : "未选择"}
        </Text>
        {parseKey(value) ? (
          <Pressable accessibilityRole="button" style={styles.navButton} onPress={() => onChange("")}>
            <Text style={styles.navText}>清除</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
