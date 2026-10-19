import type { RpcOutput } from "@getpaseo/plugin";
import { openExternalUrl, useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, Modal, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle, type ViewStyle } from "react-native";
import { entityRpc, type EntityKind, type TapdLink } from "../../shared/contracts";
import { Chip, formatTime, type WorkbenchTheme } from "./bits";
import { statusTone, toneColor } from "./status-tones";

export interface DetailTarget {
  kind: EntityKind;
  id: string;
  title: string;
}

export type EntityDetailData = RpcOutput<typeof entityRpc>;

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
              />
            ))}
          </>
        );
      })()}
      {data.kind === "story" && data.childTasks.length > 0 ? (
        <ChildListSection key={`${data.id}-task`} label="需求下任务" items={data.childTasks} theme={theme} extras={extras} />
      ) : null}
      {data.kind === "story" && data.childBugs.length > 0 ? (
        <ChildListSection key={`${data.id}-bug`} label="需求下缺陷" items={data.childBugs} theme={theme} extras={extras} />
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
function ChildListSection({ label, items, theme, extras }: {
  label: string;
  items: readonly EntityChildItem[];
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
      <Text style={styles.section}>{label}（{items.length}）</Text>
      {visible.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`打开${item.kind === "task" ? "任务" : "缺陷"} #${item.id}`}
          style={styles.row}
          onPress={() => openChild(item)}
        >
          <Icon name={item.kind === "task" ? "ListTodo" : "Bug"} size={14} color={theme.colors.accent} />
          <Text style={styles.title} numberOfLines={1}>
            #{item.id} {item.title}
          </Text>
          <Text style={styles.meta}>{item.statusLabel}</Text>
          {item.owner ? <Text style={styles.meta}>{item.owner}</Text> : null}
          <Text style={styles.action}>详情</Text>
        </Pressable>
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

/** 关联 Agent 行：悬停/点击展示保存的提示词前 200 字 */
function AgentLinkRow({ link, theme, extras }: {
  link: TapdLink;
  theme: WorkbenchTheme;
  extras: DetailExtras;
}) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const title = useMemo(() => {
    const base = link.agentTitle || link.workspaceTitle || "";
    return base.length > 40 ? `${base.slice(0, 40)}…` : base;
  }, [link.agentTitle, link.workspaceTitle]);
  const shortId = (link.agentId || link.workspaceId).slice(0, 8);
  const showTip = hovering || pinned;

  const styles = useMemo<{
    row: ViewStyle;
    tipBox: ViewStyle;
    tipText: TextStyle;
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
    tipBox: {
      position: "absolute",
      top: 38,
      left: 26,
      right: 26,
      zIndex: 20,
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
    },
    tipText: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18 },
    titleText: { color: theme.colors.foreground, fontSize: 12, flexShrink: 1 },
    idText: { color: theme.colors.foregroundMuted, fontSize: 11 },
    actionText: { color: theme.colors.accent, fontSize: 12 },
    dangerText: { color: theme.colors.statusDanger, fontSize: 12 },
  }), [theme]);

  const snippet = link.promptSnippet.trim();

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`关联 Agent ${title || shortId}，悬停查看提示词`}
        style={styles.row}
        // 桌面端（react-native-web）悬停预览；移动端无 hover，由点击固定兜底
        onHoverIn={() => setHovering(true)}
        onHoverOut={() => setHovering(false)}
        onPress={() => setPinned((value) => !value)}
      >
        <Icon name="Bot" size={14} color={theme.colors.accent} />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title || `wks ${link.workspaceId}`}
          </Text>
          <Text style={styles.idText}>{shortId}</Text>
        </View>
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
      </Pressable>
      {showTip ? (
        <View style={styles.tipBox}>
          <Text style={styles.tipText} selectable>
            {snippet || "（该绑定创建于旧版本，未记录提示词）"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
