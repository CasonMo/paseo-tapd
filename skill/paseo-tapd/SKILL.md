---
name: paseo-tapd
description: TAPD OpenAPI 操作技能：查询需求、任务、缺陷，写评论、流转状态、创建单据。当用户要求查看、跟进 TAPD 单据或把进展写回 TAPD 时使用。
allowed-tools: Bash,Read
---

# TAPD 操作技能

直接用 curl 调用 TAPD OpenAPI，凭证来自环境变量（若缺少，提示用户在 Paseo 的「TAPD 工作台」插件设置里配置，或让用户直接在插件界面操作）：

| 变量 | 说明 |
| --- | --- |
| `TAPD_TOKEN` | Bearer Token（**禁止打印或泄露**） |
| `TAPD_API_ENDPOINT` | API 端点（默认 `https://api.tapd.cn`） |
| `TAPD_SITE_URL` | 网页域名（默认 `https://www.tapd.cn`，拼单据链接用） |
| `TAPD_WORKSPACE_IDS` | 项目 ID 列表（逗号分隔；**写操作使用第一个项目**） |

## 基本调用

```bash
WS=$(echo "${TAPD_WORKSPACE_IDS:-$TAPD_WORKSPACE_ID}" | cut -d',' -f1)
API="${TAPD_API_ENDPOINT:-https://api.tapd.cn}"

curl -s -H "Authorization: Bearer $TAPD_TOKEN" \
  "$API/stories?workspace_id=$WS&limit=10&order=modified%20desc"
```

响应恒为 `{"status":1,"data":[...],"info":"success"}`；`status != 1` 即失败（原因在 `info`）。列表行按类型包裹：`{"Story":{...}}`、`{"Task":{...}}`、`{"Bug":{...}}`。

查当前用户身份：`curl -s -H "Authorization: Bearer $TAPD_TOKEN" "$API/users/info"`（`nick` 即为人员参数要用的中文名）。

## 关键规则（实测总结，务必遵守）

1. 人员参数传**中文显示名**（如 `owner=张三`）；英文登录名查不到。
2. 多值枚举用 `|` 连接：`status=new|in_progress`、`priority_label=P0|P1`（URL 编码 `%7C`）。
3. 时间用 `~` 区间：`modified=2026-10-01~2099-12-31`；`>` 可用，但 **`>=` 会被静默忽略**。
4. 缺陷参数名与需求/任务不同：处理人 `current_owner`（`owner` 无效）、创建人 `reporter`、开发人员 `de`；需求/任务用 `owner` / `creator` / `developer`。
5. 用 `fields=id,name,status,owner,modified` 裁剪字段可显著提速；`limit` 最大 200（默认 30）。翻页用 `page`。
6. 写操作（评论/建单/更新）必须用 **form 表单 POST**；评论正文用 HTML（`<p>…</p>`，换行 `<br/>`）。
7. 接口失败最多重试 2 次（原始请求 + 1 次降级），严禁循环重试。
8. 单据链接格式：`$TAPD_SITE_URL/tapd_fe/{项目ID}/{story|bug|task}/detail/{单据ID}`。

## 常用操作

### 查我的进行中缺陷
```bash
curl -s -H "Authorization: Bearer $TAPD_TOKEN" \
  "$API/bugs?workspace_id=$WS&current_owner=张三&status=new|in_progress&limit=50&order=modified%20desc&fields=id,title,status,current_owner,priority_label,modified"
```

### 查单据评论
```bash
curl -s -H "Authorization: Bearer $TAPD_TOKEN" \
  "$API/comments?workspace_id=$WS&entry_type=stories&entry_id=<单据ID>&limit=50&order=created%20desc"
```
`entry_type` 取值：`stories`（需求）/ `tasks`（任务）/ `bug`（缺陷，含流转评论可写 `bug|bug_remark`）。

### 写评论（写回进展）
```bash
curl -s -X POST -H "Authorization: Bearer $TAPD_TOKEN" \
  --data-urlencode "workspace_id=$WS" \
  --data-urlencode "entry_type=stories" \
  --data-urlencode "entry_id=<单据ID>" \
  --data-urlencode "author=<当前用户昵称>" \
  --data-urlencode "description=<p>进展说明</p>" \
  "$API/comments"
```

### 流转状态
先查可用状态：`curl -s -H "Authorization: Bearer $TAPD_TOKEN" "$API/stories/get_fields_info?workspace_id=$WS&field=status"`（返回 value→中文名 映射）。
```bash
curl -s -X POST -H "Authorization: Bearer $TAPD_TOKEN" \
  --data-urlencode "workspace_id=$WS" --data-urlencode "id=<单据ID>" \
  --data-urlencode "status=<状态key>" "$API/stories"
```
（缺陷用 `/bugs`、任务用 `/tasks`，字段名 `id` + `status` 相同。）

### 创建单据
必填：`workspace_id` + 标题（需求/任务用 `name`，缺陷用 `title`）。
```bash
curl -s -X POST -H "Authorization: Bearer $TAPD_TOKEN" \
  --data-urlencode "workspace_id=$WS" \
  --data-urlencode "name=<标题>" \
  --data-urlencode "description=<p>描述</p>" \
  "$API/stories"
```

## 与 Paseo「TAPD 工作台」插件的配合

- 用户装了该插件时，查看/派发/回写可以直接在插件 UI 完成；本技能适合在对话里快速查单。
- 完成后把阶段性结论**写回单据评论**，并把单据链接贴给用户，便于团队跟进。
