import type { PluginLifecycleEvents } from "@getpaseo/plugin/server";

export interface AgentTurnRecord {
  agentId: string;
  outcome: string;
  endedAt: string;
  summary: string;
  error: string;
}

const records = new Map<string, AgentTurnRecord>();
const MAX_RECORDS = 500;
const SUMMARY_MAX = 200;

type TurnOutcome = PluginLifecycleEvents["agent.turn_ended"]["outcome"];

/**
 * daemon 内存台账：agentId -> 最近一次 turn 结果。daemon 重启即清空，
 * 详情面板在无台账时回退到 agent 实时状态（RPC handler 内兜底）。
 */
export function recordTurnEnd(event: {
  agentId: string;
  outcome: TurnOutcome;
  endedAt: string;
  timeline: PluginLifecycleEvents["agent.turn_ended"]["timeline"];
}): AgentTurnRecord {
  let summary = "";
  for (const item of [...event.timeline].reverse()) {
    if (item.type === "assistant_message" && typeof item.text === "string" && item.text.trim()) {
      summary = item.text.trim().slice(0, SUMMARY_MAX);
      break;
    }
  }
  const error =
    event.outcome.kind === "failed" ? (event.outcome.error?.message ?? "").slice(0, SUMMARY_MAX) : "";
  const record: AgentTurnRecord = {
    agentId: event.agentId,
    outcome: event.outcome.kind,
    endedAt: event.endedAt,
    summary,
    error,
  };
  records.delete(record.agentId);
  if (records.size >= MAX_RECORDS) {
    records.delete(records.keys().next().value ?? "");
  }
  records.set(record.agentId, record);
  return record;
}

export function getTurnRecord(agentId: string): AgentTurnRecord | undefined {
  return records.get(agentId);
}
