import type { RpcOutput } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { boardRpc } from "../../shared/contracts";
import { Chip, formatTime, type WorkbenchTheme } from "./bits";
import { statusTone, toneColor } from "./status-tones";

type BoardData = RpcOutput<typeof boardRpc>;
export type BoardEntityItem = BoardData["columns"]["story"]["items"][number];

export function entityKey(entity: { kind: BoardEntityItem["kind"]; id: string }): string {
  return `${entity.kind}-${entity.id}`;
}

function sortPinnedFirst(items: readonly BoardEntityItem[], favorites: readonly string[]): BoardEntityItem[] {
  const isPinned = (item: BoardEntityItem) => favorites.includes(entityKey(item));
  // 稳定排序：收藏置顶，其余保持服务端顺序（修改时间倒序）
  return [...items].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
}

/** 看板状态列：一列 = 一个状态 */
export function StatusColumn({ kind, status, label, items, theme, width, favorites, linkedKeys, onToggleFavorite, onOpen }: {
  kind: BoardEntityItem["kind"];
  status: string;
  label: string;
  items: BoardEntityItem[];
  theme: WorkbenchTheme;
  width: number;
  favorites: readonly string[];
  linkedKeys: readonly string[];
  onToggleFavorite: (key: string) => void;
  onOpen: (entity: BoardEntityItem) => void;
}) {
  const ordered = useMemo(() => sortPinnedFirst(items, favorites), [items, favorites]);

  const tone = statusTone(kind, status);

  const styles = useMemo<{ column: ViewStyle; header: ViewStyle; count: TextStyle; list: ViewStyle; empty: TextStyle }>(() => ({
    column: {
      width,
      gap: 8,
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
    },
    header: { flexDirection: "row", alignItems: "center", gap: 8 },
    count: { color: theme.colors.foregroundMuted, fontSize: 12 },
    list: { gap: 8, paddingBottom: 4 },
    empty: { color: theme.colors.foregroundMuted, fontSize: 12, paddingHorizontal: 2, paddingVertical: 6 },
  }), [theme, width]);

  return (
    <View style={styles.column}>
      <View style={styles.header}>
        <Chip
          label={label}
          theme={theme}
          tone={tone === "neutral" ? "muted" : "plain"}
          color={toneColor(tone, theme)}
        />
        <View style={{ flex: 1 }} />
        <Text style={styles.count}>{items.length}</Text>
      </View>
      {ordered.length === 0 ? (
        <Text style={styles.empty}>没有条目</Text>
      ) : (
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={styles.list}>
          {ordered.map((item) => {
            const key = entityKey(item);
            return (
              <EntityCard
                key={key}
                entity={item}
                theme={theme}
                pinned={favorites.includes(key)}
                linked={linkedKeys.includes(key)}
                onTogglePinned={() => onToggleFavorite(key)}
                onPress={() => onOpen(item)}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function EntityCard({ entity, theme, pinned, linked, onTogglePinned, onPress }: {
  entity: BoardEntityItem;
  theme: WorkbenchTheme;
  pinned: boolean;
  linked: boolean;
  onTogglePinned: () => void;
  onPress: () => void;
}) {
  const styles = useMemo<{ card: ViewStyle; titleRow: ViewStyle; title: TextStyle; meta: ViewStyle; sub: TextStyle }>(() => ({
    card: {
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      gap: 6,
      opacity: entity.done ? 0.7 : 1,
    },
    titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    title: { color: theme.colors.foreground, fontSize: 13, lineHeight: 18, flex: 1 },
    meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
    sub: { color: theme.colors.foregroundMuted, fontSize: 11 },
  }), [theme, entity.done]);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {entity.title}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onTogglePinned}>
          <Icon name="Star" size={15} color={pinned ? theme.colors.accent : theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <View style={styles.meta}>
        {linked ? <Chip label="已派发" theme={theme} color={theme.colors.accent} /> : null}
        {entity.priority ? <Chip label={entity.priority} theme={theme} /> : null}
        {entity.iterationName ? <Chip label={entity.iterationName} theme={theme} /> : null}
      </View>
      <Text style={styles.sub} numberOfLines={1}>
        #{entity.id} · {formatTime(entity.modified)}
        {entity.owner ? ` · ${entity.owner}` : ""}
      </Text>
    </Pressable>
  );
}

/** 类型列（聚合 tab）：一列 = 一个单据类型 */
export function KindColumn({ label, items, total, truncated, theme, flex, width, emptyText, favorites, linkedKeys, onToggleFavorite, onOpen }: {
  label: string;
  items: BoardEntityItem[];
  total: number;
  truncated: boolean;
  theme: WorkbenchTheme;
  flex: boolean;
  width: number;
  emptyText: string;
  favorites: readonly string[];
  linkedKeys: readonly string[];
  onToggleFavorite: (key: string) => void;
  onOpen: (entity: BoardEntityItem) => void;
}) {
  const ordered = useMemo(() => sortPinnedFirst(items, favorites), [items, favorites]);

  const styles = useMemo<{ column: ViewStyle; header: ViewStyle; title: TextStyle; count: TextStyle; list: ViewStyle; empty: TextStyle }>(() => ({
    column: {
      flex: flex ? 1 : undefined,
      width: flex ? undefined : width,
      minWidth: flex ? 0 : undefined,
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      gap: 8,
    },
    header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 2 },
    title: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600" },
    count: { color: theme.colors.foregroundMuted, fontSize: 12 },
    list: { gap: 8, paddingBottom: 4 },
    empty: { color: theme.colors.foregroundMuted, fontSize: 12, paddingHorizontal: 2, paddingVertical: 6 },
  }), [theme, flex, width]);

  return (
    <View style={styles.column}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.count}>
          {truncated ? `${items.length} / 共 ${total} 条` : `共 ${total} 条`}
        </Text>
      </View>
      {ordered.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={styles.list}>
          {ordered.map((item) => {
            const key = entityKey(item);
            return (
              <EntityCard
                key={key}
                entity={item}
                theme={theme}
                pinned={favorites.includes(key)}
                linked={linkedKeys.includes(key)}
                onTogglePinned={() => onToggleFavorite(key)}
                onPress={() => onOpen(item)}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
