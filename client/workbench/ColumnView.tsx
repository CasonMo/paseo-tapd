import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { boardRpc } from "../../shared/contracts";
import { Chip, formatTime, type WorkbenchTheme } from "./bits";
import { statusTone, toneColor } from "./status-tones";

type BoardData = RpcOutput<typeof boardRpc>;
type ColumnData = BoardData["columns"]["story"];
type EntityItem = ColumnData["items"][number];

const KIND_TITLES: Record<EntityItem["kind"], string> = { story: "需求", task: "任务", bug: "缺陷" };

export function entityKey(entity: { kind: EntityItem["kind"]; id: string }): string {
  return `${entity.kind}-${entity.id}`;
}

export function ColumnView({ column, theme, compact, emptyText, grouped, favorites, linkedKeys, onToggleFavorite, onOpen }: {
  column: ColumnData;
  theme: WorkbenchTheme;
  compact: boolean;
  emptyText: string;
  grouped: boolean;
  favorites: readonly string[];
  linkedKeys: readonly string[];
  onToggleFavorite: (key: string) => void;
  onOpen: (entity: EntityItem) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const ordered = useMemo(() => {
    const isPinned = (item: EntityItem) => favorites.includes(entityKey(item));
    // 稳定排序：收藏置顶，其余保持服务端顺序（修改时间倒序）
    return [...column.items].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
  }, [column.items, favorites]);

  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<string, { status: string; label: string; done: boolean; items: EntityItem[] }>();
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

  function renderCard(item: EntityItem) {
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
  }

  const styles = useMemo<{
    column: ViewStyle;
    header: ViewStyle;
    title: TextStyle;
    count: TextStyle;
    list: ViewStyle;
    error: TextStyle;
    empty: TextStyle;
    group: ViewStyle;
    groupHeader: ViewStyle;
    groupCount: TextStyle;
  }>(() => ({
    column: {
      flex: compact ? undefined : 1,
      minWidth: compact ? undefined : 0,
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
    list: { gap: 8, paddingTop: 2, paddingBottom: 8 },
    error: { color: theme.colors.statusDanger, fontSize: 12, paddingHorizontal: 2, lineHeight: 17 },
    empty: { color: theme.colors.foregroundMuted, fontSize: 12, paddingHorizontal: 2, paddingVertical: 8 },
    group: { gap: 6 },
    groupHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2, paddingHorizontal: 2 },
    groupCount: { color: theme.colors.foregroundMuted, fontSize: 11 },
  }), [theme, compact]);

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{KIND_TITLES[column.kind]}</Text>
      <Text style={styles.count}>
        {column.truncated ? `${column.items.length} / 共 ${column.total} 条` : `共 ${column.total} 条`}
      </Text>
    </View>
  );

  const content = column.error ? (
    <Text style={styles.error}>{column.error}</Text>
  ) : column.items.length === 0 ? (
    <Text style={styles.empty}>{emptyText}</Text>
  ) : grouped && groups ? (
    <>
      {groups.map((group) => (
        <View key={group.status} style={styles.group}>
          <Pressable accessibilityRole="button" style={styles.groupHeader} onPress={() => toggleGroup(group.status)}>
            <Icon
              name={collapsed[group.status] ? "ChevronRight" : "ChevronDown"}
              size={14}
              color={theme.colors.foregroundMuted}
            />
            <Chip
              label={group.label}
              theme={theme}
              tone={statusTone(column.kind, group.status) === "neutral" ? "muted" : "plain"}
              color={toneColor(statusTone(column.kind, group.status), theme)}
            />
            <Text style={styles.groupCount}>{group.items.length}</Text>
          </Pressable>
          {collapsed[group.status] ? null : group.items.map((item) => renderCard(item))}
        </View>
      ))}
    </>
  ) : (
    <>{ordered.map((item) => renderCard(item))}</>
  );

  if (compact) {
    return (
      <View style={styles.column}>
        {header}
        <View style={{ gap: 8 }}>{content}</View>
      </View>
    );
  }
  return (
    <View style={styles.column}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {content}
      </ScrollView>
    </View>
  );
}

function EntityCard({ entity, theme, pinned, linked, onTogglePinned, onPress }: {
  entity: EntityItem;
  theme: WorkbenchTheme;
  pinned: boolean;
  linked: boolean;
  onTogglePinned: () => void;
  onPress: () => void;
}) {
  const tone = statusTone(entity.kind, entity.status);
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
        <Chip
          label={entity.statusLabel}
          theme={theme}
          tone={tone === "neutral" ? "muted" : "plain"}
          color={toneColor(tone, theme)}
        />
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
