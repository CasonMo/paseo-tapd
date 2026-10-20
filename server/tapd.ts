// TAPD OpenAPI 客户端核心逻辑。
// 本文件刻意保持零导入（无 zod、无 SDK），既用于插件后端，也可被 node 直接加载做集成测试。

export type EntityKind = "story" | "task" | "bug";

export interface TapdConfig {
  endpoint: string;
  site: string;
  token: string;
  tokenSource: "env" | "settings" | "none";
  workspaceIds: string[];
}

export interface TapdConfigInput {
  token: string;
  workspaceIds: string;
}

export interface EntitySummary {
  kind: EntityKind;
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  owner: string;
  priority: string;
  iterationName: string | null;
  modified: string;
  done: boolean;
  url: string;
  /** 仅任务/缺陷：所属需求 ID（story_id；为空或 0 表示无） */
  storyId?: string;
  /** 所属需求标题（尽力解析，未解析时为空） */
  storyTitle?: string;
}

export interface ColumnResult {
  kind: EntityKind;
  total: number;
  items: EntitySummary[];
  truncated: boolean;
  error: string | null;
}

export interface EntityComment {
  id: string;
  author: string;
  createdAt: string;
  text: string;
}

/** 需求详情中的子单据行（关联任务/关联缺陷） */
export interface EntityChildItem {
  kind: EntityKind;
  id: string;
  title: string;
  statusLabel: string;
  owner: string;
  priority: string;
  url: string;
}

export interface EntityDetailResult {
  kind: EntityKind;
  id: string;
  /** 单据实际所在项目（回写状态/评论必须发到这个项目） */
  workspaceId: string;
  title: string;
  url: string;
  status: string;
  statusLabel: string;
  owner: string;
  creator: string;
  priority: string;
  iterationName: string | null;
  createdAt: string;
  modifiedAt: string;
  description: string;
  comments: EntityComment[];
  commentsError: string | null;
  /** 仅需求：该需求下挂的任务（TAPD task.story_id） */
  childTasks: EntityChildItem[];
  /** 仅需求：该需求下挂的缺陷（TAPD bug.story_id） */
  childBugs: EntityChildItem[];
  /** 仅需求：任务/缺陷真实总数（> 列表长度说明列表被 limit 200 截断；0 = 未知/未统计） */
  childTasksTotal: number;
  childBugsTotal: number;
  /** 仅任务/缺陷：所属需求（TAPD task.story_id / bug.story_id） */
  parentStory: { id: string; title: string; url: string } | null;
}

export interface AttachmentSearchItem {
  id: string;
  identifier: string;
  title: string;
  subtitle: string;
  url: string;
  text: string;
  resourceType: string;
}

export class TapdApiError extends Error {
  detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = "TapdApiError";
    this.detail = detail;
  }
}

export const KIND_LABELS: Record<EntityKind, string> = { story: "需求", task: "任务", bug: "缺陷" };

const KIND_WRAPPER: Record<EntityKind, string> = { story: "Story", task: "Task", bug: "Bug" };
const LIST_PATH: Record<EntityKind, string> = { story: "/stories", task: "/tasks", bug: "/bugs" };
const COUNT_PATH: Record<EntityKind, string> = { story: "/stories/count", task: "/tasks/count", bug: "/bugs/count" };
const FIELDS_INFO_PATH: Record<EntityKind, string> = {
  story: "/stories/get_fields_info",
  task: "/tasks/get_fields_info",
  bug: "/bugs/get_fields_info",
};

const LIST_FIELDS: Record<EntityKind, string> = {
  story: "id,name,status,owner,priority_label,iteration_id,modified",
  task: "id,name,status,owner,priority_label,iteration_id,modified,story_id",
  bug: "id,title,status,current_owner,priority_label,iteration_id,modified,story_id",
};

// 终态状态：默认「隐藏已完成」时过滤掉这些状态。
export const TERMINAL_STATUSES: Record<EntityKind, readonly string[]> = {
  story: ["resolved", "status_7", "status_3", "status_18", "rejected"],
  task: ["done"],
  bug: ["closed", "rejected", "status_2"],
};

const TASK_STATUS_LABELS: Record<string, string> = {
  open: "未开始",
  progressing: "进行中",
  done: "已完成",
};

// 无法读取字段信息接口时的兜底「进行中」状态集合。
const FALLBACK_ACTIVE_STATUSES: Record<EntityKind, readonly string[]> = {
  story: [
    "planning", "planned", "status_4", "status_14", "status_10", "audited", "status_15",
    "status_16", "status_17", "status_13", "status_2", "status_9", "developing", "status_19",
    "status_11", "testing", "status_20", "status_21", "status_8", "workflow_suspended",
  ],
  task: ["open", "progressing"],
  bug: ["new", "in_progress", "suspended", "resolved", "verified", "reopened", "status_1", "status_3"],
};

export function resolveConfig(settings: TapdConfigInput): TapdConfig {
  const endpoint = (process.env.TAPD_API_ENDPOINT || "https://api.tapd.cn").trim().replace(/\/+$/, "");
  const site = (process.env.TAPD_SITE_URL || "https://www.tapd.cn").trim().replace(/\/+$/, "");
  const settingsToken = settings.token.trim();
  const envToken = (process.env.TAPD_TOKEN || "").trim();
  const token = settingsToken || envToken;
  const tokenSource: TapdConfig["tokenSource"] = settingsToken ? "settings" : envToken ? "env" : "none";
  const rawWorkspaces = settings.workspaceIds.trim() || process.env.TAPD_WORKSPACE_IDS || "";
  // 去重：重复的项目 ID 会让按项目遍历的查询产出重复卡片
  const workspaceIds = [...new Set(
    rawWorkspaces
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )];
  return { endpoint, site, token, tokenSource, workspaceIds };
}

export function describeError(error: unknown): string {
  if (error instanceof TapdApiError) {
    return error.detail ? `${error.message}（${error.detail}）` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

const DEFAULT_CACHE_TTL_MS = 20_000;
const responseCache = new Map<string, { at: number; value: unknown }>();
const inflightRequests = new Map<string, Promise<unknown>>();

// ---------------------------------------------------------------------------
// 看板整体缓存（SWR）：过期先回旧数据 + 后台刷新，避免进工作台全量重拉白屏
// ---------------------------------------------------------------------------
const BOARD_CACHE_TTL_MS = 90_000;
const boardCache = new Map<string, { at: number; result: unknown }>();
const boardRefreshes = new Map<string, Promise<unknown>>();

export function clearTapdCache(): void {
  responseCache.clear();
  inflightRequests.clear();
  boardCache.clear();
  boardRefreshes.clear();
}

export type StaleBoardResult<T> = T & { stale: boolean; cachedAt: string };

export async function boardWithCache<T extends Record<string, unknown>>(
  key: string,
  fetcher: () => Promise<T>,
  force: boolean,
): Promise<StaleBoardResult<T>> {
  const cached = boardCache.get(key) as { at: number; result: T } | undefined;
  if (force || !cached) {
    const result = await fetcher();
    boardCache.set(key, { at: Date.now(), result });
    return { ...result, stale: false, cachedAt: "" };
  }
  if (Date.now() - cached.at < BOARD_CACHE_TTL_MS) {
    return { ...cached.result, stale: false, cachedAt: "" };
  }
  // 过期：后台已在刷新则复用，否则启动后台刷新；后台失败时保留旧缓存
  let running = boardRefreshes.get(key) ?? null;
  if (!running) {
    running = fetcher()
      .then((result) => {
        boardCache.set(key, { at: Date.now(), result });
        return result;
      })
      .catch(() => null)
      .finally(() => {
        boardRefreshes.delete(key);
      });
    boardRefreshes.set(key, running);
  }
  return { ...cached.result, stale: true, cachedAt: new Date(cached.at).toISOString() };
}

type QueryValue = string | number | undefined;

function buildQuery(params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const text = String(value);
    if (text.length === 0) continue;
    parts.push(`${key}=${encodeURIComponent(text)}`);
  }
  return parts.join("&");
}

async function requestJson(
  config: TapdConfig,
  path: string,
  params: Record<string, QueryValue>,
  ttlMs: number = DEFAULT_CACHE_TTL_MS,
): Promise<any> {
  const query = buildQuery(params);
  const url = `${config.endpoint}${path}${query ? `?${query}` : ""}`;
  const cached = responseCache.get(url);
  if (cached && Date.now() - cached.at < ttlMs) return cached.value;
  const pending = inflightRequests.get(url);
  if (pending) return pending;

  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: controller.signal,
      });
    } catch (error) {
      const detail = controller.signal.aborted ? "请求超时（20 秒）" : describeError(error);
      throw new TapdApiError(`TAPD 请求失败：${path}`, detail);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new TapdApiError(`TAPD 接口返回 HTTP ${response.status}：${path}`);
    }
    let payload: any;
    try {
      payload = await response.json();
    } catch (error) {
      throw new TapdApiError(`TAPD 返回内容不是 JSON：${path}`, describeError(error));
    }
    if (!payload || typeof payload !== "object" || payload.status !== 1) {
      throw new TapdApiError(`TAPD 接口错误：${path}`, String(payload?.info ?? "未知错误"));
    }
    responseCache.set(url, { at: Date.now(), value: payload.data });
    return payload.data;
  })();

  inflightRequests.set(url, request);
  try {
    return await request;
  } finally {
    inflightRequests.delete(url);
  }
}

function unwrapRow(row: unknown, wrappers: readonly string[]): any {
  if (row && typeof row === "object") {
    for (const wrapper of wrappers) {
      if (wrapper in (row as Record<string, unknown>)) {
        return (row as Record<string, unknown>)[wrapper];
      }
    }
  }
  return row;
}

function unwrapRows(data: unknown, wrappers: readonly string[]): any[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => unwrapRow(row, wrappers));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

export async function fetchMe(config: TapdConfig): Promise<{ nick: string; name: string } | null> {
  const data = await requestJson(config, "/users/info", {}, 60_000);
  if (data && typeof data === "object") {
    const nick = String(data.nick ?? data.name ?? "").trim();
    const name = String(data.name ?? data.nick ?? "").trim();
    if (nick || name) return { nick: nick || name, name: name || nick };
  }
  return null;
}

export async function fetchStatusLabels(config: TapdConfig, kind: EntityKind): Promise<Record<string, string>> {
  if (kind === "task") return { ...TASK_STATUS_LABELS };
  const path = kind === "story" ? "/stories/get_fields_info" : "/bugs/get_fields_info";
  const labels: Record<string, string> = {};
  for (const workspaceId of config.workspaceIds) {
    try {
      const data = await requestJson(
        config,
        path,
        { workspace_id: workspaceId, field: "status", fields: "status" },
        30 * 60_000,
      );
      const options = data?.status?.options;
      if (options && typeof options === "object") {
        for (const [key, value] of Object.entries(options)) {
          if (typeof value === "string") labels[key] = value;
        }
      }
    } catch {
      // 单个项目读取失败时使用兜底标签
    }
  }
  return labels;
}

export interface IterationInfo {
  id: string;
  name: string;
  status: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

function commentEntryKind(entryType: string): EntityKind | null {
  if (entryType === "stories" || entryType === "story") return "story";
  if (entryType === "tasks" || entryType === "task") return "task";
  if (entryType === "bug" || entryType === "bug_remark") return "bug";
  return null;
}

/** 拉取当前用户最近评论过的实体 ID（按类型分组，供「我相关的」并集查询使用） */
export async function fetchMyCommentedIds(
  config: TapdConfig,
  author: string,
): Promise<Record<EntityKind, string[]>> {
  const sets: Record<EntityKind, Set<string>> = { story: new Set(), task: new Set(), bug: new Set() };
  for (const workspaceId of config.workspaceIds) {
    try {
      const data = await requestJson(
        config,
        "/comments",
        { workspace_id: workspaceId, author, limit: 200, order: "created desc" },
        60_000,
      );
      for (const row of unwrapRows(data, ["Comment"])) {
        const kind = commentEntryKind(String(row?.entry_type ?? ""));
        const entryId = String(row?.entry_id ?? "");
        if (kind && entryId) sets[kind].add(entryId);
      }
    } catch {
      // 评论来源读取失败时忽略
    }
  }
  return {
    story: [...sets.story].slice(0, 100),
    task: [...sets.task].slice(0, 100),
    bug: [...sets.bug].slice(0, 100),
  };
}

export async function fetchFilterOptions(config: TapdConfig): Promise<{
  priorities: { value: string; label: string; kinds: EntityKind[] }[];
  severities: FilterOption[];
  iterations: IterationInfo[];
  statuses: Record<EntityKind, FilterOption[]>;
}> {
  const priorityMap = new Map<string, { label: string; kinds: EntityKind[] }>();
  for (const kind of ["story", "task", "bug"] as const) {
    const path =
      kind === "story"
        ? "/stories/get_fields_info"
        : kind === "task"
          ? "/tasks/get_fields_info"
          : "/bugs/get_fields_info";
    try {
      const data = await requestJson(
        config,
        path,
        { workspace_id: config.workspaceIds[0], field: "priority_label", fields: "priority_label" },
        30 * 60_000,
      );
      const options = data?.priority_label?.options;
      if (options && typeof options === "object") {
        for (const [value, label] of Object.entries(options)) {
          const labelText = typeof label === "string" ? label : value;
          const existing = priorityMap.get(value);
          if (existing) {
            if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
          } else {
            priorityMap.set(value, { label: labelText, kinds: [kind] });
          }
        }
      }
    } catch {
      // 忽略单个类型的失败
    }
  }
  const priorities = [...priorityMap.entries()].map(([value, entry]) => ({
    value,
    label: entry.label,
    kinds: entry.kinds,
  }));
  const severities: FilterOption[] = [];
  try {
    const data = await requestJson(
      config,
      "/bugs/get_fields_info",
      { workspace_id: config.workspaceIds[0], field: "severity", fields: "severity" },
      30 * 60_000,
    );
    const options = data?.severity?.options;
    if (options && typeof options === "object") {
      for (const [value, label] of Object.entries(options)) {
        severities.push({ value, label: typeof label === "string" ? label : value });
      }
    }
  } catch {
    // 忽略
  }
  const iterations = await fetchIterations(config);
  const statuses: Record<EntityKind, FilterOption[]> = { story: [], task: [], bug: [] };
  for (const kind of ["story", "task", "bug"] as const) {
    const labels = await fetchStatusLabels(config, kind);
    statuses[kind] = Object.entries(labels).map(([value, label]) => ({ value, label }));
  }
  return { priorities, severities, iterations, statuses };
}

/** 状态流转：POST 更新单据状态（workspaceId 为空时回退首个项目） */
export async function updateEntityStatus(
  config: TapdConfig,
  workspaceId: string,
  kind: EntityKind,
  id: string,
  status: string,
): Promise<void> {
  const resolved = workspaceId.trim() || (config.workspaceIds[0] ?? "");
  await requestPost(config, LIST_PATH[kind], { workspace_id: resolved, id, status });
  clearTapdCache();
}

/** 回写评论：POST 新评论（HTML 格式）（workspaceId 为空时回退首个项目） */
export async function addComment(
  config: TapdConfig,
  workspaceId: string,
  kind: EntityKind,
  id: string,
  text: string,
  author: string,
): Promise<void> {
  const resolved = workspaceId.trim() || (config.workspaceIds[0] ?? "");
  const entryType = kind === "story" ? "stories" : kind === "bug" ? "bug" : "tasks";
  const params: Record<string, QueryValue> = {
    workspace_id: resolved,
    entry_type: entryType,
    entry_id: id,
    description: `<p>${escapeHtmlText(text).replace(/\n/g, "<br/>")}</p>`,
  };
  if (author) params.author = author;
  await requestPost(config, "/comments", params);
  clearTapdCache();
}

export async function fetchIterations(config: TapdConfig): Promise<IterationInfo[]> {
  const seen = new Map<string, IterationInfo>();
  for (const workspaceId of config.workspaceIds) {
    try {
      const data = await requestJson(
        config,
        "/iterations",
        { workspace_id: workspaceId, limit: 200, fields: "id,name,status" },
        10 * 60_000,
      );
      for (const row of unwrapRows(data, ["Iteration"])) {
        if (row?.id) {
          seen.set(String(row.id), {
            id: String(row.id),
            name: String(row.name ?? ""),
            status: String(row.status ?? ""),
          });
        }
      }
    } catch {
      // 单个项目读取失败不影响其他项目
    }
  }
  return [...seen.values()].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
}

export async function fetchIterationMap(config: TapdConfig): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const workspaceId of config.workspaceIds) {
    try {
      const data = await requestJson(
        config,
        "/iterations",
        { workspace_id: workspaceId, limit: 200, fields: "id,name" },
        10 * 60_000,
      );
      for (const row of unwrapRows(data, ["Iteration"])) {
        if (row?.id) map.set(String(row.id), String(row.name ?? ""));
      }
    } catch {
      // 迭代信息缺失不致命
    }
  }
  return map;
}

function activeStatuses(kind: EntityKind, labels: Record<string, string>): string[] {
  const terminal = new Set(TERMINAL_STATUSES[kind]);
  const known = Object.keys(labels);
  const source = known.length > 0 ? known : [...FALLBACK_ACTIVE_STATUSES[kind]];
  const active = source.filter((status) => !terminal.has(status));
  return active.length > 0 ? active : [...FALLBACK_ACTIVE_STATUSES[kind]];
}

function ownerParamName(kind: EntityKind): string {
  return kind === "bug" ? "current_owner" : "owner";
}

export function entityUrl(config: TapdConfig, workspaceId: string, kind: EntityKind, id: string): string {
  return `${config.site}/tapd_fe/${workspaceId}/${kind}/detail/${id}`;
}

function toSummary(
  config: TapdConfig,
  workspaceId: string,
  kind: EntityKind,
  row: any,
  labels: Record<string, string>,
  iterationMap: Map<string, string>,
  storyTitles?: Map<string, string>,
): EntitySummary {
  const id = String(row?.id ?? "");
  const status = String(row?.status ?? "");
  const iterationId = String(row?.iteration_id ?? "");
  const storyId = kind === "story" ? "" : String(row?.story_id ?? "").trim();
  const storyKey = storyId && storyId !== "0" ? `${workspaceId}-${storyId}` : "";
  return {
    kind,
    id,
    title: String((kind === "bug" ? row?.title : row?.name) ?? ""),
    status,
    statusLabel: labels[status] ?? status,
    owner: String((kind === "bug" ? row?.current_owner : row?.owner) ?? "").trim(),
    priority: String(row?.priority_label ?? "").trim(),
    iterationName: iterationId && iterationId !== "0" ? iterationMap.get(iterationId) ?? null : null,
    modified: String(row?.modified ?? ""),
    done: TERMINAL_STATUSES[kind].includes(status),
    url: entityUrl(config, workspaceId, kind, id),
    storyId: storyKey ? storyId : "",
    storyTitle: storyTitles?.get(storyKey) ?? "",
  };
}

/** 按工作区批量解析任务/缺陷所属需求的标题（TAPD 支持 id 逗号列表查询） */
async function resolveStoryTitles(
  config: TapdConfig,
  refs: EntityRowRef[],
): Promise<Map<string, string>> {
  const idsByWorkspace = new Map<string, Set<string>>();
  for (const ref of refs) {
    const storyId = String(ref.row?.story_id ?? "").trim();
    if (!storyId || storyId === "0") continue;
    const set = idsByWorkspace.get(ref.workspaceId) ?? new Set();
    set.add(storyId);
    idsByWorkspace.set(ref.workspaceId, set);
  }
  const titles = new Map<string, string>();
  for (const [workspaceId, set] of idsByWorkspace) {
    const ids = [...set];
    for (let start = 0; start < ids.length; start += 100) {
      try {
        const data = await requestJson(config, "/stories", {
          workspace_id: workspaceId,
          id: ids.slice(start, start + 100).join(","),
          limit: 100,
          fields: "id,name",
        });
        for (const row of unwrapRows(data, ["Story"])) {
          const key = `${workspaceId}-${String(row?.id ?? "")}`;
          titles.set(key, String(row?.name ?? "").trim());
        }
      } catch {
        // 需求标题解析失败不阻塞看板
      }
    }
  }
  return titles;
}

export interface ColumnQueryOptions {
  owner: string;
  creator: string;
  keyword: string;
  label: string;
  statusScope: "all" | "active" | "done";
  iterationId: string;
  modifiedAfter: string;
  priorities: string[];
  severities: string[];
  /** 「我相关的」模式：非空时按 处理人/创建人/抄送人/评论人 四路并集查询 */
  relatedOwner: string;
  /** relatedOwner 模式下，该类型下当前用户评论过的实体 ID */
  relatedCommentedIds: string[];
  /** relatedOwner 模式下，关联任务里当前用户参与的 story ID（仅 story 使用） */
  relatedStoryIds: string[];
  /** 高级筛选条件（动态字段） */
  conditions: ConditionInput[];
}

export interface ConditionInput {
  field: string;
  kind: "text" | "enum" | "date" | "user";
  kinds: string[];
  values: string[];
  from: string;
  to: string;
  label?: string;
}

export interface FilterField {
  key: string;
  label: string;
  kind: "text" | "enum" | "date" | "user";
  single: boolean;
  options: FilterOption[];
  kinds: EntityKind[];
}

// 已有一等公民过滤维度的字段不放进「更多筛选」，避免重复与语义冲突
// 说明：name/title 由「关键词」覆盖，owner/creator/status/iteration/priority/severity/label/modified
// 已有一等公民控件；workspace_id 是内部查询参数。其余字段（含 ID、详细描述、抄送人、自定义字段）动态开放。
const FIELD_DENYLIST = new Set([
  "name",
  "title",
  "status",
  "v_status",
  "owner",
  "current_owner",
  "creator",
  "reporter",
  "iteration_id",
  "priority",
  "priority_label",
  "severity",
  "label",
  "modified",
  "workspace_id",
]);

function mapHtmlType(htmlType: string): { kind: FilterField["kind"]; single: boolean } | null {
  switch (htmlType) {
    case "select":
    case "multi_select":
      return { kind: "enum", single: false };
    case "radio":
    case "checkbox":
      return { kind: "enum", single: true };
    case "user_chooser":
    case "single_user_chooser":
    case "mix_chooser":
      return { kind: "user", single: true };
    case "dateinput":
    case "datetime":
      return { kind: "date", single: true };
    case "text":
    case "input":
    case "textarea":
    case "rich_edit":
    case "float":
    case "integer":
      return { kind: "text", single: true };
    default:
      return null;
  }
}

export async function fetchFieldKeySet(config: TapdConfig, kind: EntityKind): Promise<Set<string> | null> {
  try {
    const data = await requestJson(
      config,
      FIELDS_INFO_PATH[kind],
      { workspace_id: config.workspaceIds[0] },
      30 * 60_000,
    );
    if (data && typeof data === "object") return new Set(Object.keys(data));
  } catch {
    // 失败时返回 null，条件将不做字段级校验
  }
  return null;
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function requestPost(
  config: TapdConfig,
  path: string,
  params: Record<string, QueryValue>,
): Promise<any> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const text = String(value);
    if (text.length === 0) continue;
    body.set(key, text);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(`${config.endpoint}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (error) {
    const detail = controller.signal.aborted ? "请求超时（20 秒）" : describeError(error);
    throw new TapdApiError(`TAPD 请求失败：${path}`, detail);
  } finally {
    clearTimeout(timer);
  }
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || payload.status !== 1) {
    throw new TapdApiError(`TAPD 接口错误：${path}`, String(payload?.info ?? `HTTP ${response.status}`));
  }
  return payload.data;
}

/** 「我相关的」：找到我参与（处理/创建/抄送/评论）的任务所关联的 story ID */
export async function fetchRelatedStoryIdsFromTasks(
  config: TapdConfig,
  me: string,
  commentedTaskIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  const memberships: Record<string, QueryValue>[] = [{ owner: me }, { creator: me }, { cc: me }];
  if (commentedTaskIds.length > 0) memberships.push({ id: commentedTaskIds.join(",") });
  for (const membership of memberships) {
    for (const workspaceId of config.workspaceIds) {
      try {
        const data = await requestJson(
          config,
          "/tasks",
          { workspace_id: workspaceId, limit: 200, order: "modified desc", fields: "id,story_id", ...membership },
          60_000,
        );
        for (const row of unwrapRows(data, ["Task"])) {
          const storyId = String(row?.story_id ?? "");
          if (storyId && storyId !== "0") ids.add(storyId);
        }
      } catch {
        // 忽略单个来源失败
      }
    }
  }
  return [...ids].slice(0, 100);
}

export interface CreateEntityInput {
  kind: EntityKind;
  title: string;
  description: string;
  owner: string;
  priority: string;
  iterationId: string;
}

export async function createEntity(
  config: TapdConfig,
  input: CreateEntityInput,
): Promise<{ id: string; kind: EntityKind; url: string }> {
  const workspaceId = config.workspaceIds[0] ?? "";
  const params: Record<string, QueryValue> = { workspace_id: workspaceId };
  if (input.kind === "bug") params.title = input.title;
  else params.name = input.title;
  if (input.description.trim()) {
    params.description = `<p>${escapeHtmlText(input.description.trim()).replace(/\n/g, "<br/>")}</p>`;
  }
  if (input.owner.trim()) {
    params[input.kind === "bug" ? "current_owner" : "owner"] = input.owner.trim();
  }
  if (input.priority.trim()) params.priority_label = input.priority.trim();
  if (input.iterationId.trim()) params.iteration_id = input.iterationId.trim();
  const data = await requestPost(config, LIST_PATH[input.kind], params);
  const row = unwrapRow(data, [KIND_WRAPPER[input.kind]]);
  const id = String(row?.id ?? "");
  if (!id) throw new TapdApiError("TAPD 创建成功但未返回单据 ID");
  return { id, kind: input.kind, url: entityUrl(config, workspaceId, input.kind, id) };
}

export async function fetchFilterFields(config: TapdConfig): Promise<FilterField[]> {
  const merged = new Map<string, FilterField>();
  for (const kind of ["story", "task", "bug"] as const) {
    let data: any;
    try {
      data = await requestJson(
        config,
        FIELDS_INFO_PATH[kind],
        { workspace_id: config.workspaceIds[0] },
        30 * 60_000,
      );
    } catch {
      continue;
    }
    if (!data || typeof data !== "object") continue;
    for (const [key, rawInfo] of Object.entries(data)) {
      const info = rawInfo as Record<string, unknown>;
      if (!info || typeof info !== "object") continue;
      if (FIELD_DENYLIST.has(key)) continue;
      const readonly = info.readonly;
      if (readonly === 1 || readonly === "1" || readonly === true) continue;
      const mapped = mapHtmlType(String(info.html_type ?? ""));
      if (!mapped) continue;
      const label = String(info.label ?? "").trim();
      if (!label) continue;
      const options: FilterOption[] = [];
      const optionsRaw = info.options;
      if (optionsRaw && typeof optionsRaw === "object" && !Array.isArray(optionsRaw)) {
        for (const [value, optionLabel] of Object.entries(optionsRaw as Record<string, unknown>)) {
          options.push({ value, label: typeof optionLabel === "string" ? optionLabel : value });
        }
      }
      const mapKey = `${key}\u0000${label}`;
      const existing = merged.get(mapKey);
      if (existing) {
        if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
        const seen = new Set(existing.options.map((option) => option.value));
        for (const option of options) {
          if (!seen.has(option.value)) existing.options.push(option);
        }
      } else {
        merged.set(mapKey, { key, label, kind: mapped.kind, single: mapped.single, options, kinds: [kind] });
      }
    }
  }
  const fields = [...merged.values()];
  fields.sort((a, b) => {
    if (a.kinds.length !== b.kinds.length) return b.kinds.length - a.kinds.length;
    return a.label.localeCompare(b.label, "zh-Hans-CN");
  });
  return fields;
}

function buildConditionParams(
  kind: EntityKind,
  conditions: ConditionInput[],
  keySet: Set<string> | null,
): Record<string, QueryValue> {
  const params: Record<string, QueryValue> = {};
  for (const condition of conditions) {
    if (!condition.field) continue;
    if (condition.kinds.length > 0 && !condition.kinds.includes(kind)) continue;
    if (keySet && !keySet.has(condition.field)) continue;
    let value: string | undefined;
    if (condition.kind === "enum") {
      value = condition.values.length > 0 ? condition.values.join("|") : undefined;
    } else if (condition.kind === "date") {
      const from = condition.from.trim();
      const to = condition.to.trim();
      value = from || to ? `${from || "2000-01-01"}~${to || "2099-12-31"}` : undefined;
    } else {
      value = condition.values[0]?.trim() || undefined;
    }
    if (value) params[condition.field] = value;
  }
  return params;
}

export function isoDateDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildDimensionParams(
  kind: EntityKind,
  options: ColumnQueryOptions,
  labels: Record<string, string>,
): Record<string, QueryValue> {
  const statusFilter =
    options.statusScope === "all"
      ? undefined
      : options.statusScope === "done"
        ? TERMINAL_STATUSES[kind].join("|")
        : activeStatuses(kind, labels).join("|");
  const params: Record<string, QueryValue> = {
    status: statusFilter,
    iteration_id: options.iterationId || undefined,
    priority_label: options.priorities.length > 0 ? options.priorities.join("|") : undefined,
    modified: options.modifiedAfter ? `${options.modifiedAfter}~2099-12-31` : undefined,
    label: options.label || undefined,
  };
  if (kind === "bug" && options.severities.length > 0) params.severity = options.severities.join("|");
  if (options.creator) params[kind === "bug" ? "reporter" : "creator"] = options.creator;
  if (options.keyword) params[kind === "bug" ? "title" : "name"] = options.keyword;
  return params;
}

interface EntityRowRef {
  workspaceId: string;
  row: any;
}

async function queryEntityRows(
  config: TapdConfig,
  kind: EntityKind,
  params: Record<string, QueryValue>,
): Promise<EntityRowRef[]> {
  const groups = await Promise.all(
    config.workspaceIds.map(async (workspaceId) => {
      const data = await requestJson(config, LIST_PATH[kind], {
        workspace_id: workspaceId,
        limit: 200,
        order: "modified desc",
        fields: LIST_FIELDS[kind],
        ...params,
      });
      return unwrapRows(data, [KIND_WRAPPER[kind]]).map((row) => ({ workspaceId, row }));
    }),
  );
  return groups.flat();
}

export async function fetchColumn(
  config: TapdConfig,
  kind: EntityKind,
  options: ColumnQueryOptions,
): Promise<ColumnResult> {
  const items: EntitySummary[] = [];
  let total = 0;
  let truncated = false;
  try {
    const labels = await fetchStatusLabels(config, kind);
    const iterationMap = await fetchIterationMap(config);
    const fieldKeys = await fetchFieldKeySet(config, kind);
    const dimensionParams = {
      ...buildDimensionParams(kind, options, labels),
      ...buildConditionParams(kind, options.conditions, fieldKeys),
    };

    if (options.relatedOwner) {
      const membershipQueries: Record<string, QueryValue>[] = [
        { [ownerParamName(kind)]: options.relatedOwner },
        { [kind === "bug" ? "reporter" : "creator"]: options.relatedOwner },
        { cc: options.relatedOwner },
      ];
      // 开发人员 / 参与人（按字段定义存在性启用；缺陷的开发人员字段名为 de）
      const developerParam = kind === "bug" ? "de" : "developer";
      if (!fieldKeys || fieldKeys.has(developerParam)) {
        membershipQueries.push({ [developerParam]: options.relatedOwner });
      }
      if (!fieldKeys || fieldKeys.has("participator")) {
        membershipQueries.push({ participator: options.relatedOwner });
      }
      const idMembers = new Set<string>(options.relatedCommentedIds);
      if (kind === "story") {
        for (const id of options.relatedStoryIds) idMembers.add(id);
      }
      if (idMembers.size > 0) {
        membershipQueries.push({ id: [...idMembers].join(",") });
      }
      const batches = await Promise.all(
        membershipQueries.map((membership) => queryEntityRows(config, kind, { ...dimensionParams, ...membership })),
      );
      const seen = new Set<string>();
      const merged: EntitySummary[] = [];
      const mergedRefs: EntityRowRef[] = [];
      for (const batch of batches) {
        for (const ref of batch) {
          const key = `${ref.workspaceId}-${String(ref.row?.id ?? "")}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(toSummary(config, ref.workspaceId, kind, ref.row, labels, iterationMap));
          mergedRefs.push(ref);
        }
        if (batch.length >= 200) truncated = true;
      }
      if (kind !== "story" && merged.length > 0) {
        const storyTitles = await resolveStoryTitles(config, mergedRefs);
        for (let index = 0; index < merged.length; index += 1) {
          merged[index] = toSummary(config, mergedRefs[index].workspaceId, kind, mergedRefs[index].row, labels, iterationMap, storyTitles);
        }
      }
      merged.sort((a, b) => b.modified.localeCompare(a.modified));
      total = merged.length;
      if (merged.length > 300) truncated = true;
      return { kind, total, items: merged.slice(0, 300), truncated, error: null };
    }

    for (const workspaceId of config.workspaceIds) {
      const countData = await requestJson(config, COUNT_PATH[kind], {
        workspace_id: workspaceId,
        [ownerParamName(kind)]: options.owner || undefined,
        ...dimensionParams,
      });
      const count = Number(countData?.count ?? 0);
      total += Number.isFinite(count) ? count : 0;
    }
    const refs = await queryEntityRows(config, kind, {
      [ownerParamName(kind)]: options.owner || undefined,
      ...dimensionParams,
    });
    let storyTitles: Map<string, string> | undefined;
    if (kind !== "story" && refs.length > 0) {
      storyTitles = await resolveStoryTitles(config, refs);
    }
    const seenIds = new Set<string>();
    for (const ref of refs) {
      const key = `${ref.workspaceId}-${String(ref.row?.id ?? "")}`;
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      items.push(toSummary(config, ref.workspaceId, kind, ref.row, labels, iterationMap, storyTitles));
    }
    if (total > refs.length) truncated = true;
  } catch (error) {
    return { kind, total, items, truncated, error: describeError(error) };
  }
  items.sort((a, b) => b.modified.localeCompare(a.modified));
  return { kind, total, items: items.slice(0, 300), truncated, error: null };
}

export async function fetchEntity(config: TapdConfig, kind: EntityKind, id: string): Promise<EntityDetailResult> {
  let row: any = null;
  let workspaceId = config.workspaceIds[0] ?? "";
  for (const candidate of config.workspaceIds) {
    const data = await requestJson(config, LIST_PATH[kind], { workspace_id: candidate, id, limit: 1 });
    const rows = unwrapRows(data, [KIND_WRAPPER[kind]]);
    if (rows.length > 0) {
      row = rows[0];
      workspaceId = candidate;
      break;
    }
  }
  if (!row) {
    throw new TapdApiError(`未找到${KIND_LABELS[kind]} #${id}`);
  }

  const labels = await fetchStatusLabels(config, kind);
  const iterationMap = await fetchIterationMap(config);
  const status = String(row.status ?? "");
  const iterationId = String(row.iteration_id ?? "");
  const detail: EntityDetailResult = {
    kind,
    id: String(row.id ?? id),
    workspaceId,
    title: String((kind === "bug" ? row.title : row.name) ?? ""),
    url: entityUrl(config, workspaceId, kind, id),
    status,
    statusLabel: labels[status] ?? status,
    owner: String((kind === "bug" ? row.current_owner : row.owner) ?? "").trim(),
    creator: String((kind === "bug" ? row.reporter : row.creator) ?? "").trim(),
    priority: String(row.priority_label ?? "").trim(),
    iterationName: iterationId && iterationId !== "0" ? iterationMap.get(iterationId) ?? null : null,
    createdAt: String(row.created ?? ""),
    modifiedAt: String(row.modified ?? ""),
    description: truncate(htmlToText(String(row.description ?? "")), 4000),
    comments: [],
    commentsError: null,
    childTasks: [],
    childBugs: [],
    childTasksTotal: 0,
    childBugsTotal: 0,
    parentStory: null,
  };

  // 任务/缺陷详情：解析所属需求（story_id），点击可跳回需求详情
  if (kind !== "story") {
    const storyId = String(row.story_id ?? "").trim();
    if (storyId && storyId !== "0") {
      const parent = { id: storyId, title: "", url: entityUrl(config, workspaceId, "story", storyId) };
      try {
        const data = await requestJson(config, "/stories", {
          workspace_id: workspaceId,
          id: storyId,
          limit: 1,
          fields: "id,name",
        });
        const storyRow = unwrapRows(data, ["Story"])[0];
        parent.title = String(storyRow?.name ?? "").trim();
      } catch {
        // 需求标题读取失败时仅展示 ID
      }
      detail.parentStory = parent;
    }
  }

  const entryType = kind === "story" ? "stories" : kind === "bug" ? "bug|bug_remark" : "tasks";
  try {
    const data = await requestJson(config, "/comments", {
      workspace_id: workspaceId,
      entry_type: entryType,
      entry_id: id,
      limit: 30,
      order: "created desc",
    });
    detail.comments = unwrapRows(data, ["Comment"]).map((comment) => ({
      id: String(comment?.id ?? ""),
      author: String(comment?.author ?? "").trim(),
      createdAt: String(comment?.created ?? ""),
      text: truncate(htmlToText(String(comment?.description ?? "")), 800),
    }));
  } catch (error) {
    detail.commentsError = describeError(error);
  }

  // 需求详情：拉取该需求下挂的任务与缺陷（task.story_id / bug.story_id）
  if (kind === "story") {
    const labelsFor: Record<EntityKind, Record<string, string>> = {
      task: await fetchStatusLabels(config, "task"),
      bug: await fetchStatusLabels(config, "bug"),
      story: {},
    };
    const loadChildren = async (childKind: Exclude<EntityKind, "story">): Promise<EntityChildItem[]> => {
      try {
        const data = await requestJson(config, LIST_PATH[childKind], {
          workspace_id: workspaceId,
          story_id: id,
          limit: 200,
          order: "modified desc",
          fields: LIST_FIELDS[childKind],
        });
        return unwrapRows(data, [KIND_WRAPPER[childKind]])
          .map((row) => {
            const childId = String(row?.id ?? "");
            const status = String(row?.status ?? "");
            return {
              kind: childKind,
              id: childId,
              title: String((childKind === "bug" ? row?.title : row?.name) ?? ""),
              statusLabel: labelsFor[childKind][status] ?? status,
              owner: String((childKind === "bug" ? row?.current_owner : row?.owner) ?? "").trim(),
              priority: String(row?.priority_label ?? "").trim(),
              url: entityUrl(config, workspaceId, childKind, childId),
            };
          })
          .filter((item) => item.id.length > 0);
      } catch {
        return []; // 子单据读取失败不阻塞需求详情
      }
    };
    const countChildren = async (childKind: Exclude<EntityKind, "story">): Promise<number> => {
      try {
        const data = await requestJson(config, COUNT_PATH[childKind], {
          workspace_id: workspaceId,
          story_id: id,
        });
        const count = Number(data?.count ?? 0);
        return Number.isFinite(count) ? count : 0;
      } catch {
        return 0;
      }
    };
    const [tasks, bugs] = await Promise.all([loadChildren("task"), loadChildren("bug")]);
    const [taskTotal, bugTotal] = await Promise.all([
      tasks.length >= 200 ? countChildren("task") : Promise.resolve(0),
      bugs.length >= 200 ? countChildren("bug") : Promise.resolve(0),
    ]);
    detail.childTasks = tasks;
    detail.childBugs = bugs;
    detail.childTasksTotal = taskTotal;
    detail.childBugsTotal = bugTotal;
  }
  return detail;
}

export async function searchEntities(config: TapdConfig, query: string): Promise<AttachmentSearchItem[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const numeric = /^\d{4,}$/.test(trimmed);
  const kinds: EntityKind[] = ["story", "task", "bug"];
  const items: AttachmentSearchItem[] = [];
  for (const kind of kinds) {
    const labels = await fetchStatusLabels(config, kind);
    const iterationMap = await fetchIterationMap(config);
    for (const workspaceId of config.workspaceIds) {
      const base: Record<string, QueryValue> = {
        workspace_id: workspaceId,
        limit: 5,
        order: "modified desc",
        fields: LIST_FIELDS[kind],
      };
      if (numeric) base.id = trimmed;
      else base[kind === "bug" ? "title" : "name"] = trimmed;
      try {
        const data = await requestJson(config, LIST_PATH[kind], base);
        for (const row of unwrapRows(data, [KIND_WRAPPER[kind]])) {
          const summary = toSummary(config, workspaceId, kind, row, labels, iterationMap);
          const lines = [
            `TAPD ${KIND_LABELS[kind]}单据快照（#${summary.id}）`,
            `- 标题：${summary.title}`,
            `- 状态：${summary.statusLabel}`,
            `- 处理人：${summary.owner || "未指派"}`,
            summary.iterationName ? `- 迭代：${summary.iterationName}` : null,
            `- 链接：${summary.url}`,
          ].filter((line): line is string => line !== null);
          items.push({
            id: `${kind}-${summary.id}`,
            identifier: `#${summary.id}`,
            title: summary.title,
            subtitle: `${KIND_LABELS[kind]} · ${summary.statusLabel}${summary.owner ? ` · ${summary.owner}` : ""}`,
            url: summary.url,
            text: lines.join("\n"),
            resourceType: KIND_LABELS[kind],
          });
        }
      } catch {
        // 单类搜索失败不影响其他类别
      }
    }
  }
  return items.slice(0, 15);
}
