import { useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { boardRpc, effectiveViews, filterOptionsRpc, resolveView, tapdSettings, type EntityKind, type TapdFilters, type TapdLink, type TapdView } from "../../shared/contracts";
import { Chip, ToolbarButton } from "./bits";
import { ColumnPickerModal } from "./ColumnPickerModal";
import { KindColumn, StatusColumn, type BoardEntityItem } from "./ColumnView";
import { CreateEntityModal, type CreatedEntity } from "./CreateEntityModal";
import { DispatchModal } from "./DispatchModal";
import {
  EntityDetailModal,
  EntityDetailOverlay,
  type DetailExtras,
  type DetailTarget,
  type EntityDetailData,
} from "./EntityDetailModal";
import { CommentModal, StatusModal } from "./EntityWriteBack";
import { FilterBar } from "./FilterBar";
import { SettingsModal } from "./SettingsForm";

const KINDS = ["story", "task", "bug"] as const;

const KIND_TITLES: Record<EntityKind, string> = { story: "需求", task: "任务", bug: "缺陷" };

type ActiveTab = EntityKind | "all";

function filtersEqual(a: TapdFilters, b: TapdFilters): boolean {
  return (
    a.keyword === b.keyword &&
    a.ownerMode === b.ownerMode &&
    a.owner === b.owner &&
    a.creator === b.creator &&
    a.statusScope === b.statusScope &&
    a.iterationId === b.iterationId &&
    a.modifiedWithinDays === b.modifiedWithinDays &&
    a.priorities.join("|") === b.priorities.join("|") &&
    a.severities.join("|") === b.severities.join("|") &&
    a.label === b.label &&
    JSON.stringify(a.conditions) === JSON.stringify(b.conditions)
  );
}

export function WorkbenchScreen({ theme, layout, navigation }: PluginScreenProps) {
  const rpc = useRpc(boardRpc);
  const settings = useSettings(tapdSettings);
  const toast = useToast();
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TapdFilters | null>(null);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");
  const [detailVersion, setDetailVersion] = useState(0);
  const [dispatchTarget, setDispatchTarget] = useState<EntityDetailData | null>(null);
  const [commentTarget, setCommentTarget] = useState<EntityDetailData | null>(null);
  const [statusTarget, setStatusTarget] = useState<EntityDetailData | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [boardHeight, setBoardHeight] = useState(0);

  useEffect(() => {
    if (settings.status === "ready" && filters === null) {
      setFilters({ ...resolveView(settings.values, "").filters });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.status]);

  const board = useQuery({
    queryKey: ["tapd-board", filters ? JSON.stringify(filters) : "none"],
    queryFn: () => rpc({ filters: filters ?? undefined }),
    enabled: filters !== null,
    staleTime: 30_000,
    retry: 1,
  });

  const fetchOptions = useRpc(filterOptionsRpc);
  const optionsQuery = useQuery({
    queryKey: ["tapd-filter-options"],
    queryFn: () => fetchOptions({}),
    staleTime: 600_000,
    retry: 1,
  });

  const handleFiltersChange = useCallback((patch: Partial<TapdFilters>) => {
    setFilters((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const styles = useMemo<{
    screen: ViewStyle;
    toolbar: ViewStyle;
    spacer: ViewStyle;
    kanban: ViewStyle;
    center: ViewStyle;
    error: TextStyle;
    hint: TextStyle;
    updated: TextStyle;
    tabRow: ViewStyle;
    modalInput: TextStyle;
    modalActions: ViewStyle;
    primaryButton: ViewStyle;
    primaryLabel: TextStyle;
    secondaryButton: ViewStyle;
    secondaryLabel: TextStyle;
  }>(() => ({
    screen: { flex: 1, backgroundColor: theme.colors.surface0, padding: layout.compact ? 12 : 16, gap: 10 },
    toolbar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    spacer: { flex: 1 },
    kanban: { gap: 12, paddingBottom: 4 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
    error: { color: theme.colors.statusDanger, fontSize: 13, lineHeight: 19, textAlign: "center" },
    hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18, textAlign: "center" },
    updated: { color: theme.colors.foregroundMuted, fontSize: 11 },
    tabRow: { flexDirection: "row", gap: 8 },
    modalInput: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: theme.colors.foreground,
      fontSize: 14,
    },
    modalActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    primaryLabel: { color: theme.colors.accentForeground, fontSize: 13 },
    secondaryButton: { backgroundColor: theme.colors.surface2, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    secondaryLabel: { color: theme.colors.foreground, fontSize: 13 },
  }), [theme, layout.compact]);

  if (settings.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.foreground} />
      </View>
    );
  }
  if (settings.status === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>配置读取失败：{settings.error}</Text>
        <ToolbarButton icon="RefreshCw" label="重试" theme={theme} onPress={() => void settings.reload()} />
      </View>
    );
  }
  if (settings.status === "invalid") {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>插件配置数据无效：{settings.error}</Text>
        <ToolbarButton icon="RotateCcw" label="重置配置" theme={theme} onPress={() => void settings.reset()} />
      </View>
    );
  }

  // 收窄后的设置句柄，供下方闭包使用（闭包不继承外层控制流收窄）
  const readySettings = settings;
  const favorites = readySettings.values.favorites;
  const links = readySettings.values.links;
  const linkedKeys = links.map((link) => link.key);
  const views = effectiveViews(readySettings.values);
  const activeView = resolveView(readySettings.values, activeViewId ?? "");
  const dirty = filters !== null && !filtersEqual(filters, activeView.filters);
  const emptyText = filters?.statusScope === "active" ? "没有进行中的条目" : "没有条目";
  const kindTab: EntityKind | null = activeTab === "all" ? null : activeTab;
  const { pickerStatuses, pickerCounts, columns: statusColumns } = buildStatusColumns(
    kindTab ? board.data?.columns[kindTab]?.items ?? [] : [],
    kindTab ? optionsQuery.data?.statuses[kindTab] ?? [] : [],
    kindTab ? readySettings.values.columns[kindTab] ?? null : null,
  );

  function applyView(view: TapdView) {
    setActiveViewId(view.id);
    setFilters({ ...view.filters });
  }

  function resetFilters() {
    setFilters({ ...activeView.filters });
  }

  async function updateActiveView() {
    if (!filters) return;
    const nextViews = effectiveViews(readySettings.values).map((view) =>
      view.id === activeView.id ? { ...view, filters: { ...filters } } : { ...view },
    );
    const ok = await readySettings.save(
      { ...readySettings.values, views: nextViews, defaultViewId: readySettings.values.defaultViewId || activeView.id },
      readySettings.revision,
    );
    if (ok) toast.show(`已更新视图「${activeView.name}」`, { variant: "success" });
    else toast.error(readySettings.saveError ?? "保存失败，请重试");
  }

  function openSaveView() {
    setNewViewName("");
    setSaveViewOpen(true);
  }

  async function saveNewView() {
    if (!filters) return;
    const name = newViewName.trim() || `视图 ${effectiveViews(readySettings.values).length + 1}`;
    const id = `view-${Date.now().toString(36)}`;
    const nextViews = [...effectiveViews(readySettings.values).map((view) => ({ ...view })), { id, name, filters: { ...filters } }];
    const ok = await readySettings.save(
      { ...readySettings.values, views: nextViews, defaultViewId: readySettings.values.defaultViewId || id },
      readySettings.revision,
    );
    if (ok) {
      toast.show(`已保存视图「${name}」`, { variant: "success" });
      setSaveViewOpen(false);
      setActiveViewId(id);
    } else {
      toast.error(readySettings.saveError ?? "保存失败，请重试");
    }
  }

  async function toggleFavorite(key: string) {
    const current = readySettings.values.favorites;
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    const ok = await readySettings.save({ ...readySettings.values, favorites: next }, readySettings.revision);
    if (!ok) toast.error(readySettings.saveError ?? "保存失败，请重试");
  }

  async function saveColumns(keys: string[] | null) {
    if (activeTab === "all") return;
    const values = readySettings.values;
    const next = { ...values.columns };
    if (keys === null) delete next[activeTab];
    else next[activeTab] = keys;
    const ok = await readySettings.save({ ...values, columns: next }, readySettings.revision);
    if (!ok) {
      toast.error(readySettings.saveError ?? "保存失败，请重试");
    } else {
      setColumnsOpen(false);
    }
  }

  function handleCreated(created: CreatedEntity) {
    setCreateOpen(false);
    setDetail({ kind: created.kind, id: created.id, title: created.title });
    void board.refetch();
  }

  async function handleLinkCreated(input: { link: TapdLink; repoPath: string; provider: string }) {
    const values = readySettings.values;
    const ok = await readySettings.save(
      {
        ...values,
        links: [...values.links, input.link],
        lastRepoPath: input.repoPath,
        lastProvider: input.provider,
      },
      readySettings.revision,
    );
    if (!ok) toast.error(readySettings.saveError ?? "保存关联失败，请重试");
    setDispatchTarget(null);
  }

  async function handleRemoveLink(link: TapdLink) {
    const values = readySettings.values;
    const next = values.links.filter(
      (item) => !(item.key === link.key && item.workspaceId === link.workspaceId),
    );
    const ok = await readySettings.save({ ...values, links: next }, readySettings.revision);
    if (!ok) toast.error(readySettings.saveError ?? "保存失败，请重试");
  }

  function handleWriteDone() {
    setDetailVersion((version) => version + 1);
    void board.refetch();
  }

  const detailExtras: DetailExtras = {
    links,
    navigation,
    refreshToken: detailVersion,
    onLinkCreated: (input) => void handleLinkCreated(input),
    onRemoveLink: (link) => void handleRemoveLink(link),
    onDispatch: (data) => setDispatchTarget(data),
    onComment: (data) => setCommentTarget(data),
    onStatus: (data) => setStatusTarget(data),
  };

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        {views.map((view) => (
          <Chip
            key={view.id}
            label={view.name}
            theme={theme}
            active={view.id === activeView.id}
            onPress={() => applyView(view)}
          />
        ))}
        <Chip label="+ 新增视图" theme={theme} onPress={openSaveView} />
        {dirty ? <Chip label={`更新「${activeView.name}」`} theme={theme} active onPress={() => void updateActiveView()} /> : null}
        <View style={styles.spacer} />
        {board.data ? <Text style={styles.updated}>更新于 {formatFetchedAt(board.data.fetchedAt)}</Text> : null}
        {activeTab !== "all" ? (
          <ToolbarButton icon="Columns3" label="列" theme={theme} onPress={() => setColumnsOpen(true)} />
        ) : null}
        <ToolbarButton icon="Plus" label="新建" theme={theme} onPress={() => setCreateOpen(true)} />
        <ToolbarButton icon="RefreshCw" label="刷新" theme={theme} busy={board.isFetching} onPress={() => void board.refetch()} />
        <ToolbarButton icon="Settings" theme={theme} onPress={() => setSettingsOpen(true)} />
      </View>

      {filters ? <FilterBar theme={theme} filters={filters} onChange={handleFiltersChange} onReset={resetFilters} /> : null}

      {board.isPending || filters === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.foreground} />
        </View>
      ) : board.isError ? (
        <View style={styles.center}>
          <Text style={styles.error}>
            {board.error instanceof Error ? board.error.message : String(board.error)}
          </Text>
          <Text style={styles.hint}>
            若未配置 Token 或项目 ID，请打开设置填写；也可以在 daemon 环境变量中配置 TAPD_TOKEN / TAPD_WORKSPACE_IDS。
          </Text>
          <ToolbarButton icon="Settings" label="打开设置" theme={theme} onPress={() => setSettingsOpen(true)} />
          <ToolbarButton icon="RefreshCw" label="重试" theme={theme} onPress={() => void board.refetch()} />
        </View>
      ) : board.data ? (
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.tabRow}>
            <Chip label="聚合" theme={theme} active={activeTab === "all"} onPress={() => setActiveTab("all")} />
            {KINDS.map((kind) => (
              <Chip
                key={kind}
                label={`${KIND_TITLES[kind]} ${board.data.columns[kind].items.length}`}
                theme={theme}
                active={activeTab === kind}
                onPress={() => setActiveTab(kind)}
              />
            ))}
          </View>
          {activeTab === "all" ? (
            layout.compact ? (
              <View style={{ flex: 1 }} onLayout={(event) => setBoardHeight(event.nativeEvent.layout.height)}>
                <ScrollView
                  horizontal
                  style={{ flex: 1 }}
                  contentContainerStyle={[styles.kanban, boardHeight > 0 ? { height: boardHeight } : null]}
                >
                  {KINDS.map((kind) => (
                    <KindColumn
                      key={kind}
                      label={KIND_TITLES[kind]}
                      items={board.data.columns[kind].items}
                      total={board.data.columns[kind].total}
                      truncated={board.data.columns[kind].truncated}
                      theme={theme}
                      flex={false}
                      width={252}
                      emptyText={emptyText}
                      favorites={favorites}
                      linkedKeys={linkedKeys}
                      onToggleFavorite={(key) => void toggleFavorite(key)}
                      onOpen={(entity) => setDetail({ kind: entity.kind, id: entity.id, title: entity.title })}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={{ flex: 1, flexDirection: "row", gap: 12, minHeight: 0 }}>
                {KINDS.map((kind) => (
                  <KindColumn
                    key={kind}
                    label={KIND_TITLES[kind]}
                    items={board.data.columns[kind].items}
                    total={board.data.columns[kind].total}
                    truncated={board.data.columns[kind].truncated}
                    theme={theme}
                    flex
                    width={300}
                    emptyText={emptyText}
                    favorites={favorites}
                    linkedKeys={linkedKeys}
                    onToggleFavorite={(key) => void toggleFavorite(key)}
                    onOpen={(entity) => setDetail({ kind: entity.kind, id: entity.id, title: entity.title })}
                  />
                ))}
              </View>
            )
          ) : statusColumns.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.hint}>{emptyText}</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} onLayout={(event) => setBoardHeight(event.nativeEvent.layout.height)}>
              <ScrollView
                horizontal
                style={{ flex: 1 }}
                contentContainerStyle={[styles.kanban, boardHeight > 0 ? { height: boardHeight } : null]}
              >
                {statusColumns.map((column) => (
                  <StatusColumn
                    key={column.status}
                    kind={activeTab}
                    status={column.status}
                    label={column.label}
                    items={column.items}
                    theme={theme}
                    width={layout.compact ? 252 : 300}
                    favorites={favorites}
                    linkedKeys={linkedKeys}
                    onToggleFavorite={(key) => void toggleFavorite(key)}
                    onOpen={(entity) => setDetail({ kind: entity.kind, id: entity.id, title: entity.title })}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      ) : null}

      {activeTab !== "all" ? (
        <ColumnPickerModal
          open={columnsOpen}
          onClose={() => setColumnsOpen(false)}
          theme={theme}
          kind={activeTab}
          statuses={pickerStatuses}
          counts={pickerCounts}
          current={readySettings.values.columns[activeTab] ?? null}
          onSave={(keys) => void saveColumns(keys)}
        />
      ) : null}
      {layout.compact ? (
        <EntityDetailModal target={detail} onClose={() => setDetail(null)} theme={theme} extras={detailExtras} />
      ) : null}
      {!layout.compact && detail ? (
        <EntityDetailOverlay target={detail} onClose={() => setDetail(null)} theme={theme} extras={detailExtras} />
      ) : null}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} />
      <CreateEntityModal open={createOpen} onClose={() => setCreateOpen(false)} theme={theme} onCreated={handleCreated} />
      {dispatchTarget ? (
        <DispatchModal
          open
          onClose={() => setDispatchTarget(null)}
          theme={theme}
          data={dispatchTarget}
          defaultRepoPath={readySettings.values.lastRepoPath}
          defaultProvider={readySettings.values.lastProvider}
          onCreated={(input) => void handleLinkCreated(input)}
        />
      ) : null}
      {commentTarget ? (
        <CommentModal
          open
          onClose={() => setCommentTarget(null)}
          theme={theme}
          kind={commentTarget.kind}
          id={commentTarget.id}
          onDone={handleWriteDone}
        />
      ) : null}
      {statusTarget ? (
        <StatusModal
          open
          onClose={() => setStatusTarget(null)}
          theme={theme}
          kind={statusTarget.kind}
          id={statusTarget.id}
          current={statusTarget.status}
          onDone={handleWriteDone}
        />
      ) : null}
      <Modal title="保存为新视图" open={saveViewOpen} onOpenChange={(next) => { if (!next) setSaveViewOpen(false); }}>
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Text style={styles.hint}>把当前全部过滤条件保存为可复用的视图。</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="视图名称，例如：我进行中的缺陷"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={newViewName}
              onChangeText={setNewViewName}
            />
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => setSaveViewOpen(false)}>
                <Text style={styles.secondaryLabel}>取消</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => void saveNewView()}>
                <Text style={styles.primaryLabel}>保存</Text>
              </Pressable>
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );
}

function buildStatusColumns(
  items: readonly BoardEntityItem[],
  canonical: readonly { value: string; label: string }[],
  explicit: readonly string[] | null,
): {
  pickerStatuses: { value: string; label: string }[];
  pickerCounts: Record<string, number>;
  columns: { status: string; label: string; items: BoardEntityItem[] }[];
} {
  const pickerStatuses = canonical.map((status) => ({ value: status.value, label: status.label }));
  const seen = new Set(pickerStatuses.map((status) => status.value));
  for (const item of items) {
    if (!seen.has(item.status)) {
      seen.add(item.status);
      pickerStatuses.push({ value: item.status, label: item.statusLabel });
    }
  }
  const pickerCounts: Record<string, number> = {};
  for (const item of items) {
    pickerCounts[item.status] = (pickerCounts[item.status] ?? 0) + 1;
  }
  const selected =
    explicit && explicit.length > 0 ? new Set(explicit) : new Set(pickerStatuses.map((status) => status.value));
  const ordered: string[] = [];
  const remaining = new Set(selected);
  for (const status of pickerStatuses) {
    if (remaining.has(status.value)) {
      ordered.push(status.value);
      remaining.delete(status.value);
    }
  }
  for (const value of remaining) ordered.push(value);
  const columns = ordered.map((status) => ({
    status,
    label: pickerStatuses.find((entry) => entry.value === status)?.label ?? status,
    items: items.filter((item) => item.status === status),
  }));
  return { pickerStatuses, pickerCounts, columns };
}

function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
