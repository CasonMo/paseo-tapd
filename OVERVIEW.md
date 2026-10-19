TAPD workbench brings TAPD (stories, tasks, and bugs) into Paseo.

The main screen has an aggregate tab that shows stories, tasks, and bugs side by side, plus one tab per type. In the aggregate tab each column groups its items by status, and groups collapse and expand; a toolbar toggle turns grouping off. A type tab shows a board whose columns are the workflow statuses of that type, with colored status labels. All statuses of the selected type appear as columns, including empty ones; you can pick which columns to display. Filters cover keyword, owner, creator, status scope, iteration, updated-within window, priorities, bug severities, and labels, plus any field reported by the workspace's TAPD field definitions (synced automatically). A filter combination can be saved as a reusable view, switched from the toolbar, updated in place, or set as the default. The built-in "Related to me" view matches items where you are the owner, creator, developer, participator, watcher, or commenter, and stories whose linked tasks involve you. Cards can be starred to pin them to the top.

Opening an item shows status, owner, creator, iteration, description, and recent comments in a detail window, with actions to open it in TAPD or copy its link.

Workflow features: dispatch an item to a coding agent by picking a repository and provider/model; the plugin creates a worktree workspace and starts an agent whose prompt contains the item snapshot. Dispatched workspaces and agents are tracked from the item and the card. The plugin can write a comment back to TAPD (plain text converted to HTML), change the item's workflow status, and create new stories, tasks, or bugs from the board.

An item can also be linked to an existing agent from the item detail window. After binding, the agent receives a short notice message with the item snapshot, and the link is tracked on the card and in the detail window.

Agent sessions receive the TAPD connection variables (TAPD_TOKEN, TAPD_API_ENDPOINT, TAPD_SITE_URL, TAPD_WORKSPACE_IDS) when they are not already defined, so a linked agent can call the TAPD OpenAPI directly.

An attachment source lets you search TAPD items by keyword or ID while composing a prompt and attach a text snapshot (title, status, owner, link).

Connection and data: the plugin runs on the daemon side and calls the TAPD OpenAPI only, using the token solely as the TAPD Authorization header. Credentials and project IDs come from the plugin settings screen, falling back to the daemon environment variables TAPD_TOKEN and TAPD_WORKSPACE_IDS. A token saved in the plugin settings is stored as plain JSON on the daemon host and is readable by the connected settings interface; prefer the environment variable when that is a concern. The TAPD API base URL (default https://api.tapd.cn) and the web link base (default https://www.tapd.cn) can be overridden per daemon with the TAPD_API_ENDPOINT and TAPD_SITE_URL environment variables. Reads cover every configured project; write operations (comments, status changes, item creation) run only on explicit user action and target the first configured TAPD project. Agent dispatch goes through the Paseo SDK after confirmation in the dispatch dialog, and the item snapshot used as the agent prompt is sent to the selected agent provider. The plugin performs no filesystem writes of its own. When the workbench opens, the plugin checks for updates by fetching the public registry record and the manifest at the pinned commit from GitHub (api.github.com, falling back to raw.githubusercontent.com); no credentials or user data are sent and the result is cached for an hour. If the registry pins a newer version, the workbench shows a dismissible banner inviting the user to run the update command. Requires Paseo 0.11.2 or later. Known limits: commenter matching uses the 200 most recent comments; each board column shows at most 300 items.

## 中文

TAPD 工作台把 TAPD（需求、任务、缺陷）带进 Paseo。

主界面有一个聚合页签，需求、任务、缺陷三栏并排展示，另有每种类型一个独立页签。聚合页签里每栏按状态分组，分组可折叠展开，工具栏开关可关闭分组。类型页签展示看板，列即该类型的工作流状态，状态标签带颜色。所选类型的所有状态都会作为列出现（包括空列），你可以自选要显示哪些列。过滤支持关键词、负责人、创建人、状态范围、迭代、最近更新时间窗口、优先级、缺陷严重程度、标签，以及工作区 TAPD 字段定义上报的任意字段（自动同步）。一组过滤条件可保存为可复用视图，从工具栏切换、就地更新或设为默认。内置的「我相关的」视图匹配你是负责人、创建人、开发、参与、关注或评论过的单据，以及关联任务涉及你的需求。卡片可加星置顶。

打开单据会在详情浮窗中显示状态、负责人、创建人、迭代、描述与最近评论，并提供「在 TAPD 中打开」与「复制链接」操作。需求详情会额外读取该需求下挂的任务与缺陷（TAPD 的 task.story_id / bug.story_id，各限 200 条），在列表中展示标题、状态与处理人；点击列表项可在浮窗内切换到对应单据详情（未提供宿主导航时退化为在浏览器打开）。子单据读取失败不会阻塞需求详情本身。

工作流能力：选择仓库与 provider/model，可把单据派给一个编码 Agent；插件创建 worktree 工作区并启动一个提示词中包含单据快照的 Agent，派发的工作区与 Agent 可从单据和卡片追踪。插件可以把评论回写 TAPD（纯文本转 HTML）、变更单据工作流状态，并在看板上新建需求、任务或缺陷。

单据也可在详情浮窗中关联到一个已有 Agent。绑定后，该 Agent 会收到一条带单据快照的简短通知消息，卡片与详情浮窗都会记录这个关联。

Agent 会话在相关变量尚未定义时会收到 TAPD 连接变量（TAPD_TOKEN、TAPD_API_ENDPOINT、TAPD_SITE_URL、TAPD_WORKSPACE_IDS），从而可直接调用 TAPD OpenAPI。

附件源支持在撰写提示词时按关键词或 ID 搜索 TAPD 单据，并附上文本快照（标题、状态、负责人、链接）。

连接与数据：插件运行在 daemon 侧，只调用 TAPD OpenAPI，token 仅作为 TAPD Authorization 头使用。凭据与项目 ID 来自插件设置页，回退到 daemon 环境变量 TAPD_TOKEN 与 TAPD_WORKSPACE_IDS。保存在插件设置中的 token 以明文 JSON 存于 daemon 主机，可被已连接的设置界面读取；介意时请改用环境变量。TAPD API 基地址（默认 https://api.tapd.cn）与网页链接基地址（默认 https://www.tapd.cn）可分别用环境变量 TAPD_API_ENDPOINT、TAPD_SITE_URL 按 daemon 覆盖。读取覆盖所有已配置项目；写操作（评论、状态变更、建单）只在用户明确操作时执行，并作用于第一个配置的 TAPD 项目。派给 Agent 需在派发对话框中确认，经 Paseo SDK 执行，作为 Agent 提示词的单据快照会发送给所选的 agent provider。插件自身不做任何文件系统写入。工作台打开时，插件会从 GitHub 拉取公开的 registry 记录与固定提交处的清单来做更新检查（api.github.com，失败时回退 raw.githubusercontent.com）；不附带凭据、不发送用户数据，结果缓存一小时。若 registry 固定了更新的版本，工作台会显示一个可关闭的横幅，提示运行更新命令。需要 Paseo 0.11.2 或更高版本。已知限制：评论人匹配只取最近 200 条评论；每个看板列最多显示 300 个单据。
