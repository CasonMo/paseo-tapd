import { useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { boardRpc, effectiveViews, resolveView, tapdSettings, type EntityKind, type TapdFilters, type TapdLink, type TapdView } from "../../shared/contracts";
import { Chip, ToolbarButton } from "./bits";
import { ColumnView } from "./ColumnView";
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
  const [activeTab, setActiveTab] = useState<EntityKind>("story");
  const [detailVersion, setDetailVersion] = useState(0);
  const [dispatchTarget, setDispatchTarget] = useState<EntityDetailData | null>(null);
  const [commentTarget, setCommentTarget] = useState<EntityDetailData | null>(null);
  const [statusTarget, setStatusTarget] = useState<EntityDetailData | null>(null);

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

  const styles = useMemo<{
    screen: ViewStyle;
    toolbar: ViewStyle;
    spacer: ViewStyle;
    columns: ViewStyle;
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
    columns: { flex: 1, flexDirection: "row", gap: 12, minHeight: 0 },
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
  const groupByStatus = readySettings.values.groupByStatus;
  const links = readySettings.values.links;
  const linkedKeys = links.map((link) => link.key);
  const views = effectiveViews(readySettings.values);
  const activeView = resolveView(readySettings.values, activeViewId ?? "");
  const dirty = filters !== null && !filtersEqual(filters, activeView.filters);
  const emptyText = filters?.statusScope === "active" ? "没有进行中的条目" : "没有条目";

  function applyView(view: TapdView) {
    setActiveViewId(view.id);
    setFilters({ ...view.filters });
  }

  const handleFiltersChange = useCallback((patch: Partial<TapdFilters>) => {
    setFilters((current) => (current ? { ...current, ...patch } : current));
  }, []);

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

  async function toggleGrouped() {
    const ok = await readySettings.save(
      { ...readySettings.values, groupByStatus: !readySettings.values.groupByStatus },
      readySettings.revision,
    );
    if (!ok) toast.error(readySettings.saveError ?? "保存失败，请重试");
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
        <ToolbarButton icon="Rows3" label="分组" theme={theme} active={groupByStatus} onPress={() => void toggleGrouped()} />
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
        layout.compact ? (
          <View style={{ flex: 1, gap: 8 }}>
            <View style={styles.tabRow}>
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
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
              <ColumnView
                column={board.data.columns[activeTab]}
                theme={theme}
                compact
                grouped={groupByStatus}
                favorites={favorites}
                linkedKeys={linkedKeys}
                onToggleFavorite={(key) => void toggleFavorite(key)}
                emptyText={emptyText}
                onOpen={(entity) => setDetail({ kind: entity.kind, id: entity.id, title: entity.title })}
              />
            </ScrollView>
          </View>
        ) : (
          <View style={styles.columns}>
            {KINDS.map((kind) => (
              <ColumnView
                key={kind}
                column={board.data.columns[kind]}
                theme={theme}
                compact={false}
                grouped={groupByStatus}
                favorites={favorites}
                linkedKeys={linkedKeys}
                onToggleFavorite={(key) => void toggleFavorite(key)}
                emptyText={emptyText}
                onOpen={(entity) => setDetail({ kind: entity.kind, id: entity.id, title: entity.title })}
              />
            ))}
          </View>
        )
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

function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
