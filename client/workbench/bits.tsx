import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";

export type WorkbenchTheme = PluginHostProps["theme"];

/** 依据前景色亮度判断当前主题是否为暗色（浮窗底色跟随明暗切换） */
function themeIsDark(theme: WorkbenchTheme): boolean {
  const raw = theme.colors.foreground.trim();
  const hex6 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(raw);
  const hex3 = /^#([0-9a-fA-F]{3})$/.exec(raw);
  const [r, g, b] = hex6
    ? hex6[1].match(/../g)?.map((h) => parseInt(h, 16)) ?? [0, 0, 0]
    : hex3
      ? hex3[1].split("").map((c) => parseInt(c + c, 16))
      : [0, 0, 0];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/**
 * 省略文本（numberOfLines）的悬停全文提示：
 * 桌面端鼠标悬停浮窗展示全文；无 onPress，点击事件继续冒泡给外层按钮。
 */
export function HoverTip({ tip, theme, children, style, top = 30, tipWidth }: {
  /** 全文内容；为空时不显示提示 */
  tip: string;
  theme: WorkbenchTheme;
  /** 被包裹的内容（已带 numberOfLines 截断的 Text/Chip 等） */
  children: ReactNode;
  /** 包裹层样式（如 flex:1 使内部 Text 撑满） */
  style?: ViewStyle;
  /** 浮窗相对包裹层顶部的偏移 */
  top?: number;
  /** 浮窗固定宽度；不传时撑满包裹层宽度 */
  tipWidth?: number;
}) {
  const [hovering, setHovering] = useState(false);
  const show = hovering && tip.trim().length > 0;
  const dark = themeIsDark(theme);
  const styles = useMemo<{ box: ViewStyle; text: TextStyle }>(() => ({
    box: {
      position: "absolute",
      top,
      left: tipWidth == null ? 0 : undefined,
      right: tipWidth == null ? 0 : undefined,
      width: tipWidth,
      zIndex: 50,
      backgroundColor: dark ? "#26282f" : "#f7f7f9",
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      // 桌面端阴影（react-native-web），提升与卡片底色的区分度
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    text: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18 },
  }), [theme, top, tipWidth, dark]);
  return (
    <View style={[{ zIndex: 40 }, style]}>
      <Pressable onHoverIn={() => setHovering(true)} onHoverOut={() => setHovering(false)}>
        {children}
      </Pressable>
      {show ? (
        <View style={styles.box}>
          <Text style={styles.text} selectable>
            {tip}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function formatTime(value: string): string {
  return value.length >= 16 ? value.slice(5, 16) : value;
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

export function Chip({ label, theme, tone = "plain", active = false, color, onPress, style }: {
  label: string;
  theme: WorkbenchTheme;
  tone?: "plain" | "muted" | "accent";
  active?: boolean;
  /** 指定色相：浅色半透明底 + 同色文字。未指定时沿用 tone 的灰/强调样式。 */
  color?: string;
  onPress?: () => void;
  /** 外层附加样式（如 maxWidth 限制超长标签省略） */
  style?: ViewStyle;
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
    <Text style={styles.text} numberOfLines={1}>
      {label}
    </Text>
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
