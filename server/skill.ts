import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SKILL_FILES } from "./skill-files";

export const SKILL_ID = "paseo-tapd";

export function skillInstallPath(): string {
  return path.join(os.homedir(), ".agents", "skills", SKILL_ID);
}

export interface SkillStatus {
  state: "missing" | "current" | "stale";
  path: string;
  totalFiles: number;
}

/** 与磁盘上的已装技能逐文件比对 */
export async function getSkillStatus(): Promise<SkillStatus> {
  const target = skillInstallPath();
  const entries = Object.entries(SKILL_FILES);
  let missing = 0;
  let differing = 0;
  for (const [rel, content] of entries) {
    try {
      const existing = await fs.readFile(path.join(target, rel), "utf8");
      if (existing !== content) differing += 1;
    } catch {
      missing += 1;
    }
  }
  const state: SkillStatus["state"] =
    missing === entries.length ? "missing" : missing > 0 || differing > 0 ? "stale" : "current";
  return { state, path: target, totalFiles: entries.length };
}

export async function installSkill(): Promise<{ path: string; files: number }> {
  const target = skillInstallPath();
  const entries = Object.entries(SKILL_FILES);
  for (const [rel, content] of entries) {
    const full = path.join(target, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
  }
  return { path: target, files: entries.length };
}

export async function uninstallSkill(): Promise<{ path: string }> {
  const target = skillInstallPath();
  // 安全兜底：只允许删除固定的技能目录（~/.agents/skills/paseo-tapd）
  const allowedRoot = path.join(os.homedir(), ".agents", "skills");
  const expected = path.join(allowedRoot, SKILL_ID);
  if (path.resolve(target) !== path.resolve(expected) || path.basename(target) !== SKILL_ID) {
    throw new Error("技能目录异常，拒绝删除");
  }
  await fs.rm(target, { recursive: true, force: true });
  return { path: target };
}
