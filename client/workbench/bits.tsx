import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";

export type WorkbenchTheme = PluginHostProps["theme"];

export function formatTime(value: string): string {
  return value.length >= 16 ? value.slice(5, 16) : value;
}

/** ISO 时间戳 → 本地 "MM-DD HH:mm"（无效/空返回 ""） */
export function formatIsoTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function withAlpha(color: string, alphaPercent: number): string | null {
  const alpha = Math.round((alphaPercent / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  const hex6 = /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(color.trim());
  if (hex6) return `#${hex6[1]}${alpha}`;
  const hex3 = /^#([0-9a-fA-F]{3})$/.exec(color.trim());
  if (hex3) {
    const [r, g, b] = hex3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}${alpha}`;
  }
  return null;
}

/** Agent 生命周期状态 → 圆点颜色（未知/空按 muted 处理） */
export function agentStatusColor(status: string | undefined, theme: WorkbenchTheme): string {
  if (status === "running") return theme.colors.statusSuccess;
  if (status === "error") return theme.colors.statusDanger;
  if (status === "initializing") return theme.colors.statusWarning;
  return theme.colors.foregroundMuted;
}

export function Chip({ label, theme, tone = "plain", active = false, color, onPress, style, dot }: {
  label: string;
  theme: WorkbenchTheme;
  tone?: "plain" | "muted" | "accent";
  active?: boolean;
  /** 指定色相：浅色半透明底 + 同色文字。未指定时沿用 tone 的灰/强调样式。 */
  color?: string;
  onPress?: () => void;
  /** 外层附加样式（如 maxWidth 限制超长标签省略） */
  style?: ViewStyle;
  /** 标签内的状态点（传入颜色才渲染） */
  dot?: string;
}) {
  const styles = useMemo<{ chip: ViewStyle; text: TextStyle }>(() => {
    if (color) {
      return {
        chip: {
          backgroundColor: withAlpha(color, 16) ?? theme.colors.surface2,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
        },
        text: { color, fontSize: 12 },
      };
    }
    const isAccent = tone === "accent" || active;
    return {
      chip: {
        backgroundColor: isAccent ? theme.colors.accent : theme.colors.surface2,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
      },
      text: {
        color: isAccent
          ? theme.colors.accentForeground
          : tone === "muted"
            ? theme.colors.foregroundMuted
            : theme.colors.foreground,
        fontSize: 12,
      },
    };
  }, [theme, tone, active, color]);
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /> : null}
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.chip, style]}>
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.chip, style]}>{body}</View>;
}

export function ToolbarButton({ icon, label, onPress, theme, busy = false, active = false }: {
  icon: string;
  label?: string;
  onPress: () => void;
  theme: WorkbenchTheme;
  busy?: boolean;
  active?: boolean;
}) {
  const styles = useMemo<{ button: ViewStyle; label: TextStyle }>(() => ({
    button: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
      opacity: busy ? 0.5 : 1,
    },
    label: { color: active ? theme.colors.accentForeground : theme.colors.foreground, fontSize: 12 },
  }), [theme, busy, active]);
  const foreground = active ? theme.colors.accentForeground : theme.colors.foreground;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Icon name={icon} size={14} color={foreground} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}
