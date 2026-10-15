# Paseo TAPD 工作台

Paseo 插件：在 Paseo 内查看与处理 TAPD 需求 / 任务 / 缺陷。

## 功能

- 三栏工作台（需求 / 任务 / 缺陷），列内按状态分组（可折叠）、收藏置顶（星标）
- 视图：过滤条件自由组合并保存复用；内置「我相关的」（处理人 / 创建人 / 抄送人 / 评论人 并集）
- 过滤维度：状态、更新时间、关键词、处理人、创建人、迭代、优先级、严重程度、标签，以及从 TAPD 字段定义动态同步的任意字段
- 详情：描述、评论列表、跳转 TAPD 网页
- 派给 Agent：选择仓库与模型，一键创建 worktree 工作区并启动携带单据上下文的 agent；卡片与详情可追踪关联
- 回写 TAPD：提交评论（自动转 HTML）、切换工作流状态
- 组合器附件源：在对话中搜索 TAPD 单据并以快照形式附加到 prompt
- 新建单据：从工作台直接创建需求 / 任务 / 缺陷

## 安装

需要 Paseo >= 0.11.2（daemon 与客户端）。团队内网 Git 安装：

```bash
paseo plugin add git:<repo-url>
```

安装后在 Settings → Plugins 启用（插件开关需打开），并在插件设置中配置：

- API Token：TAPD OpenAPI Token（留空则读取 daemon 环境变量 `TAPD_TOKEN`）
- 项目 ID：TAPD `workspace_id`（留空则读取 `TAPD_WORKSPACE_IDS`）

设置后可点「测试连接」验证。

## 开发

```bash
npm install
npm run typecheck
npm run lint                                       # React Hooks 规则检查（防 #310）
paseo plugin install /absolute/path/to/this/repo   # 本地目录安装
paseo plugin reload tapd-workbench                 # 修改后重载
```

## 安全说明

- 仓库中不保存任何凭证；Token 仅在 daemon 侧进程中使用，用于调用 TAPD OpenAPI
- 建议通过环境变量 `TAPD_TOKEN` / `TAPD_WORKSPACE_IDS` 配置
- 若在插件设置页填写 Token，将以明文 JSON 保存在 daemon 本机（Paseo 插件设置非加密保管库）
