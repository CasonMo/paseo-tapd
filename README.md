# Paseo TAPD Workbench

A Paseo plugin that brings TAPD (stories, tasks, and bugs) into your Paseo workspace: a three-column board, reusable views, agent dispatch, and comment/status write-back.

![TAPD workbench](assets/screenshots/workbench-v2.png)

## Features

- Aggregate tab (stories / tasks / bugs side by side, with collapsible status groups) plus one tab per type with a status-column kanban; selectable columns, colored status labels, and starred pinning
- Views as reusable filter presets: built-in "Related to me" (owner, creator, developer, participator, watcher, or commenter, plus linked-task involvement), plus keyword, owner, creator, status scope, iteration, updated-within, priorities, bug severities, labels, and any field from the workspace's TAPD field definitions
- Detail window with description, comments, open-in-TAPD, and copy-link
- Dispatch to an agent: pick a repository and provider/model; the plugin creates a worktree workspace and starts an agent preloaded with the item snapshot, then tracks it from the card
- Write back to TAPD: comments (plain text converted to HTML), workflow status changes, and new item creation
- Attachment source: search TAPD items while composing a prompt and attach a snapshot
- Agent binding: pick an agent from the item detail window to link it to the item; the bound agent receives a short follow-up notice with the item snapshot, and agent sessions receive the TAPD environment variables (when not already defined) so a linked agent can query and update TAPD

## Install

Requires Paseo >= 0.11.2 (daemon and client).

```bash
# from GitHub
paseo plugin add git:CasonMo/paseo-tapd

# or from any Git source
paseo plugin add git:<repo-url>
```

After installing, enable the plugin under Settings → Plugins and configure it:

- API Token: TAPD OpenAPI token (falls back to the daemon env var `TAPD_TOKEN`)
- Project IDs: TAPD `workspace_id` list (falls back to `TAPD_WORKSPACE_IDS`)

Use "Test connection" in the plugin settings to verify.

## Agent binding

Pick an agent from the item detail window to link the item to that conversation. The bound agent receives a short follow-up notice with the item snapshot, and agent sessions receive the TAPD connection variables when they are not already defined so the agent can query and update TAPD.

## Security

- No credentials are stored in this repository. The token is used only by the daemon-side plugin, as the TAPD `Authorization` header.
- Prefer environment variables (`TAPD_TOKEN`, `TAPD_WORKSPACE_IDS`). A token saved in the plugin settings is stored as plain JSON on the daemon host and is readable by the connected settings interface.
- The plugin calls only the TAPD OpenAPI. The API base URL and web link base can be overridden per daemon with `TAPD_API_ENDPOINT` and `TAPD_SITE_URL`.
- Reads cover every configured project. Write operations (comments, status changes, item creation) target the first configured TAPD project.
- Agent dispatch sends the item snapshot (used as the prompt) to the selected agent provider through the Paseo SDK.

## Development

```bash
npm install
npm run typecheck
npm run lint                                       # React Hooks rule check
paseo plugin install /absolute/path/to/this/repo   # install from a local directory
paseo plugin reload tapd-workbench                 # reload after edits
```

## License

MIT

---

## 中文说明（简版）

TAPD 工作台 Paseo 插件：聚合（三栏并排，按状态分组可折叠）+ 需求/任务/缺陷 tab，按状态分列看板（列可自选）、可复用视图过滤（内置「我相关的」）、单据详情浮窗、派给 Agent（worktree + agent 关联追踪）、评论与状态回写、单据快照附件源、工作台内直接建单。

安装：`paseo plugin add git:CasonMo/paseo-tapd`（需 Paseo >= 0.11.2），安装后在插件设置中填写 TAPD Token 与项目 ID（或配置环境变量 `TAPD_TOKEN` / `TAPD_WORKSPACE_IDS`）。支持绑定 Agent：在单据详情浮窗里把单据关联到一个已有 Agent；绑定后自动给该 Agent 发送跟进提示词，并为其注入 TAPD 环境变量以便直接调用 OpenAPI。能力与数据流向的完整说明见 `OVERVIEW.md`。
