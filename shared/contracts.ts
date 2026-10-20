import { defineAttachmentSource, defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const entityKindSchema = z.enum(["story", "task", "bug"]);
export type EntityKind = z.infer<typeof entityKindSchema>;

// ---------------------------------------------------------------------------
// 过滤条件（工作台工具栏与视图共用同一套维度）
// ---------------------------------------------------------------------------

export const filtersSchema = z.object({
  /** 标题关键字（需求/任务按标题、缺陷按标题模糊匹配） */
  keyword: z.string().default(""),
  /** 处理人：mine=只看我的，related=我相关（处理/创建/抄送/评论），all=全部，custom=指定昵称 */
  ownerMode: z.enum(["mine", "related", "all", "custom"]).default("mine"),
  /** ownerMode=custom 时的昵称 */
  owner: z.string().default(""),
  /** 创建人昵称；空字符串=全部 */
  creator: z.string().default(""),
  /** 状态范围：all=全部，active=仅进行中，done=仅已结束 */
  statusScope: z.enum(["all", "active", "done"]).default("all"),
  /** 迭代 ID；空字符串=全部迭代 */
  iterationId: z.string().default(""),
  /** 更新时间范围：0=不限，N=近 N 天 */
  modifiedWithinDays: z.number().default(0),
  /** 优先级（priority_label）多选值 */
  priorities: z.array(z.string()).default([]),
  /** 严重程度（severity，仅缺陷）多选值 */
  severities: z.array(z.string()).default([]),
  /** 标签（label）精确值；空字符串=全部 */
  label: z.string().default(""),
  /** 高级筛选条件（字段来自 fields_info 动态获取） */
  conditions: z.array(
    z.object({
      field: z.string(),
      label: z.string().default(""),
      kind: z.enum(["text", "enum", "date", "user"]).default("text"),
      kinds: z.array(entityKindSchema).default([]),
      values: z.array(z.string()).default([]),
      from: z.string().default(""),
      to: z.string().default(""),
    }),
  ).default([]),
});
export type TapdFilters = z.infer<typeof filtersSchema>;
export type TapdCondition = TapdFilters["conditions"][number];

export const DEFAULT_FILTERS: TapdFilters = filtersSchema.parse({});

// ---------------------------------------------------------------------------
// 视图（= 可复用的过滤条件预设）
// ---------------------------------------------------------------------------

export const viewSchema = z.object({
  id: z.string(),
  name: z.string(),
  filters: filtersSchema.default(DEFAULT_FILTERS),
});
export type TapdView = z.infer<typeof viewSchema>;

export const DEFAULT_VIEWS: readonly TapdView[] = [
  { id: "related", name: "我相关的", filters: { ...DEFAULT_FILTERS, ownerMode: "related" } },
];

export const DEFAULT_VIEW: TapdView = DEFAULT_VIEWS[0];

export function effectiveViews(values: { views: readonly TapdView[] }): readonly TapdView[] {
  return values.views.length > 0 ? values.views : DEFAULT_VIEWS;
}

export function resolveView(
  values: { views: readonly TapdView[]; defaultViewId: string },
  viewId: string,
): TapdView {
  const views = effectiveViews(values);
  const wanted = viewId.trim() || values.defaultViewId.trim();
  return views.find((view) => view.id === wanted) ?? views[0];
}

export const tapdSettingsSchema = z.object({
  token: z.string().default(""),
  workspaceIds: z.string().default(""),
  views: z.array(viewSchema).default([]),
  defaultViewId: z.string().default(""),
  /** 收藏（置顶）单据，键为 `${kind}-${id}` */
  favorites: z.array(z.string()).default([]),
  /** 看板各类型显示的状态列（kind -> 状态 key 列表）；未设置或为空 = 自动（仅展示有数据的状态） */
  columns: z.record(z.string(), z.array(z.string())).default({}),
  /** 聚合视图：列内按状态分组（可折叠） */
  groupByStatus: z.boolean().default(true),
  /** 单据 ↔ 工作区/Agent 关联（派活记录） */
  links: z.array(
    z.object({
      key: z.string(),
      kind: entityKindSchema,
      id: z.string(),
      workspaceId: z.string(),
      agentId: z.string().default(""),
      workspaceTitle: z.string().default(""),
      agentTitle: z.string().default(""),
      createdAt: z.string().default(""),
      /** 创建绑定时提示词的前 200 字（旧数据为空） */
      promptSnippet: z.string().default(""),
    }),
  ).default([]),
  /** 上次派活使用的仓库与模型（默认值） */
  lastRepoPath: z.string().default(""),
  lastProvider: z.string().default(""),
});
export type TapdLink = TapdSettingsValues["links"][number];
export type TapdSettingsValues = z.infer<typeof tapdSettingsSchema>;

export const tapdSettings = defineSettings({
  id: "tapd-workbench-config",
  scope: "host",
  version: 5,
  schema: tapdSettingsSchema,
  migrate: (values, fromVersion) => {
    const previous = (values ?? {}) as Record<string, unknown>;
    let migrated: Record<string, unknown> = previous;

    if (fromVersion < 3) {
      const token = typeof previous.token === "string" ? previous.token : "";
      const workspaceIds = typeof previous.workspaceIds === "string" ? previous.workspaceIds : "";
      let rawViews: Record<string, unknown>[] = [];
      if (Array.isArray(previous.views)) {
        rawViews = previous.views.filter(
          (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
        );
      } else {
        // v1：平铺的 owner / hideDone
        const owner = typeof previous.owner === "string" ? previous.owner.trim() : "";
        rawViews = [
          {
            id: "mine",
            name: owner ? `处理人 ${owner}` : "我处理的",
            mine: owner.length === 0,
            owner,
            hideDone: previous.hideDone === true,
            iterationId: "",
          },
        ];
      }
      const views = rawViews.map((view, index) => {
        const owner = typeof view.owner === "string" ? view.owner.trim() : "";
        const mine = view.mine === true && owner.length === 0;
        const ownerMode = mine ? "mine" : owner.length > 0 ? "custom" : "all";
        return {
          id: typeof view.id === "string" && view.id ? view.id : `view-${index + 1}`,
          name: typeof view.name === "string" && view.name ? view.name : "未命名视图",
          filters: {
            keyword: "",
            ownerMode,
            owner,
            creator: "",
            statusScope: view.hideDone === true ? "active" : "all",
            iterationId: typeof view.iterationId === "string" ? view.iterationId : "",
            modifiedWithinDays: 0,
            priorities: [],
            severities: [],
            label: "",
            conditions: [],
          },
        };
      });
      migrated = {
        token,
        workspaceIds,
        views,
        defaultViewId:
          typeof previous.defaultViewId === "string" && previous.defaultViewId
            ? previous.defaultViewId
            : views[0]?.id ?? "",
      };
    }

    if (fromVersion < 4) {
      const token = typeof migrated.token === "string" ? migrated.token : "";
      const workspaceIds = typeof migrated.workspaceIds === "string" ? migrated.workspaceIds : "";
      const views = Array.isArray(migrated.views) ? [...(migrated.views as Record<string, unknown>[])] : [];
      const hasRelated = views.some((view) => {
        const filters = view?.filters as Record<string, unknown> | undefined;
        return filters?.ownerMode === "related";
      });
      if (views.length > 0 && !hasRelated) {
        views.push({ id: "related", name: "我相关的", filters: { ...DEFAULT_FILTERS, ownerMode: "related" } });
      }
      migrated = {
        token,
        workspaceIds,
        views,
        defaultViewId: typeof migrated.defaultViewId === "string" ? migrated.defaultViewId : "",
      };
    }

    if (fromVersion < 5) {
      const token = typeof migrated.token === "string" ? migrated.token : "";
      const workspaceIds = typeof migrated.workspaceIds === "string" ? migrated.workspaceIds : "";
      const rawViews = Array.isArray(migrated.views) ? (migrated.views as Record<string, unknown>[]) : [];
      // 移除预置的「我处理的」视图（id 固定为 mine；用户自建视图 id 为 view-xxx，不受影响）
      const views = rawViews.filter((view) => view?.id !== "mine");
      const previousDefault = typeof migrated.defaultViewId === "string" ? migrated.defaultViewId : "";
      migrated = {
        token,
        workspaceIds,
        views,
        defaultViewId: previousDefault === "mine" ? "" : previousDefault,
      };
    }

    return migrated;
  },
});

// ---------------------------------------------------------------------------
// RPC 契约
// ---------------------------------------------------------------------------

const entitySummarySchema = z.object({
  kind: entityKindSchema,
  id: z.string(),
  title: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  owner: z.string(),
  priority: z.string(),
  iterationName: z.string().nullable(),
  modified: z.string(),
  done: z.boolean(),
  url: z.string(),
  /** 仅任务/缺陷：所属需求 ID（空 = 无关联需求） */
  storyId: z.string().default(""),
  /** 所属需求标题（尽力解析，解析失败为空） */
  storyTitle: z.string().default(""),
});

const columnSchema = z.object({
  kind: entityKindSchema,
  total: z.number(),
  items: z.array(entitySummarySchema),
  truncated: z.boolean(),
  error: z.string().nullable(),
});

export const boardRpc = defineRpc({
  name: "tapd.board",
  input: z.object({
    filters: filtersSchema.optional(),
  }),
  output: z.object({
    workspaceCount: z.number(),
    tokenSource: z.enum(["env", "settings", "none"]),
    fetchedAt: z.string(),
    columns: z.object({
      story: columnSchema,
      task: columnSchema,
      bug: columnSchema,
    }),
  }),
});

export const filterOptionsRpc = defineRpc({
  name: "tapd.filter_options",
  input: z.object({}),
  output: z.object({
    priorities: z.array(
      z.object({ value: z.string(), label: z.string(), kinds: z.array(entityKindSchema) }),
    ),
    severities: z.array(z.object({ value: z.string(), label: z.string() })),
    iterations: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })),
    statuses: z.object({
      story: z.array(z.object({ value: z.string(), label: z.string() })),
      task: z.array(z.object({ value: z.string(), label: z.string() })),
      bug: z.array(z.object({ value: z.string(), label: z.string() })),
    }),
  }),
});

export const filterFieldsRpc = defineRpc({
  name: "tapd.filter_fields",
  input: z.object({}),
  output: z.object({
    fields: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        kind: z.enum(["text", "enum", "date", "user"]),
        /** 单选字段（checkbox/radio） */
        single: z.boolean(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
        kinds: z.array(entityKindSchema),
      }),
    ),
  }),
});

export const createRpc = defineRpc({
  name: "tapd.create",
  input: z.object({
    kind: entityKindSchema,
    title: z.string(),
    description: z.string().default(""),
    owner: z.string().default(""),
    priority: z.string().default(""),
    iterationId: z.string().default(""),
  }),
  output: z.object({
    id: z.string(),
    kind: entityKindSchema,
    url: z.string(),
  }),
});

export const updateStatusRpc = defineRpc({
  name: "tapd.update_status",
  input: z.object({
    kind: entityKindSchema,
    id: z.string(),
    status: z.string(),
    /** 单据实际所在项目；为空回退首个配置项目 */
    workspaceId: z.string().default(""),
  }),
  output: z.object({ ok: z.boolean() }),
});

export const addCommentRpc = defineRpc({
  name: "tapd.add_comment",
  input: z.object({
    kind: entityKindSchema,
    id: z.string(),
    text: z.string(),
    /** 单据实际所在项目；为空回退首个配置项目 */
    workspaceId: z.string().default(""),
  }),
  output: z.object({ ok: z.boolean() }),
});

const entityChildItemSchema = z.object({
  kind: entityKindSchema,
  id: z.string(),
  title: z.string(),
  statusLabel: z.string(),
  owner: z.string(),
  priority: z.string(),
  url: z.string(),
});

export const entityRpc = defineRpc({
  name: "tapd.entity",
  input: z.object({ kind: entityKindSchema, id: z.string() }),
  output: z.object({
    kind: entityKindSchema,
    id: z.string(),
    /** 单据实际所在项目（回写状态/评论用） */
    workspaceId: z.string().default(""),
    title: z.string(),
    url: z.string(),
    status: z.string(),
    statusLabel: z.string(),
    owner: z.string(),
    creator: z.string(),
    priority: z.string(),
    iterationName: z.string().nullable(),
    createdAt: z.string(),
    modifiedAt: z.string(),
    description: z.string(),
    comments: z.array(
      z.object({
        id: z.string(),
        author: z.string(),
        createdAt: z.string(),
        text: z.string(),
      }),
    ),
    commentsError: z.string().nullable(),
    /** 仅需求：该需求下挂的任务 */
    childTasks: z.array(entityChildItemSchema).default([]),
    /** 仅需求：该需求下挂的缺陷 */
    childBugs: z.array(entityChildItemSchema).default([]),
    /** 仅需求：子单据真实总数（> 上限 200 说明列表被截断；0 = 未统计） */
    childTasksTotal: z.number().default(0),
    childBugsTotal: z.number().default(0),
    /** 仅任务/缺陷：所属需求 */
    parentStory: z.object({ id: z.string(), title: z.string(), url: z.string() }).nullable().default(null),
  }),
});

export const searchRpc = defineRpc({
  name: "tapd.search",
  input: z.object({ query: z.string() }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        subtitle: z.string(),
        url: z.url(),
        text: z.string(),
        resourceType: z.string(),
      }),
    ),
  }),
});

export const tapdAttachmentSource = defineAttachmentSource({
  id: "tapd",
  title: "TAPD 单据",
  icon: "ClipboardList",
  pickerTitle: "附加 TAPD 单据",
  searchPlaceholder: "输入标题关键字或单据 ID",
  search: searchRpc,
});

export const checkRpc = defineRpc({
  name: "tapd.check",
  input: z.object({
    token: z.string().optional(),
    workspaceIds: z.string().optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    message: z.string(),
    me: z.string().nullable(),
    workspaceCount: z.number(),
    tokenSource: z.enum(["env", "settings", "none"]),
  }),
});

export const updateCheckRpc = defineRpc({
  name: "tapd.update_check",
  input: z.object({}),
  output: z.object({
    currentVersion: z.string(),
    latestVersion: z.string(),
    latestCommit: z.string(),
    updateAvailable: z.boolean(),
    checkedAt: z.string(),
  }),
});

