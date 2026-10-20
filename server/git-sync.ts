import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TapdSettingsValues } from "../shared/contracts";

/** 同步到仓库的设置文件名（仓库根目录） */
const FILE_NAME = "tapd-workbench-settings.json";
const COMMIT_NAME = "tapd-workbench";
const COMMIT_EMAIL = "tapd-workbench@users.noreply.local";

export interface SyncSettingsAccess {
  /** 读取当前设置（校验失败时抛错） */
  read: () => Promise<TapdSettingsValues>;
}

/**
 * 隐私最小化：不进仓库的字段 =
 *  - 密钥：TAPD token、Git token
 *  - 本机/私有标识：项目 ID、派活默认仓库路径
 * 其余（视图、收藏、看板列、关联记录、开关等）作为同步内容
 */
export function managedValues(values: TapdSettingsValues): Record<string, unknown> {
  const rest = { ...values } as Record<string, unknown>;
  delete rest.token;
  delete rest.syncGitToken;
  delete rest.workspaceIds;
  delete rest.lastRepoPath;
  return rest;
}

/** 输出/错误文本中抹掉令牌，避免凭证进入日志或界面 */
function redact(text: string, token: string): string {
  const t = token.trim();
  return t ? text.split(t).join("***") : text;
}

function authUrl(url: string, token: string): string {
  const t = token.trim();
  if (!t || !url.startsWith("https://")) return url;
  return url.replace("https://", `https://oauth2:${t}@`);
}

function branch(values: TapdSettingsValues): string {
  return values.syncBranch.trim() || "main";
}

async function runGit(args: string[], cwd: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = [redact(String(stderr ?? ""), token), redact(String(stdout ?? ""), token), redact(err.message, token)]
          .filter(Boolean).join("\n").trim();
        reject(new Error(detail || "git 命令执行失败"));
        return;
      }
      resolve(String(stdout ?? "").trim());
    });
  });
}

function validateTarget(values: TapdSettingsValues): { url: string; token: string; branch: string } {
  const url = values.syncGitUrl.trim();
  const token = values.syncGitToken.trim();
  if (!url) throw new Error("未配置 Git 仓库地址");
  if (!url.startsWith("https://") && !url.startsWith("git@")) {
    throw new Error("Git 仓库地址需以 https:// 或 git@ 开头");
  }
  if (url.startsWith("https://") && !token) throw new Error("私有仓库需要填写 Git 访问令牌");
  return { url, token, branch: branch(values) };
}

/** 空仓库（还没首次提交）克隆指定分支会失败，此类失败可降级克隆默认 unborn HEAD */
function isMissingBranchError(message: string): boolean {
  return /Remote branch .* not found|not found in upstream|unknown revision/i.test(message);
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** 拉取时额外排除的同步配置字段：仓库备份不得改变本机的同步目的地 */
const PULL_EXCLUDED_KEYS = ["syncGitUrl", "syncBranch"] as const;

/** 每次操作都临时浅克隆一份，用完即删；HTTPS 模式下令牌会进入克隆 URL（暂存于克隆目录的 .git/config，目录删除即清除） */
// ponytail: 令牌会短暂出现在本机进程参数与临时 .git/config 里（仅限 daemon 主机）——如需彻底隐藏改用 git credential helper
async function withClone<T>(values: TapdSettingsValues, fn: (dir: string, empty: boolean) => Promise<T>): Promise<T> {
  const { url, token, branch: targetBranch } = validateTarget(values);
  const dir = join(tmpdir(), `tapd-workbench-sync-${randomUUID()}`);
  try {
    let empty = false;
    try {
      await runGit(["clone", "--depth", "1", "--branch", targetBranch, authUrl(url, token), dir], tmpdir(), token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isMissingBranchError(message)) throw error;
      await runGit(["clone", "--depth", "1", authUrl(url, token), dir], tmpdir(), token);
      empty = true;
    }
    return await fn(dir, empty);
  } finally {
    await cleanup(dir);
  }
}

/** 推送：当前设置（去掉密钥）覆盖仓库中的设置文件并提交 */
export async function pushSettings(access: SyncSettingsAccess): Promise<string> {
  const values = await access.read();
  const { url, token, branch: targetBranch } = validateTarget(values);
  return withClone(values, async (dir, empty) => {
    if (empty) {
      // 空仓库：在 unborn HEAD 上命名分支后提交，才能产出首个提交
      await runGit(["checkout", "-B", targetBranch], dir, token);
    }
    await writeFile(join(dir, FILE_NAME), `${JSON.stringify(managedValues(values), null, 2)}\n`, "utf8");
    await runGit(["add", FILE_NAME], dir, token);
    const dirty = await runGit(["status", "--porcelain"], dir, token);
    if (!dirty) return "仓库配置已是最新，无变更可推送";
    await runGit(
      ["-c", `user.name=${COMMIT_NAME}`, "-c", `user.email=${COMMIT_EMAIL}`, "commit", "-m", `sync settings ${new Date().toISOString()}`],
      dir,
      token,
    );
    await runGit(["push", authUrl(url, token), `HEAD:refs/heads/${targetBranch}`], dir, token);
    return `已推送到仓库 ${targetBranch} 分支（${FILE_NAME}）`;
  });
}

/** 拉取：读取仓库设置文件，返回非密字段（客户端负责合并写回设置） */
export async function pullSettings(access: SyncSettingsAccess): Promise<{ message: string; values: Record<string, unknown> }> {
  const values = await access.read();
  const { token, branch: targetBranch } = validateTarget(values);
  return withClone(values, async (dir, empty) => {
    if (empty) throw new Error("仓库还没有任何提交（空仓库）：请先点一次推送完成首次备份");
    let raw: string;
    try {
      raw = await readFile(join(dir, FILE_NAME), "utf8");
    } catch {
      throw new Error(`仓库中还没有 ${FILE_NAME}，请先推送一次`);
    }
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`仓库中的 ${FILE_NAME} 不是合法的设置对象`);
    }
    // 仓库文件可被手改：同样脱敏，防止 token/workspaceIds 等隐私字段经拉取覆盖本机；
    // 同步目的地字段（syncGitUrl/syncBranch）一律保留本机现值，避免"用导入的令牌指向导入的地址"
    const managed = managedValues(parsed as TapdSettingsValues);
    for (const key of PULL_EXCLUDED_KEYS) delete managed[key];
    const counts = [
      `视图 ${Array.isArray(managed.views) ? managed.views.length : 0}`,
      `关联记录 ${Array.isArray(managed.links) ? managed.links.length : 0}`,
      `收藏 ${Array.isArray(managed.favorites) ? managed.favorites.length : 0}`,
    ].join(" / ");
    return {
      message: `已从仓库 ${targetBranch} 分支读取配置：${counts}（即将应用）`,
      values: managed,
    };
  });
}
