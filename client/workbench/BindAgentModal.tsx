import { usePaseo } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { type TapdLink } from "../../shared/contracts";
import { Chip, type WorkbenchTheme } from "./bits";
import { type EntityDetailData } from "./EntityDetailModal";
import { bindNoticeText, makeLink, notifyAgent } from "./link-utils";

interface AgentRow {
  id: string;
  title: string;
  status: string;
  provider: string;
  workspaceId: string;
}

/** 工作台：把单据绑定到一个已存在的 Agent（绑定后发送跟进提示词） */
export function BindAgentModal({ open, onClose, theme, data, links, onBound }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  data: EntityDetailData;
  links: readonly TapdLink[];
  onBound: (link: TapdLink) => void;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const [agents, setAgents] = useState<AgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bindingId, setBindingId] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAgents(null);
    setError(null);
    setBindingId("");
    void (async () => {
      try {
        const result = await paseo.agents.list();
        if (cancelled) return;
        setAgents(
          (result.entries ?? []).map((entry) => {
            const agent = entry.agent;
            return {
              id: agent.id,
              title: agent.title ?? agent.id,
              status: String(agent.status ?? ""),
              provider: agent.provider ?? "",
              workspaceId: agent.workspaceId ?? "",
            };
          }),
        );
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const entityKey = `${data.kind}-${data.id}`;
  const sorted = useMemo(() => {
    const rank: Record<string, number> = { running: 0, idle: 1, initializing: 2, error: 3, closed: 4 };
    return [...(agents ?? [])].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  }, [agents]);

  async function bind(agent: AgentRow) {
    if (bindingId) return;
    setBindingId(agent.id);
    try {
      const link = makeLink({
        kind: data.kind,
        id: data.id,
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        agentTitle: agent.title,
      });
      onBound(link);
      const notified = await notifyAgent(
        paseo,
        agent.id,
        bindNoticeText({ kind: data.kind, id: data.id, title: data.title, statusLabel: data.statusLabel, url: data.url }),
      );
      toast.show(notified ? `已关联并通知「${agent.title}」` : `已关联「${agent.title}」`, { variant: "success" });
      onClose();
    } finally {
      setBindingId("");
    }
  }

  const styles = useMemo<{
    row: ViewStyle;
    rowTitle: TextStyle;
    rowSub: TextStyle;
    link: TextStyle;
    hint: TextStyle;
    error: TextStyle;
    center: ViewStyle;
  }>(() => ({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowTitle: { color: theme.colors.foreground, fontSize: 13, flex: 1 },
    rowSub: { color: theme.colors.foregroundMuted, fontSize: 11 },
    link: { color: theme.colors.accent, fontSize: 13 },
    hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
    error: { color: theme.colors.statusDanger, fontSize: 13, lineHeight: 19 },
    center: { alignItems: "center", padding: 24 },
  }), [theme]);

  return (
    <Modal title={`绑定 Agent · #${data.id}`} open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        <Text style={styles.hint}>选择一个已有 Agent 关联到这张单据；绑定后会向它发送一条跟进提示词。</Text>
        {agents === null && !error ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.foreground} />
          </View>
        ) : error ? (
          <Text style={styles.error}>读取 Agent 列表失败：{error}</Text>
        ) : sorted.length === 0 ? (
          <Text style={styles.hint}>没有找到已有 Agent。</Text>
        ) : (
          sorted.map((agent) => {
            const bound = links.some((link) => link.key === entityKey && link.agentId === agent.id);
            return (
              <Pressable
                key={agent.id}
                accessibilityRole="button"
                style={styles.row}
                disabled={bound || bindingId.length > 0}
                onPress={() => void bind(agent)}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{agent.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {agent.provider} · {agent.status}
                  </Text>
                </View>
                {bound ? (
                  <Chip label="已关联" theme={theme} color={theme.colors.accent} />
                ) : bindingId === agent.id ? (
                  <ActivityIndicator color={theme.colors.accent} />
                ) : (
                  <Text style={styles.link}>绑定并通知</Text>
                )}
              </Pressable>
            );
          })
        )}
      </Modal.Content>
    </Modal>
  );
}
