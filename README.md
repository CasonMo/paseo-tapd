# Paseo TAPD Workbench

A Paseo plugin that brings TAPD (stories, tasks, and bugs) into your Paseo workspace: a three-column board, reusable views, agent dispatch, and comment/status write-back.

![TAPD workbench](assets/screenshots/workbench-v2.png)

## Features

- Aggregate tab (stories / tasks / bugs side by side, with collapsible status groups) plus one tab per type with a status-column kanban; selectable columns, colored status labels, and starred pinning
- Views as reusable filter presets: built-in "Related to me" (owner, creator, developer, participator, watcher, or commenter, plus linked-task involvement), plus keyword, owner, creator, status scope, iteration, updated-within, priorities, bug severities, labels, and any field from the workspace's TAPD field definitions
- Detail window with description, comments, open-in-TAPD, and copy-link; story details additionally list the tasks and bugs attached to the story (paginated, with a truncation hint past 200), and task/bug details link back to their parent story
- Task/bug cards show `#id` on its own line under the title plus a "story: title" chip; details-page child-list row titles show the full text in a hover tooltip
- Dispatch to an agent: pick a repository and provider/model; the plugin creates a worktree workspace and starts an agent preloaded with the item snapshot, then tracks it from the card
- Write back to TAPD: comments (plain text converted to HTML), workflow status changes, and new item creation
- Attachment source: search TAPD items while composing a prompt and attach a snapshot
- Agent binding: pick an agent from the item detail window to link it to the item; the bound agent receives a short follow-up notice with the item snapshot, and agent sessions receive the TAPD environment variables (when not already defined) so a linked agent can query and update TAPD
- Settings sync via Git: point the plugin at your own Git repository (URL + access token in settings) and push a backup, or pull to restore views, favorites, board columns, item↔agent links, and switches after uninstall/reinstall; the synced file is `tapd-workbench-settings.json`; privacy-sensitive fields never leave the machine: the TAPD token, project IDs, the Git token, and the local dispatch repo path
- Update check: when the registry pins a newer version, the workbench shows a top banner with the update command (`paseo plugin update tapd-workbench`)

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
- Reads cover every configured project. Write operations (comments, status changes, item creation) target the item's actual project when known, falling back to the first configured TAPD project.
- Agent dispatch sends the item snapshot (used as the prompt) to the selected agent provider through the Paseo SDK.
- Update checks fetch the public registry record and this repository's manifest at the pinned commit from GitHub (`raw.githubusercontent.com`, falling back to `api.github.com`). No credentials are attached and no user data is sent; the result is cached for an hour.
- Settings sync contacts exactly one extra destination: the Git remote the user configured in settings (HTTPS URL + access token, or an SSH URL). Push/pull only happen on the explicit buttons in settings; the synced payload is the sanitized settings JSON (`tapd-workbench-settings.json`, no TAPD token, no Git token) written by the daemon to a temporary clone that is deleted after each operation. In HTTPS mode the Git token is transmitted to the configured Git host during clone/push and is stored in the temporary clone's `.git/config` until the clone is deleted; error text never echoes the token, and pulling cannot replace the locally configured sync destination (URL/branch) or import secret fields.

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

# 中文说明

一款把 TAPD（需求、任务、缺陷）带进 Paseo 工作区的插件：三栏并排看板、可复用视图、派给 Agent、评论与状态回写。

![TAPD 工作台](assets/screenshots/workbench-v2.png)

## 功能

- 聚合页签（需求 / 任务 / 缺陷三栏并排，按状态分组可折叠）+ 每个类型一个独立页签的状态列看板；列可自选、状态标签带颜色、卡片可加星置顶
- 视图 = 可复用的过滤预设：内置「我相关的」（负责人、创建人、开发、参与、关注或评论过，以及关联任务涉及我），另支持关键词、负责人、创建人、状态范围、迭代、最近更新时间、优先级、缺陷严重程度、标签，以及工作区 TAPD 字段定义中的任意字段
- 单据详情浮窗：描述、评论、在 TAPD 中打开、复制链接；需求详情额外展示该需求下挂的任务列表与缺陷列表（分页展示，超过 200 条时显示「前 200 / 共 N 条」截断提示，点击可切换到对应单据详情）；任务/缺陷详情显示所属需求入口；关联的 Agent 以名称显示并实时展示状态与最近工作结果
- 任务/缺陷卡片把 `#id` 独立展示在标题下一行，并显示「需求：所属需求」标识；详情浮窗中子单据列表行标题悬停时在行内展开全文
- 派给 Agent：选择仓库与 provider/model；插件创建 worktree 工作区并启动一个预置了单据快照的 Agent，之后可从卡片追踪
- 看板秒开：89 秒内的看板数据直接复用（同一过滤条件各自独立缓存）；过期先显示上次数据并在顶部提示「后台刷新中…」，同时后台重拉，刷新完成后自动更新；「刷新」按钮强制绕过缓存
- Agent 状态：看板卡片「已关联」标签内的小圆点与详情面板「关联任务」行实时显示 Agent 状态（运行中绿 / 启动中黄 / 异常红 / 空闲或已关闭灰），详情面板还可展开查看最近一次工作结果摘要，事件流驱动、随 Agent 动态刷新
- Agent 自动回评：设置 → Agent 开关打开后，派给已关联单据的 Agent 每跑完一轮，自动把结果摘要作为评论写回该单据（默认关闭）
- 回写 TAPD：评论（纯文本自动转 HTML）、工作流状态变更、新建单据
- 附件源：撰写提示词时搜索 TAPD 单据并附上快照
- Agent 绑定：在单据详情浮窗中选择一个 Agent 关联该单据；绑定后该 Agent 会收到一条带单据快照的简短跟进提示，Agent 会话会在未定义时注入 TAPD 环境变量，使其可直接查询与更新 TAPD
- 配置同步（Git）：在设置里填自己的 Git 仓库地址与访问令牌，可把视图 / 收藏 / 看板列 / 单据关联记录 / 开关等设置一键推送备份，或从仓库拉取恢复（卸载重装后凭此找回关联）；同步文件为仓库根目录的 `tapd-workbench-settings.json`，隐私字段不出本机：TAPD Token、项目 ID、Git 令牌、派活仓库路径均不参与同步
- 更新检查：registry 固定到新版本时，工作台顶部显示带更新命令的横幅（`paseo plugin update tapd-workbench`）

## 安装

需要 Paseo >= 0.11.2（daemon 与 client）。

```bash
# 从 GitHub
paseo plugin add git:CasonMo/paseo-tapd

# 或任意 Git 源
paseo plugin add git:<repo-url>
```

安装后在 设置 → 插件 中启用并配置：

- API Token：TAPD OpenAPI token（未填写时回退 daemon 环境变量 `TAPD_TOKEN`）
- 项目 ID：TAPD `workspace_id` 列表（回退 `TAPD_WORKSPACE_IDS`）

可在插件设置中用「测试连接」验证。

## Agent 绑定

在单据详情浮窗里选择一个 Agent，把单据关联到该会话。绑定的 Agent 会收到一条带单据快照的跟进提示；Agent 会话在未定义时会收到 TAPD 连接环境变量，便于 Agent 直接查询与更新 TAPD。

关联建立后，看板卡片的「已关联」标签内和详情面板都会显示 Agent 实时状态（绿 = 运行中、黄 = 启动中、红 = 异常、灰 = 空闲/已关闭），详情面板可展开查看最近一次工作的结果摘要。在 设置 → Agent 打开「完成工作后自动回写 TAPD 评论」后，Agent 每完成一轮工作，插件会把结果摘要自动作为评论写回关联的单据。

## 安全

- 本仓库不存储任何凭据。Token 仅由 daemon 侧插件使用，作为 TAPD 的 `Authorization` 头。
- 优先使用环境变量（`TAPD_TOKEN`、`TAPD_WORKSPACE_IDS`）。保存在插件设置中的 token 以明文 JSON 存于 daemon 主机，可被已连接的设置界面读取。
- 插件只调用 TAPD OpenAPI。API 基地址与网页链接基地址可用 `TAPD_API_ENDPOINT`、`TAPD_SITE_URL` 按 daemon 覆盖。
- 读取覆盖所有已配置项目。写操作（评论、状态变更、建单）优先作用于单据实际所在项目（无法确定时回退第一个配置的 TAPD 项目）。
- 看板与单条接口结果缓存在 daemon 内存（看板整体 90 秒 SWR、单条请求 20 秒、元数据最长 30 分钟），跨项目列表请求按项目并行发出。缓存只在本机 daemon 内存里，不落盘不外传；修改插件设置会清空全部缓存，「刷新」按钮可强制取最新。
- 派给 Agent 时，单据快照（作为提示词）经 Paseo SDK 发送给所选的 agent provider。
- Agent 状态与结果摘要通过插件自身的 daemon RPC 读取，不新增外部网络目的地；自动回评使用与手动评论相同的 TAPD OpenAPI 评论通道。
- 更新检查从 GitHub 拉取公开的 registry 记录与固定提交处的本仓库清单（`raw.githubusercontent.com`，失败时回退 `api.github.com`），不附带凭据、不发送用户数据，结果缓存一小时。
- 配置同步只新增一个网络目的地：用户在设置里填写的 Git 仓库（HTTPS 地址 + 访问令牌，或 SSH 地址）。推送/拉取只由设置页的按钮触发；上传/下载内容为脱敏后的设置 JSON（`tapd-workbench-settings.json`，不含 TAPD Token 与 Git 令牌），daemon 侧在临时目录克隆、用完即删。HTTPS 模式下 Git 令牌在克隆/推送时会发送到仓库服务器，并暂存于临时克隆目录的 `.git/config` 中（目录删除即清除）；报错信息不回显令牌，拉取不会改变本机同步目的地（地址/分支），也不会导入任何密钥字段。

## 开发

```bash
npm install
npm run typecheck
npm run lint                                       # React Hooks 规则检查
paseo plugin install /本仓库的绝对路径               # 从本地目录安装
paseo plugin reload tapd-workbench                 # 修改后重新加载
```

## 许可证

MIT
