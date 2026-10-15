import type { EntityKind } from "../../shared/contracts";
import type { WorkbenchTheme } from "./bits";

// 状态色相：blue=进行中/评审，orange=测试/发布/待确认，green=完成/验证通过，
// red=拒绝/重开，neutral=未开始/挂起/关闭。
export type StatusTone = "neutral" | "blue" | "green" | "orange" | "red";

const STORY_TONES: Record<string, StatusTone> = {
  planning: "neutral",
  planned: "neutral",
  status_4: "neutral",
  status_18: "neutral",
  workflow_suspended: "neutral",
  status_14: "blue",
  audited: "blue",
  status_15: "blue",
  status_16: "blue",
  status_17: "blue",
  status_13: "blue",
  status_2: "blue",
  status_9: "blue",
  developing: "blue",
  status_10: "blue",
  status_19: "orange",
  status_11: "orange",
  testing: "orange",
  status_20: "orange",
  status_21: "orange",
  status_8: "orange",
  resolved: "green",
  status_7: "green",
  status_3: "green",
  rejected: "red",
};

const BUG_TONES: Record<string, StatusTone> = {
  new: "blue",
  in_progress: "blue",
  status_1: "orange",
  suspended: "neutral",
  resolved: "orange",
  status_2: "neutral",
  verified: "green",
  status_3: "green",
  reopened: "red",
  rejected: "red",
  closed: "neutral",
};

const TASK_TONES: Record<string, StatusTone> = {
  open: "neutral",
  progressing: "blue",
  done: "green",
};

export function statusTone(kind: EntityKind, status: string): StatusTone {
  const map = kind === "story" ? STORY_TONES : kind === "bug" ? BUG_TONES : TASK_TONES;
  return map[status] ?? "neutral";
}

export function toneColor(tone: StatusTone, theme: WorkbenchTheme): string | undefined {
  switch (tone) {
    case "blue":
      return theme.colors.accent;
    case "green":
      return theme.colors.statusSuccess;
    case "orange":
      return theme.colors.statusWarning;
    case "red":
      return theme.colors.statusDanger;
    default:
      return undefined;
  }
}
