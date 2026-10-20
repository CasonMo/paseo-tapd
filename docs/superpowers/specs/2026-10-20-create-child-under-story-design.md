# 设计：需求详情一键创建任务/缺陷（v0.4.16）

日期：2026-10-20
状态：待评审

## 背景

插件目前只能在设置页全局入口创建单据（无预填上下文），要在某个需求下补任务/缺陷时得手动记需求 ID 或去 TAPD 网页操作。本波只做一件事：把「在该需求下创建任务/缺陷」做顺。

## 范围

- 需求详情浮窗新增「+ 创建任务」「+ 创建缺陷」入口
- CreateEntityModal 支持 parent 预填（锁定 kind、展示挂载目标）
- 服务端创建透传 `story_id` 与正确的 `workspace_id`
- 其余候选（拖拽改状态、虚拟化、侧滑详情、紧凑密度等）本波不做

## 设计

### 数据流

1. EntityDetailModal（kind=story）头部操作区加两个按钮，回调 `onCreateChild("task" | "bug")`
2. WorkbenchScreen 收到回调 → 打开 CreateEntityModal，传入
   `initial = { kind, storyId, storyWorkspaceId, storyTitle, storyUrl }`
   - 数据源：当前详情的快照（id、workspaceId 均在上下文内；title 已有）
3. CreateEntityModal 变化：
   - 新 prop `initial`（可选，不传则行为与现状完全一致）
   - kind 切换仅 `task`/`bug` 两项；默认 initial.kind
   - 顶部说明行：「将挂到需求 #<id> <title>（可点开）」
   - 提交时把 `storyId`、`workspaceId` 一并发给 `createRpc`
4. 服务端 `createEntity`：
   - `CreateEntityInput` 增加可选 `storyId`、`workspaceId`
   - `workspaceId` 缺省仍回退 `workspaceIds[0]`（现状行为）
   - kind ≠ story 且 storyId 非空时写参数 `story_id`
   - 创建成功返回体不变

### 创建后刷新

- 详情浮窗的子任务/缺陷列表来自 detail query；创建成功后按现有 tapd-entity 详情 query key 作废缓存，浮窗未关闭时列表自动重新拉取，新子单即时可见

### 错误与边界

- TAPD 拒绝（如需求状态不允许挂子单）：toast 显示 TAPD 返回原文（现管道已脱 token）
- story 详情本身 workspace 与配置第一阶段项目不一致：以详情 workspaceId 为准传参，避免挂错项目
- 未选中需求时按钮不出现；任务/缺陷详情无此入口

### 测试

- 手工：多项目 + 单项目各验一次；创建后浮窗内列表即时出现新单
- smoke：`/tmp/tapd-sync-test` 回归不受影响（无设置结构变更）
- typecheck + lint

## 不做什么

- 不动看板拖拽、虚拟化、侧滑面板、紧凑密度（留待后续波次）
- 不加新设置项，不动同步
