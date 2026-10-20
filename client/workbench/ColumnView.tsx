import type { RpcOutput } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { ScrollView, Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { boardRpc } from "../../shared/contracts";
import { Chip, agentStatusColor, formatTime, type WorkbenchTheme } from "./bits";
import type { AgentStatusItem } from "./EntityDetailModal";
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

interface CardActions {
  onToggleFavorite: (key: string) => void;
  onOpen: (entity: BoardEntityItem) => void;
}

/** 看板状态列：一列 = 一个状态 */
export function StatusColumn({ kind, status, label, items, theme, width, favorites, linkedKeys, statusByKey, onToggleFavorite, onOpen }: {
  kind: BoardEntityItem["kind"];
  status: string;
  label: string;
  items: BoardEntityItem[];
  theme: WorkbenchTheme;
  width: number;
  favorites: readonly string[];
  linkedKeys: readonly string[];
  statusByKey: ReadonlyMap<string, AgentStatusItem>;
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
          {ordered.map((item) => (
            <EntityCard
              key={entityKey(item)}
              entity={item}
              theme={theme}
              pinned={favorites.includes(entityKey(item))}
              linked={linkedKeys.includes(entityKey(item))}
              status={statusByKey.get(entityKey(item))}
              onTogglePinned={() => onToggleFavorite(entityKey(item))}
              onPress={() => onOpen(item)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function EntityCard({ entity, theme, pinned, linked, status, onTogglePinned, onPress }: {
  entity: BoardEntityItem;
  theme: WorkbenchTheme;
  pinned: boolean;
  linked: boolean;
  status?: AgentStatusItem;
  onTogglePinned: () => void;
  onPress: () => void;
}) {
  const statusDot = status?.status ? agentStatusColor(status.status, theme) : undefined;
  const styles = useMemo<{ card: ViewStyle; titleRow: ViewStyle; title: TextStyle; idText: TextStyle; meta: ViewStyle; subRow: ViewStyle; sub: TextStyle; storyChip: TextStyle }>(() => ({
    card: {
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      gap: 6,
      opacity: entity.done ? 0.7 : 1,
    },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    title: { color: theme.colors.foreground, fontSize: 13, lineHeight: 18, flex: 1 },
    idText: { color: theme.colors.foregroundMuted, fontSize: 11 },
    meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
    subRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    sub: { color: theme.colors.foregroundMuted, fontSize: 11, flex: 1 },
    storyChip: { color: theme.colors.foregroundMuted, fontSize: 10 },
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
      <Text style={styles.idText}>#{entity.id}</Text>
      <View style={styles.meta}>
        {linked ? (
          <Chip
            label="已关联"
            theme={theme}
            color={theme.colors.accent}
            dot={status?.status ? agentStatusColor(status.status, theme) : undefined}
          />
        ) : null}
        {entity.priority ? <Chip label={entity.priority} theme={theme} /> : null}
        {entity.iterationName ? <Chip label={entity.iterationName} theme={theme} /> : null}
        {entity.kind !== "story" && entity.storyTitle ? (
          <Chip label={`需求：${entity.storyTitle}`} theme={theme} tone="muted" style={{ maxWidth: "100%" }} />
        ) : null}
      </View>
      <View style={styles.subRow}>
        <Text style={styles.sub} numberOfLines={1}>
          {formatTime(entity.modified)}
          {entity.owner ? ` · ${entity.owner}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

/** 类型列（聚合 tab）：一列 = 一个单据类型；支持按状态分组折叠（FlatList 窗口化渲染） */
type GroupInfo = { status: string; label: string; done: boolean; count: number };

type ListEntry =
  | { type: "header"; entryKey: string; group: GroupInfo }
  | { type: "card"; entryKey: string; item: BoardEntityItem };

export function KindColumn({ kind, label, items, total, truncated, theme, flex, width, emptyText, grouped, favorites, linkedKeys, statusByKey, onToggleFavorite, onOpen }: {
  kind: BoardEntityItem["kind"];
  label: string;
  items: BoardEntityItem[];
  total: number;
  truncated: boolean;
  theme: WorkbenchTheme;
  flex: boolean;
  width: number;
  emptyText: string;
  grouped: boolean;
  favorites: readonly string[];
  linkedKeys: readonly string[];
  statusByKey: ReadonlyMap<string, AgentStatusItem>;
  onToggleFavorite: (key: string) => void;
  onOpen: (entity: BoardEntityItem) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const ordered = useMemo(() => sortPinnedFirst(items, favorites), [items, favorites]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, { status: string; label: string; done: boolean; items: BoardEntityItem[] }>();
    for (const item of ordered) {
      const existing = map.get(item.status);
      if (existing) existing.items.push(item);
      else map.set(item.status, { status: item.status, label: item.statusLabel, done: item.done, items: [item] });
    }
    return [...map.values()].sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        b.items.length - a.items.length ||
        a.label.localeCompare(b.label, "zh-Hans-CN"),
    );
  }, [ordered, grouped]);

  function toggleGroup(status: string) {
    setCollapsed((current) => ({ ...current, [status]: !current[status] }));
  }

  const entries = useMemo<ListEntry[]>(() => {
    if (grouped && groups) {
      const rows: ListEntry[] = [];
      for (const group of groups) {
        rows.push({
          type: "header",
          entryKey: `header-${group.status}`,
          group: { status: group.status, label: group.label, done: group.done, count: group.items.length },
        });
        if (!collapsed[group.status]) {
          for (const item of group.items) {
            rows.push({ type: "card", entryKey: entityKey(item), item });
          }
        }
      }
      return rows;
    }
    return ordered.map((item) => ({ type: "card", entryKey: entityKey(item), item }));
  }, [grouped, groups, collapsed, ordered]);

  const styles = useMemo<{ column: ViewStyle; header: ViewStyle; title: TextStyle; count: TextStyle; list: ViewStyle; empty: TextStyle; groupHeader: ViewStyle; groupCount: TextStyle }>(() => ({
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
    groupHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingHorizontal: 2 },
    groupCount: { color: theme.colors.foregroundMuted, fontSize: 11 },
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
          {entries.map((entry) => {
            if (entry.type === "header") {
              const tone = statusTone(kind, entry.group.status);
              return (
                <Pressable key={entry.entryKey} accessibilityRole="button" style={styles.groupHeader} onPress={() => toggleGroup(entry.group.status)}>
                  <Icon
                    name={collapsed[entry.group.status] ? "ChevronRight" : "ChevronDown"}
                    size={14}
                    color={theme.colors.foregroundMuted}
                  />
                  <Chip
                    label={entry.group.label}
                    theme={theme}
                    tone={tone === "neutral" ? "muted" : "plain"}
                    color={toneColor(tone, theme)}
                  />
                  <Text style={styles.groupCount}>{entry.group.count}</Text>
                </Pressable>
              );
            }
            return (
              <EntityCard
                key={entry.entryKey}
                entity={entry.item}
                theme={theme}
                pinned={favorites.includes(entry.entryKey)}
                linked={linkedKeys.includes(entry.entryKey)}
                status={statusByKey.get(entry.entryKey)}
                onTogglePinned={() => onToggleFavorite(entry.entryKey)}
                onPress={() => onOpen(entry.item)}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
