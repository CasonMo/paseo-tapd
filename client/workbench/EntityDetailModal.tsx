import type { RpcOutput } from "@getpaseo/plugin";
import { openExternalUrl, useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, Modal, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
      {(() => {
        const entityKey = `${data.kind}-${data.id}`;
        const entityLinks = extras.links.filter((link) => link.key === entityKey);
        if (entityLinks.length === 0) return null;
        return (
          <>
            <Text style={styles.section}>关联任务</Text>
            {entityLinks.map((link) => (
              <View key={`${link.workspaceId}-${link.agentId}`} style={styles.linkRow}>
                <Icon name="Bot" size={14} color={theme.colors.accent} />
                <Text style={styles.linkTitle} numberOfLines={1}>
                  {link.workspaceTitle || link.workspaceId}
                </Text>
                <View style={{ flex: 1 }} />
                {extras.navigation?.openWorkspace ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => extras.navigation?.openWorkspace?.({ workspaceId: link.workspaceId })}
                  >
                    <Text style={styles.linkAction}>打开工作区</Text>
                  </Pressable>
                ) : null}
                {link.agentId && extras.navigation?.openAgent ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => extras.navigation?.openAgent?.({ agentId: link.agentId })}
                  >
                    <Text style={styles.linkAction}>打开 Agent</Text>
                  </Pressable>
                ) : null}
                {extras.onRemoveLink ? (
                  <Pressable accessibilityRole="button" onPress={() => extras.onRemoveLink?.(link)}>
                    <Text style={styles.linkDanger}>解除</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </>
        );
      })()}
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
