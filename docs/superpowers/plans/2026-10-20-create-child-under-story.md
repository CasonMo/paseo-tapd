# 需求详情一键创建任务/缺陷 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在需求详情浮窗提供「+ 创建任务 / + 创建缺陷」，创建表单预挂 parent（story_id + 正确 workspace），创建后浮窗内子单列表即时可见。

**Architecture:** 复用现有三条既有通道 —— 详情浮窗的 `extras.onXxx(data)` 回调派发模式、CreateEntityModal 全局创建入口、`tapd.create` RPC。服务端 `createEntity` 增加可选 `storyId`/`workspaceId` 透传 TAPD `story_id` 参数；客户端新增 `onCreateChild` 回调把详情快照带到创建弹窗。无新设置项，无 schema 迁移。

**Tech Stack:** TypeScript / react-native 0.81 客户端 + @tanstack/react-query，共享 zod contracts，daemon 侧 fetch 封装（server/tapd.ts）。无新依赖。

## Global Constraints

- 不打印/回显任何 token；错误文案沿用现有管道（已脱敏）。
- 所有写操作必须是用户显式点击（本功能入口 = 详情浮窗按钮，满足）。
- "挂载目标 workspace 以详情快照为准"（spec 已定），缺省回退 `workspaceIds[0]` 保持现状行为。
- 每个任务完成即可独立 typecheck + commit；仓库无单测框架，验证 = `pnpm run typecheck` + `pnpm run lint` 0 error（4 个既有 unused eslint-disable warning 允许）+ 末尾真机手测。
- 版本发布末尾统一 bump `package.json` + `shared/version.ts`（同步），README/OVERVIEW 同步更新。
- 脱敏：代码/注释/文档/提交信息不得出现真实 workspace、单据 ID、人名；用 `<story-id>`、`<workspace-id>` 占位。

---

### Task 1: contracts —— `tapd.create` 输入增加 storyId / workspaceId

**Files:**
- Modify: `shared/contracts.ts:309-320`（createRpc input）

**Interfaces:**
- Consumes: 现有 `createRpc`（name `tapd.create`）
- Produces: `createRpc` input 新增 `storyId: string`、`workspaceId: string`（均 zod `.default("")`，旧调用方零影响）

- [ ] **Step 1: 修改 input schema**

```ts
export const createRpc = defineRpc({
  name: "tapd.create",
  input: z.object({
    kind: entityKindSchema,
    title: z.string(),
    description: z.string().default(""),
    owner: z.string().default(""),
    priority: z.string().default(""),
    iterationId: z.string().default(""),
    /** 挂载的需求 ID（仅 task/bug；留空不挂载） */
    storyId: z.string().default(""),
    /** 单据所在项目，缺省用 daemon 配置的第一个项目 */
    workspaceId: z.string().default(""),
  }),
```

- [ ] **Step 2: `pnpm run typecheck` 通过（预期：server 侧尚不消费新字段，不受影响）**

- [ ] **Step 3: Commit**

```bash
git add shared/contracts.ts
git commit -m "feat: create rpc accepts optional story id and workspace id"
```

---

### Task 2: server —— `createEntity` 透传 story_id 与 workspace

**Files:**
- Modify: `server/tapd.ts:826-857`（`CreateEntityInput` + `createEntity`）

**Interfaces:**
- Consumes: Task 1 的 `createRpc` input（server/handlers.ts 里 handler 已直传 input，无需改 handlers）
- Produces: `CreateEntityInput` 新增可选 `storyId?: string`、`workspaceId?: string`

- [ ] **Step 1: 扩接口与实现**

```ts
export interface CreateEntityInput {
  kind: EntityKind;
  title: string;
  description: string;
  owner: string;
  priority: string;
  iterationId: string;
  /** 挂载的所属需求 ID（仅 task/bug 生效） */
  storyId?: string;
  /** 单据所在项目；缺省仍取 workspaceIds[0] */
  workspaceId?: string;
}
```

`createEntity` 内第一行改为：

```ts
  const workspaceId = (input.workspaceId ?? "").trim() || config.workspaceIds[0] || "";
```

并在 `iteration_id` 参数之后追加：

```ts
  if (input.kind !== "story" && (input.storyId ?? "").trim()) {
    params.story_id = (input.storyId ?? "").trim();
  }
```

- [ ] **Step 2: `pnpm run typecheck` 通过**

- [ ] **Step 3: Commit**

```bash
git add server/tapd.ts
git commit -m "feat: create entity under a story and honor caller workspace"
```

---

### Task 3: CreateEntityModal —— parent 预填

**Files:**
- Modify: `client/workbench/CreateEntityModal.tsx`（props、kind chips、提交 payload、说明行）

**Interfaces:**
- Consumes: Task 1 的 `storyId`/`workspaceId` input 字段
- Produces: 新导出类型 `CreateChildPreset`

```ts
export interface CreateChildPreset {
  kind: "task" | "bug";
  storyId: string;
  workspaceId: string;
  storyTitle: string;
  storyUrl: string;
}
```

- [ ] **Step 1: props 增加 initial**

```ts
export function CreateEntityModal({ open, onClose, theme, onCreated, initial }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  onCreated: (created: CreatedEntity) => void;
  initial?: CreateChildPreset | null;
}) {
```

- [ ] **Step 2: 重置逻辑适配（原 open 切换时 `setKind("story")` 一处，约 46 行）**：改为 `setKind(initial?.kind ?? "story")`，并把该 effect 依赖加上 `initial`；title/desc/owner/priority/iterationId 清空逻辑保持不变

- [ ] **Step 3: kind 切换 chips 条件化（约 187 行的映射数组）**

```ts
{ (initial ? (["task", "bug"] as const) : (["story", "task", "bug"] as const)).map((item) => (
```

- [ ] **Step 4: 顶部挂载说明行（渲染在 kind chips 行上方，仅 initial 存在时）**

```tsx
{initial ? (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>挂载到</Text>
    <Pressable accessibilityRole="button" onPress={() => void openExternalUrl(initial.storyUrl)}>
      <Text style={{ ...styles.link, flex: 1 }} numberOfLines={1}>
        #{initial.storyId} {initial.storyTitle || "（标题未获取）"}
      </Text>
    </Pressable>
  </View>
) : null}
```

（`openExternalUrl` 该文件若未导入，从本仓库其他浮窗同款 `import { openExternalUrl } from "./link-utils"` 导入；若 link-utils 无此函数，用 `ncp/clipboard` 同域已有实现方式——以 `EntityDetailModal.tsx` 中 `openExternalUrl(data.url)` 的导入来源为准。）

- [ ] **Step 5: 提交 payload 带上 parent（约 76 行 create(…) 调用）**

```ts
const created = await create({
  kind, title: trimmed, description, owner, priority, iterationId,
  storyId: initial ? initial.storyId : undefined,
  workspaceId: initial ? initial.workspaceId : undefined,
});
```

- [ ] **Step 6: `pnpm run typecheck` + lint 通过**

- [ ] **Step 7: Commit**

```bash
git add client/workbench/CreateEntityModal.tsx
git commit -m "feat: create modal supports prefilled story parent"
```

---

### Task 4: 详情浮窗 —— story 专属创建入口

**Files:**
- Modify: `client/workbench/EntityDetailModal.tsx:20-32`（DetailExtras）、:316-333（操作按钮行）

**Interfaces:**
- Consumes: `EntityDetailData`（详情快照，含 `kind/id/title/url/workspaceId`）
- Produces: `DetailExtras.onCreateChild?: (data: EntityDetailData) => void`（WorkbenchScreen 在 Task 5 消费）

- [ ] **Step 1: DetailExtras 增加回调（`onStatus` 之后）**

```ts
  /** 需求详情：一键创建挂在该需求下的任务/缺陷 */
  onCreateChild?: (data: EntityDetailData) => void;
```

- [ ] **Step 2: 操作按钮行追加两个按钮（紧跟「复制链接」按钮 Pressable 之后、「刷新」之前）**

```tsx
{kind === "story" && extras.onCreateChild ? (
  <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="创建该需求下的任务"
      style={styles.action}
      onPress={() => extras.onCreateChild?.(data)}
    >
      <Icon name="Plus" size={14} color={theme.colors.foreground} />
      <Text style={styles.actionLabel}>+ 任务</Text>
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="创建该需求下的缺陷"
      style={styles.action}
      onPress={() => extras.onCreateChild?.(data)}
    >
      <Icon name="Bug" size={14} color={theme.colors.foreground} />
      <Text style={styles.actionLabel}>+ 缺陷</Text>
    </Pressable>
  </>
) : null}
```

约定：两个按钮同一回调，WorkbenchScreen 需知道 child kind —— 在回调签名上区分：改为 `onCreateChild?: (data: EntityDetailData, childKind: "task" | "bug") => void`，任务传 `"task"`、缺陷传 `"bug"`（对应替换 Step 2 两个 onPress 为 `() => extras.onCreateChild?.(data, "task")` / `…, "bug")`）。以回调带第二参版本为准。

- [ ] **Step 3: `pnpm run typecheck` 通过（此时 WorkbenchScreen 尚未传 onCreateChild，可选 prop 无影响）**

- [ ] **Step 4: Commit**

```bash
git add client/workbench/EntityDetailModal.tsx
git commit -m "feat: one-click create task or bug from story detail"
```

---

### Task 5: WorkbenchScreen —— 打线、创建后刷新详情

**Files:**
- Modify: `client/workbench/WorkbenchScreen.tsx:57-60`（create state）、:342-350（handleCreated）、:586（CreateEntityModal props）、detailExtras 对象（:377-386 附近）

**Interfaces:**
- Consumes: Task 3 `CreateChildPreset`、Task 4 `onCreateChild(data, childKind)`
- Produces: 完整用户流程闭环

- [ ] **Step 1: state 增加 preset（`createOpen` 保留用于关闭态联动）**

```ts
const [createPreset, setCreatePreset] = useState<CreateChildPreset | null>(null);
```

import 增加 `import { CreateChildPreset, CreateEntityModal, type CreatedEntity } from "./CreateEntityModal"`（合并到现有 import 行）。

- [ ] **Step 2: 详情回调（detailExtras 对象内新增一行）**

```ts
onCreateChild: (data, childKind) => {
  setCreatePreset({
    kind: childKind,
    storyId: data.id,
    workspaceId: data.workspaceId,
    storyTitle: data.title,
    storyUrl: data.url,
  });
  setCreateOpen(true);
},
```

- [ ] **Step 3: handleCreated 创建成功后刷新打开中的需求详情（在现有 board 逻辑同处）**

```ts
if (createPreset) {
  setCreatePreset(null);
  queryClient.invalidateQueries({ queryKey: ["tapd-entity", "story", createPreset.storyId] });
}
```

（`queryClient` 若组件里尚未实例化：`const queryClient = useQueryClient()`，react-query 已在依赖内；`invalidateQueries` 前缀匹配三个键即可命中浮窗当前 `["tapd-entity", kind, id, refreshToken]` 缓存。）

- [ ] **Step 4: CreateEntityModal 传参（:586）**

```tsx
<CreateEntityModal
  open={createOpen}
  initial={createPreset}
  onClose={() => { setCreateOpen(false); setCreatePreset(null); }}
  theme={theme}
  onCreated={handleCreated}
/>
```

- [ ] **Step 5: `pnpm run typecheck` + lint 通过**

- [ ] **Step 6: Commit**

```bash
git add client/workbench/WorkbenchScreen.tsx
git commit -m "feat: wire story-detailed child creation into workbench"
```

---

### Task 6: 手测 + 文档 + 版本发布 v0.4.16

**Files:**
- Modify: `README.md`（功能列表）、`OVERVIEW.md`（能力描述）、`package.json`、`shared/version.ts`

- [ ] **Step 1: 真机手测（本地插件已重载即生效）单项目 + 多项目各验：**
  1. 打开某需求详情 → 出现「+ 任务」「+ 缺陷」
  2. 点击 → 弹窗顶部显示「挂载到 #<story-id> <title>」，kind 仅 任务/缺陷
  3. 填标题提交 → toast 成功；浮窗任务/缺陷列表即时出现新单
  4. 全局（非挂载）创建入口行为不变（kind 三选项、无挂载行）

- [ ] **Step 2: README 功能列表 + OVERVIEW 能力描述追加一行（中英各一）：** 「需求详情一键创建任务/缺陷，预挂父需求（story_id）且写入正确项目」/ EN 对应句

- [ ] **Step 3: bump 版本：`package.json` 与 `shared/version.ts` 同步改 `0.4.16`**

- [ ] **Step 4: `pnpm run typecheck` + `pnpm run lint` 0 error；diff 脱敏扫描（rg 真实 ID/人名/token）**

- [ ] **Step 5: 提交并按仓库规范推送**（origin 直接推；github 走 `/tmp/github-relay.mjs` 本地中继 + `-c http.version=HTTP/1.1`）

```bash
git add -A && git commit -m "feat: create task or bug under story (v0.4.16)" && git push origin main
```

- [ ] **Step 6: registry pin PR**（`/tmp/plugins-reg`：由 upstream/main 新建 `pin-tapd-workbench-0.4.16` 分支，改 `plugins/casonmo/tapd-workbench.json` 的 `artifact.commit`/`repository.commit` 为新提交哈希，`--head CasonMo:pin-tapd-workbench-0.4.16` 建 PR）

---

## Self-Review

- **Spec 覆盖**：spec 四步 = Task 1+2（服务端）、3（预填弹窗）、4（浮窗入口）、5（接线+刷新）、6（文档版本）；spec 的错误边界（TAPD 拒绝→toast 原文）、多项目 workspace 取详情快照（Task 2/5）、创建后立即由详情浮窗刷新（Task 5 Step 3）均已落任务。
- **占位符**：无 TBD；Task 3 Step 4 的 openExternalUrl 导入给了明确判定来源（EntityDetailModal 现有导入）。
- **类型一致性**：`CreateChildPreset`（Task 3 定义）与 Task 5 Step 1/2 字段一致；`onCreateChild(data, childKind)`（Task 4 定稿版本）与 Task 5 Step 2 用法一致；`createRpc` input 新字段与 Task 2 的 `CreateEntityInput.storyId/workspaceId` 同名同义。

---

## 追加波次（用户评审后扩充）

### Task 7: 服务端 createFields RPC + current-user 默认值

**Files:**
- Modify: `server/tapd.ts`（新增 `fetchCreateFields`）、`server/handlers.ts`（挂 RPC）、`shared/contracts.ts`（`createFieldsRpc` + `createRpc.input.extraFields`）

**Interfaces:**
- Produces: `createFieldsRpc`（input `{ kind, workspaceId? }`，output `{ me: string, fields: { key, label, inputKind: "input"|"textarea"|"select"|"date", options: {value,label}[], required: boolean }[] }`）；`createEntity` 支持 `extraFields: Record<string,string>`（denylist 兜底过滤）

- [ ] 服务端实现 `fetchCreateFields`（fields_info 按 kind 单类型拉，过滤只读/`CREATE_FIELD_DENYLIST`：`name,title,description,owner,current_owner,priority_label,iteration_id,parent_id,story_id,workspace_id,status,id,created,modified` 等系统列；options 来自 fields_info options dict）
- [ ] `fetchMe(config).nick` 作为 `me` 返回（失败空串）
- [ ] `createEntity` 追加 extraFields 合并：key 经 denylist+story_id/workspace_id 排除后进 params
- [ ] contracts + handlers 注册，typecheck，commit

### Task 8: 客户端 preset 动态表单 + 处理人默认

**Files:**
- Modify: `client/workbench/CreateEntityModal.tsx`

- [ ] preset 存在时拉 `createFieldsRpc`；动态行渲染在静态行之后（input/textarea/multiline、select≤8 用 chips、其余 TextInput 兜底；date 提示 YYYY-MM-DD 文本输入）
- [ ] 处理人（owner 静态行）在 preload me 得到且用户未改过时预填 `me`
- [ ] 提交时把非空动态值打包 `extraFields` 传给 create RPC
- [ ] typecheck/lint，真机手测追加：动态字段可见、处理人默认本人、创建成功且字段生效
