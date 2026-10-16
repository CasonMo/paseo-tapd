import { PLUGIN_VERSION } from "../shared/version";

const RECORD_RAW = "https://raw.githubusercontent.com/getpaseo/plugins/main/plugins/casonmo/tapd-workbench.json";
const RECORD_API = "https://api.github.com/repos/getpaseo/plugins/contents/plugins/casonmo/tapd-workbench.json";
const REPO_RAW = "https://raw.githubusercontent.com/CasonMo/paseo-tapd";
const REPO_API = "https://api.github.com/repos/CasonMo/paseo-tapd/contents";
const CACHE_TTL_MS = 3_600_000;
const FETCH_TIMEOUT_MS = 10_000;

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  latestCommit: string;
  updateAvailable: boolean;
  checkedAt: string;
}

let cache: { at: number; result: UpdateCheckResult } | null = null;

function parseVersion(value: string): number[] | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

async function fetchText(url: string, accept?: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "tapd-workbench-update-check",
        ...(accept ? { Accept: accept } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFirst(candidates: Array<{ url: string; accept?: string }>): Promise<string> {
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return await fetchText(candidate.url, candidate.accept);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("更新检查请求失败");
}

/** 读取 registry 记录（pin commit）→ 读取该 commit 的 package.json 版本 → 与本地版本比较 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.result;
  const recordText = await fetchFirst([
    { url: RECORD_RAW },
    { url: RECORD_API, accept: "application/vnd.github.raw" },
  ]);
  const record = JSON.parse(recordText) as { artifact?: { commit?: unknown } };
  const commit = typeof record.artifact?.commit === "string" ? record.artifact.commit : "";
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("registry 记录缺少有效的 commit pin");
  const packageText = await fetchFirst([
    { url: `${REPO_RAW}/${commit}/package.json` },
    { url: `${REPO_API}/package.json?ref=${commit}`, accept: "application/vnd.github.raw" },
  ]);
  const pkg = JSON.parse(packageText) as { version?: unknown };
  const latestVersion = typeof pkg.version === "string" ? pkg.version : "";
  if (latestVersion.length === 0) throw new Error("pinned package.json 缺少版本号");
  const result: UpdateCheckResult = {
    currentVersion: PLUGIN_VERSION,
    latestVersion,
    latestCommit: commit,
    updateAvailable: compareVersions(latestVersion, PLUGIN_VERSION) > 0,
    checkedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), result };
  return result;
}
