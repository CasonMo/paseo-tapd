import type { EntityKind, TapdLink } from "../../shared/contracts";

export const KIND_LABELS: Record<EntityKind, string> = { story: "需求", task: "任务", bug: "缺陷" };

export function makeLink(input: {
  kind: EntityKind;
  id: string;
  workspaceId: string;
  agentId: string;
  agentTitle: string;
  workspaceTitle?: string;
  /** 提示词前 200 字，用于详情面板悬停预览 */
  promptSnippet?: string;
}): TapdLink {
  return {
    key: `${input.kind}-${input.id}`,
    kind: input.kind,
    id: input.id,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    workspaceTitle: input.workspaceTitle ?? "",
    agentTitle: input.agentTitle,
    createdAt: new Date().toISOString(),
    promptSnippet: input.promptSnippet ?? "",
  };
}

/** 绑定后发给 Agent 的跟进提示词 */
export function bindNoticeText(input: {
  kind: EntityKind;
  id: string;
  title: string;
  statusLabel?: string | null;
  url: string;
}): string {
  const status = input.statusLabel ? `（当前状态：${input.statusLabel}）` : "";
  return [
    `【TAPD 关联】本会话已与 TAPD ${KIND_LABELS[input.kind]} #${input.id}「${input.title}」建立关联${status}。`,
    `链接：${input.url}`,
    "后续请围绕这张单据跟进；每轮工作结束后，请在回复最后给出一段结果摘要（改动内容、验证结果），插件会把摘要自动回写到这张单据的评论。",
  ].join("\n");
}

interface AgentSender {
  agents: {
    ref(agentOrId: string): { send(text: string): Promise<unknown> };
  };
}

/** 发送关联提示词（失败不阻断绑定） */
export async function notifyAgent(paseo: AgentSender, agentId: string, text: string): Promise<boolean> {
  if (!agentId) return false;
  try {
    await paseo.agents.ref(agentId).send(text);
    return true;
  } catch {
    return false;
  }
}
