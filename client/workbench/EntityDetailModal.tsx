import type { RpcOutput } from "@getpaseo/plugin";
import { openExternalUrl, usePaseo, useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, Modal, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle, type ViewStyle } from "react-native";
import { agentStatusRpc, entityRpc, type EntityKind, type TapdLink } from "../../shared/contracts";
import { Chip, agentStatusColor, formatTime, formatIsoTime, type WorkbenchTheme } from "./bits";
import { statusTone, toneColor } from "./status-tones";

export interface DetailTarget {
  kind: EntityKind;
  id: string;
  title: string;
}

export type EntityDetailData = RpcOutput<typeof entityRpc>;
export type AgentStatusItem = NonNullable<RpcOutput<typeof agentStatusRpc>["items"]>[number];

export interface DetailExtras {
  links: readonly TapdLink[];
  navigation?: PluginScreenProps["navigation"];
  refreshToken: number;
  onLinkCreated?: (input: { link: TapdLink; repoPath?: string; provider?: string }) => void;
  onBindAgent?: (data: EntityDetailData) => void;
  onRemoveLink?: (link: TapdLink) => void;
  onDispatch?: (data: EntityDetailData) => void;
  onComment?: (data: EntityDetailData) => void;
  onStatus?: (data: EntityDetailData) => void;
  /** 在详情面板中打开另一个单据（点击需求下的任务/缺陷行） */
  onOpenEntity?: (target: DetailTarget) => void;
}

/** 宽屏：居中浮窗（宽度自主控制，遮罩点击 / X 关闭） */
export function EntityDetailOverlay({ target, onClose, theme, extras }: {
  target: DetailTarget;
  onClose: () => void;
  theme: WorkbenchTheme;
  extras: DetailExtras;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const dialogWidth = Math.min(780, Math.max(420, Math.round(windowWidth * 0.55)));

  const styles = useMemo<{
    root: ViewStyle;
    scrim: ViewStyle;
    dialog: ViewStyle;
    header: ViewStyle;
    headerTitle: TextStyle;
    body: ViewStyle;
  }>(() => ({
    root: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.45)" },
    dialog: {
      width: dialogWidth,
      maxHeight: Math.round(windowHeight * 0.85),
      backgroundColor: theme.colors.surface1,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 12,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: { color: theme.colors.foreground, fontSize: 13, flex: 1 },
    body: { padding: 16 },
  }), [theme, dialogWidth, windowHeight]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="关闭详情" style={styles.scrim} onPress={onClose} />
      <View style={styles.dialog}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            #{target.id} · {target.title}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
            <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
          </Pressable>
        </View>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={styles.body}>
          <DetailBody target={target} theme={theme} extras={extras} />
        </ScrollView>
      </View>
    </View>
  );
}

/** 移动端/窄窗口：底部抽屉 */
export function EntityDetailModal({ target, onClose, theme, extras }: {
  target: DetailTarget | null;
  onClose: () => void;
  theme: WorkbenchTheme;
  extras: DetailExtras;
}) {
  const open = target !== null;
  const modalTitle = target
    ? `#${target.id} ${target.title.length > 20 ? `${target.title.slice(0, 20)}…` : target.title}`
    : "TAPD 单据";
  return (
    <Modal
      title={modalTitle}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content>
        <DetailBody target={target} theme={theme} extras={extras} />
      </Modal.Content>
    </Modal>
  );
}

function DetailBody({ target, theme, extras }: { target: DetailTarget | null; theme: WorkbenchTheme; extras: DetailExtras }) {
  const open = target !== null;
  const kind = target?.kind ?? "story";
  const id = target?.id ?? "";
  const rpc = useRpc(entityRpc);
  const toast = useToast();

  const detail = useQuery({
    queryKey: ["tapd-entity", kind, id, extras.refreshToken],
    queryFn: () => rpc({ kind, id }),
    enabled: open && id.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  const agentIds = useMemo(() => {
    if (!open || id === "") return [];
    return [
      ...new Set(
        extras.links
          .filter((link) => link.key === `${kind}-${id}` && link.agentId.trim().length > 0)
          .map((link) => link.agentId),
      ),
    ];
  }, [open, id, kind, extras.links]);

  const statusRpc = useRpc(agentStatusRpc);
  const paseo = usePaseo();
  const [agentStatusMap, setAgentStatusMap] = useState<Map<string, AgentStatusItem>>(new Map());
  const lastStatusFetch = useRef(0);

  const fetchAgentStatus = useCallback(() => {
    if (agentIds.length === 0) return;
    lastStatusFetch.current = Date.now();
    void statusRpc({ agentIds })
      .then((result) => {
        const next = new Map<string, AgentStatusItem>();
        for (const item of result.items ?? []) next.set(item.agentId, item);
        setAgentStatusMap(next);
      })
      .catch(() => {
        // 状态查询失败不影响详情其余内容
      });
  }, [agentIds, statusRpc]);

  // 打开面板 / 关联变化时取一次
  useEffect(() => {
    if (agentIds.length === 0) {
      setAgentStatusMap(new Map());
      return;
    }
    fetchAgentStatus();
  }, [agentIds, fetchAgentStatus]);

  // agent 事件流 → 节流重拉（实时状态点）
  useEffect(() => {
    if (agentIds.length === 0) return;
    return paseo.agents.subscribe(() => {
      if (Date.now() - lastStatusFetch.current < 2000) return;
      fetchAgentStatus();
    });
  }, [paseo, agentIds, fetchAgentStatus]);

  const styles = useMemo<{
    actions: ViewStyle;
    action: ViewStyle;
    actionLabel: TextStyle;
    title: TextStyle;
    metaRow: ViewStyle;
    metaLabel: TextStyle;
    metaValue: TextStyle;
    section: TextStyle;
    linkRow: ViewStyle;
    linkTitle: TextStyle;
    childMeta: TextStyle;
    linkAction: TextStyle;
    linkDanger: TextStyle;
    box: ViewStyle;
    description: TextStyle;
    comment: ViewStyle;
    commentHead: TextStyle;
    commentText: TextStyle;
    error: TextStyle;
    center: ViewStyle;
  }>(() => ({
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    action: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: theme.colors.surface2,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    actionLabel: { color: theme.colors.foreground, fontSize: 13 },
    title: { color: theme.colors.foreground, fontSize: 16, lineHeight: 22, fontWeight: "600" },
    metaRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    metaLabel: { color: theme.colors.foregroundMuted, fontSize: 12, width: 64 },
    metaValue: { color: theme.colors.foreground, fontSize: 12, flex: 1 },
    section: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 },
    linkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    linkTitle: { color: theme.colors.foreground, fontSize: 12, flexShrink: 1 },
    childMeta: { color: theme.colors.foregroundMuted, fontSize: 11 },
    linkAction: { color: theme.colors.accent, fontSize: 12 },
    linkDanger: { color: theme.colors.statusDanger, fontSize: 12 },
    box: {
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      gap: 6,
    },
    description: { color: theme.colors.foreground, fontSize: 13, lineHeight: 20 },
    comment: {
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      gap: 4,
    },
    commentHead: { color: theme.colors.foregroundMuted, fontSize: 11 },
    commentText: { color: theme.colors.foreground, fontSize: 13, lineHeight: 19 },
    error: { color: theme.colors.statusDanger, fontSize: 13, lineHeight: 19 },
    center: { alignItems: "center", padding: 24 },
  }), [theme]);

  const data = detail.data;

  function metaRow(label: string, value: string | null) {
    if (!value) return null;
    return (
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    );
  }

  async function copyLink(url: string) {
    try {
      await copyText(url);
      toast.show("链接已复制", { variant: "success" });
    } catch {
      toast.error("复制失败");
    }
  }

  if (detail.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.foreground} />
      </View>
    );
  }
  if (detail.isError) {
    return (
      <Text style={styles.error}>
        加载失败：{detail.error instanceof Error ? detail.error.message : String(detail.error)}
      </Text>
    );
  }
  if (!data) return null;

  const tone = statusTone(data.kind, data.status);

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>{data.title}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => extras.onDispatch?.(data)}>
          <Icon name="Bot" size={14} color={theme.colors.foreground} />
          <Text style={styles.actionLabel}>派给 Agent</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => extras.onBindAgent?.(data)}>
          <Icon name="Link" size={14} color={theme.colors.foreground} />
          <Text style={styles.actionLabel}>绑定 Agent</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => extras.onComment?.(data)}>
          <Icon name="MessageSquarePlus" size={14} color={theme.colors.foreground} />
          <Text style={styles.actionLabel}>写回评论</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => extras.onStatus?.(data)}>
          <Icon name="CircleDot" size={14} color={theme.colors.foreground} />
          <Text style={styles.actionLabel}>改状态</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => void openExternalUrl(data.url)}>
          <Icon name="ExternalLink" size={14} color={theme.colors.foreground} />
          <Text style={styles.actionLabel}>在 TAPD 打开</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => void copyLink(data.url)}>
          <Icon name="Copy" size={14} color={theme.colors.foreground} />
          <Text style={styles.actionLabel}>复制链接</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={() => void detail.refetch()}>
          <Icon name="RefreshCw" size={14} color={theme.colors.foreground} />
          <Text style={styles.actionLabel}>刷新</Text>
        </Pressable>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>状态</Text>
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          <Chip
            label={data.statusLabel}
            theme={theme}
            tone={tone === "neutral" ? "muted" : "plain"}
            color={toneColor(tone, theme)}
          />
        </View>
      </View>
      {metaRow("处理人", data.owner)}
      {metaRow("创建人", data.creator)}
      {metaRow("优先级", data.priority)}
      {metaRow("迭代", data.iterationName)}
      {metaRow("创建", data.createdAt)}
      {metaRow("更新", data.modifiedAt)}
      {data.parentStory ? (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>所属需求</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`打开所属需求 #${data.parentStory.id}`}
            onPress={() => openParentStory(data.parentStory, extras)}
          >
            <Text style={{ ...styles.linkAction, flex: 1 }} numberOfLines={1}>
              #{data.parentStory.id} {data.parentStory.title || "（标题未获取）"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {(() => {
        const entityKey = `${data.kind}-${data.id}`;
        const entityLinks = extras.links.filter((link) => link.key === entityKey);
        if (entityLinks.length === 0) return null;
        return (
          <>
            <Text style={styles.section}>关联任务</Text>
            {entityLinks.map((link) => (
              <AgentLinkRow
                key={`${link.workspaceId}-${link.agentId}`}
                link={link}
                theme={theme}
                extras={extras}
                status={agentStatusMap.get(link.agentId)}
              />
            ))}
          </>
        );
      })()}
      {data.kind === "story" && data.childTasks.length > 0 ? (
        <ChildListSection
          key={`${data.id}-task`}
          label="需求下任务"
          items={data.childTasks}
          totalHint={data.childTasksTotal > data.childTasks.length ? `前 ${data.childTasks.length} / 共 ${data.childTasksTotal} 条` : undefined}
          theme={theme}
          extras={extras}
        />
      ) : null}
      {data.kind === "story" && data.childBugs.length > 0 ? (
        <ChildListSection
          key={`${data.id}-bug`}
          label="需求下缺陷"
          items={data.childBugs}
          totalHint={data.childBugsTotal > data.childBugs.length ? `前 ${data.childBugs.length} / 共 ${data.childBugsTotal} 条` : undefined}
          theme={theme}
          extras={extras}
        />
      ) : null}
      <Text style={styles.section}>描述</Text>
      <View style={styles.box}>
        <Text style={styles.description} selectable>
          {data.description || "（无描述）"}
        </Text>
      </View>
      <Text style={styles.section}>评论（{data.comments.length}）</Text>
      {data.commentsError ? <Text style={styles.error}>评论加载失败：{data.commentsError}</Text> : null}
      {data.comments.length === 0 ? (
        <View style={styles.box}>
          <Text style={styles.description}>（暂无评论）</Text>
        </View>
      ) : (
        data.comments.map((comment) => (
          <View key={comment.id} style={styles.comment}>
            <Text style={styles.commentHead}>
              {comment.author || "未知"} · {formatTime(comment.createdAt)}
            </Text>
            <Text style={styles.commentText} selectable>
              {comment.text}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

type EntityChildItem = NonNullable<EntityDetailData["childTasks"]>[number];

/** 打开所属需求：优先在浮窗内切换详情，否则在浏览器打开 */
function openParentStory(
  parent: EntityDetailData["parentStory"],
  extras: DetailExtras,
) {
  if (!parent) return;
  if (extras.onOpenEntity) {
    extras.onOpenEntity({ kind: "story", id: parent.id, title: parent.title || `#${parent.id}` });
    return;
  }
  void openExternalUrl(parent.url);
}

/** 需求详情：该需求下挂的任务/缺陷列表（10 条一页，可翻页） */
function ChildListSection({ label, items, totalHint, theme, extras }: {
  label: string;
  items: readonly EntityChildItem[];
  /** 非 undefined 表示列表被上限截断，如「前 200 / 共 235 条」 */
  totalHint?: string;
  theme: WorkbenchTheme;
  extras: DetailExtras;
}) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = items.slice(start, start + PAGE_SIZE);

  const styles = useMemo<{
    section: TextStyle;
    row: ViewStyle;
    title: TextStyle;
    meta: TextStyle;
    action: TextStyle;
    fullTitle: TextStyle;
    pager: ViewStyle;
    pageText: TextStyle;
    pageBtn: TextStyle;
    pageBtnDisabled: TextStyle;
  }>(() => ({
    section: { color: theme.colors.foregroundMuted, fontSize: 12 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    title: { color: theme.colors.foreground, fontSize: 12, flex: 1, flexShrink: 1 },
    meta: { color: theme.colors.foregroundMuted, fontSize: 11 },
    action: { color: theme.colors.accent, fontSize: 12 },
    fullTitle: { color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 16 },
    pager: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "flex-end" },
    pageText: { color: theme.colors.foregroundMuted, fontSize: 11 },
    pageBtn: { color: theme.colors.accent, fontSize: 14 },
    pageBtnDisabled: { color: theme.colors.border, fontSize: 14 },
  }), [theme]);

  function openChild(item: EntityChildItem) {
    if (extras.onOpenEntity) {
      extras.onOpenEntity({ kind: item.kind, id: item.id, title: item.title });
      return;
    }
    void openExternalUrl(item.url);
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.section}>{label}（{totalHint ?? items.length}）</Text>
      {visible.map((item) => (
        <ChildRow key={item.id} item={item} theme={theme} styles={styles} onOpen={() => openChild(item)} />
      ))}
      {pageCount > 1 ? (
        <View style={styles.pager}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="上一页"
            hitSlop={8}
            disabled={safePage <= 1}
            onPress={() => setPage(safePage - 1)}
          >
            <Icon name="ChevronLeft" size={16} color={safePage <= 1 ? theme.colors.border : theme.colors.accent} />
          </Pressable>
          <Text style={styles.pageText}>第 {safePage} / {pageCount} 页</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="下一页"
            hitSlop={8}
            disabled={safePage >= pageCount}
            onPress={() => setPage(safePage + 1)}
          >
            <Icon name="ChevronRight" size={16} color={safePage >= pageCount ? theme.colors.border : theme.colors.accent} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ChildRow({ item, theme, styles, onOpen }: {
  item: EntityChildItem;
  theme: WorkbenchTheme;
  styles: { row: ViewStyle; title: TextStyle; meta: TextStyle; action: TextStyle; fullTitle: TextStyle };
  onOpen: () => void;
}) {
  // hover 时在行内展开全文（浮窗方案在此环境会被相邻行遮挡，不采用）
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开${item.kind === "task" ? "任务" : "缺陷"} #${item.id}`}
      style={styles.row}
      onHoverIn={() => setOpen(true)}
      onHoverOut={() => setOpen(false)}
      onPress={onOpen}
    >
      <Icon name={item.kind === "task" ? "ListTodo" : "Bug"} size={14} color={theme.colors.accent} />
      <View style={{ flex: 1, flexShrink: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.title} numberOfLines={1}>
          #{item.id} {item.title}
        </Text>
        {open ? (
          <Text selectable style={styles.fullTitle}>
            #{item.id} {item.title}
          </Text>
        ) : null}
      </View>
      <Text style={styles.meta}>{item.statusLabel}</Text>
      {item.owner ? <Text style={styles.meta}>{item.owner}</Text> : null}
      <Text style={styles.action}>详情</Text>
    </Pressable>
  );
}

/** 关联 Agent 行：展示 agent 实时状态与最近一次 turn 结果 */
function AgentLinkRow({ link, theme, extras, status }: {
  link: TapdLink;
  theme: WorkbenchTheme;
  extras: DetailExtras;
  status?: AgentStatusItem;
}) {
  const [resultOpen, setResultOpen] = useState(false);
  const title = useMemo(() => {
    const base = link.agentTitle || link.workspaceTitle || "";
    return base.length > 40 ? `${base.slice(0, 40)}…` : base;
  }, [link.agentTitle, link.workspaceTitle]);
  const shortId = (link.agentId || link.workspaceId).slice(0, 8);

  const styles = useMemo<{
    row: ViewStyle;
    resultBox: ViewStyle;
    tipText: TextStyle;
    statusText: TextStyle;
    titleText: TextStyle;
    idText: TextStyle;
    actionText: TextStyle;
    dangerText: TextStyle;
  }>(() => ({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.colors.surface0,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    resultBox: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      marginTop: 4,
    },
    tipText: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18 },
    statusText: { color: theme.colors.foregroundMuted, fontSize: 11 },
    titleText: { color: theme.colors.foreground, fontSize: 12, flexShrink: 1 },
    idText: { color: theme.colors.foregroundMuted, fontSize: 11 },
    actionText: { color: theme.colors.accent, fontSize: 12 },
    dangerText: { color: theme.colors.statusDanger, fontSize: 12 },
  }), [theme]);

  const liveStatus = status?.status ?? "";
  const statusColor = agentStatusColor(liveStatus, theme);
  const statusLabel =
    liveStatus === "running"
      ? "运行中"
      : liveStatus === "idle"
        ? "空闲"
        : liveStatus === "initializing"
          ? "启动中"
          : liveStatus === "error"
            ? "异常"
            : liveStatus === "closed"
              ? "已关闭"
              : "";
  const hasTurn = Boolean(status?.turnOutcome);
  const turnedAt = formatIsoTime(status?.turnEndedAt ?? "");
  const turnLabel =
    status?.turnOutcome === "completed"
      ? "上次完成"
      : status?.turnOutcome === "failed"
        ? "上次失败"
        : status?.turnOutcome === "canceled"
          ? "上次取消"
          : "";
  const turnText = (status?.turnError || status?.turnSummary || "").trim();
  const turnColor =
    status?.turnOutcome === "failed"
      ? theme.colors.statusDanger
      : status?.turnOutcome === "canceled"
        ? theme.colors.foregroundMuted
        : theme.colors.statusSuccess;

  return (
    <View>
      <View style={styles.row}>
        <Icon name="Bot" size={14} color={theme.colors.accent} />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title || `wks ${link.workspaceId}`}
          </Text>
          <Text style={styles.idText}>{shortId}</Text>
        </View>
        {link.agentId && liveStatus ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
            <Text style={styles.statusText}>
              {statusLabel}
              {status?.updatedAt ? ` · ${formatIsoTime(status.updatedAt)}` : ""}
            </Text>
          </View>
        ) : null}
        {extras.navigation?.openWorkspace ? (
          <Pressable accessibilityRole="button" onPress={() => extras.navigation?.openWorkspace?.({ workspaceId: link.workspaceId })}>
            <Text style={styles.actionText}>打开工作区</Text>
          </Pressable>
        ) : null}
        {link.agentId && extras.navigation?.openAgent ? (
          <Pressable accessibilityRole="button" onPress={() => extras.navigation?.openAgent?.({ agentId: link.agentId })}>
            <Text style={styles.actionText}>打开 Agent</Text>
          </Pressable>
        ) : null}
        {extras.onRemoveLink ? (
          <Pressable accessibilityRole="button" onPress={() => extras.onRemoveLink?.(link)}>
            <Text style={styles.dangerText}>解除</Text>
          </Pressable>
        ) : null}
      </View>
      {link.agentId && hasTurn ? (
        <View style={{ paddingLeft: 10 }}>
          {hasTurn && turnLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看上次结果"
              onPress={() => setResultOpen((value) => !value)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 2 }}
            >
              <Icon name={resultOpen ? "ChevronDown" : "ChevronRight"} size={11} color={turnColor} />
              <Text style={{ color: turnColor, fontSize: 11, flexShrink: 1 }} numberOfLines={resultOpen ? undefined : 1}>
                {turnLabel}
                {turnedAt ? ` ${turnedAt}` : ""}
                {!resultOpen && turnText ? ` · ${turnText}` : ""}
              </Text>
            </Pressable>
          ) : null}
          {hasTurn && resultOpen && turnText ? (
            <View style={styles.resultBox}>
              <Text style={styles.tipText} selectable>
                {turnText}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
