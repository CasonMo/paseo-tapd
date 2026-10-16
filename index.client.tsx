import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { KIND_LABELS } from "./client/workbench/link-utils";
import { searchRpc, tapdAttachmentSource, type EntityKind, type TapdLink } from "./shared/contracts";
import { BindPickerScreen } from "./client/workbench/BindPickerScreen";
import { WorkbenchScreen } from "./client/workbench/WorkbenchScreen";
import { TapdSettingsScreen } from "./client/workbench/SettingsForm";

const TAPD_SETTINGS_ID = "tapd-workbench-config";

/** 从请求文本里提取单据引用（TAPD 链接或 ≥10 位数字 ID） */
function extractEntityRef(args: string): { kind?: EntityKind; id: string } | null {
  const urlMatch = args.match(/tapd_fe\/\d+\/(story|task|bug)\/detail\/(\d+)/);
  if (urlMatch) return { kind: urlMatch[1] as EntityKind, id: urlMatch[2] };
  const idMatch = args.match(/\b(\d{10,})\b/);
  if (idMatch) return { id: idMatch[1] };
  return null;
}

/** 把 /paseo-tapd 请求交给当前 Agent 执行（AI 负责识别单据类型、追问缺失信息、串联多步操作） */
function buildAgentTapdRequest(request: string, bindLine: string | null): string {
  const trimmed = request.trim();
  return [
    "【TAPD 操作请求（来自 /paseo-tapd，请直接执行）】",
    bindLine,
    trimmed ? `用户请求：${trimmed}` : "用户请求：（未填写具体内容，请询问用户要做什么 TAPD 操作）",
    "",
    "执行规则：",
    "1. 用 TAPD OpenAPI 完成（环境变量 TAPD_TOKEN / TAPD_API_ENDPOINT / TAPD_SITE_URL / TAPD_WORKSPACE_IDS；用 `test -n \"$TAPD_TOKEN\"` 检查令牌是否已设置——绝不要打印、回显、引用或以任何方式输出令牌内容；缺失时让用户在 Paseo「TAPD 工作台设置」配置并刷新会话）。",
    "2. 遇到链接或 ID：按 $TAPD_SITE_URL/tapd_fe/{项目}/{story|bug|task}/detail/{ID} 解析，先 GET 对应接口确认真实类型与内容，不要猜。",
    "3. 人员参数用中文昵称；多值用 |；时间用 ~ 区间；写操作用 form 表单 POST；评论正文用 HTML（<p>…</p>）。",
    "4. 「登记任务/排查任务」：确认要挂到哪个需求（task 的 story_id 字段）；「登记缺陷」同样要确认关联到哪个需求（建缺陷后用 POST /relations 关联）；用户未指明归属需求时先问用户（可先搜索给出候选）；若目标不是需求，先问是否要创建需求，得到确认后连续创建 需求→任务/缺陷。",
    "5. 「创建需求」：先建需求，再在其下创建任务（连续执行，不要反复确认）。",
    "6. 用户明确且无歧义的操作直接执行，不要过度确认；只问真正缺的关键信息（一次只问一个）。",
    "7. 完成后一两句话汇报结果并贴单据链接。",
    "8. 关联：若上方没有【TAPD 关联】行而请求涉及具体单据，完成后提醒用户可用 `/paseo-tapd 绑定 <ID>` 或在 TAPD 工作台把本会话关联到该单据。",
    "",
    "速查（TAPD OpenAPI）：",
    "- 查需求 GET /stories?workspace_id=&id= ；建需求 POST /stories（workspace_id, name, description?）",
    "- 查任务 GET /tasks ；建任务 POST /tasks（workspace_id, name, story_id, owner?, description?）",
    "- 建缺陷 POST /bugs（workspace_id, title）；需求-缺陷关联 POST /relations（workspace_id, source_type=bug, source_id, target_type=story, target_id）",
    "- 评论 POST /comments（workspace_id, entry_type=stories|tasks|bug, entry_id, author, description）",
    "- 状态流转 POST /stories|/tasks|/bugs（id + status；状态枚举查 get_fields_info?field=status）",
    "- 当前用户 GET /users/info",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function TapdSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="ClipboardList"
      active={currentScreen?.screenId === "tapd-board"}
      onPress={() => openScreen({ screenId: "tapd-board" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "tapd-board", title: "TAPD 工作台", Component: WorkbenchScreen });
  client.addScreen({ id: "tapd-bind", title: "关联 TAPD 单据", Component: BindPickerScreen });
  client.addSettingsScreen({
    id: "tapd-settings-page",
    title: "TAPD 工作台",
    icon: "ClipboardList",
    Component: TapdSettingsScreen,
  });
  client.addSidebarHeaderItem({ id: "tapd-board", title: "TAPD 工作台", Component: TapdSidebarItem });
  client.addCommandCenterItem({
    id: "tapd-open-board",
    title: "打开 TAPD 工作台",
    icon: "ClipboardList",
    keywords: ["tapd", "需求", "任务", "缺陷", "工作台"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "tapd-board" });
    },
  });
  client.addCommandCenterItem({
    id: "tapd-open-settings",
    title: "TAPD 工作台设置",
    icon: "Settings",
    keywords: ["tapd", "设置"],
    context: "global",
    onSelect({ openSettings }) {
      openSettings("tapd-settings-page");
    },
  });
  client.addAttachmentSource(tapdAttachmentSource);
  client.addSlashCommand({
    name: "paseo-tapd",
    description: "执行 TAPD 操作（交给当前 Agent：查询/登记任务/建需求/写回），或「绑定 <ID或关键词>」建立会话关联",
    argumentHint: "<任意 TAPD 请求> | 绑定 <ID或关键词>",
    context: "agent",
    async onSubmit({ args, agent, openScreen, paseo, rpc }) {
      const text = args.trim();
      if (/^(绑定|关联)/.test(text)) {
        const query = text.replace(/^(绑定|关联)[\s:：]*/, "").trim();
        openScreen({
          screenId: "tapd-bind",
          params: {
            mode: "search",
            query,
            agentId: agent.id,
            workspaceId: agent.workspaceId,
            agentTitle: agent.title ?? "",
          },
        });
        return;
      }

      // 请求里带单据引用时：自动把本会话绑定到该单据，并在提示词里带上关联行
      let bindLine: string | null = null;
      try {
        const ref = extractEntityRef(text);
        if (ref) {
          let kind = ref.kind;
          let title: string | undefined;
          try {
            const found = await rpc(searchRpc, { query: ref.id });
            const item = found.items.find((entry) => entry.identifier === `#${ref.id}`);
            if (item) {
              const separator = item.id.indexOf("-");
              kind = item.id.slice(0, separator) as EntityKind;
              title = item.title;
            }
          } catch {
            // 搜索失败则仅使用链接解析结果
          }
          if (kind) {
            const settingsContract = settingsRpc(TAPD_SETTINGS_ID);
            const state = await rpc(settingsContract.read, {});
            if (state.status === "ready") {
              const values = state.values as { links?: TapdLink[] };
              const links = Array.isArray(values.links) ? values.links : [];
              const key = `${kind}-${ref.id}`;
              const already = links.some((link) => link.key === key && link.agentId === agent.id);
              let bound = already;
              if (!already) {
                const link: TapdLink = {
                  key,
                  kind,
                  id: ref.id,
                  workspaceId: agent.workspaceId,
                  agentId: agent.id,
                  workspaceTitle: "",
                  agentTitle: agent.title ?? "",
                  createdAt: new Date().toISOString(),
                };
                const writeResult = await rpc(settingsContract.write, {
                  revision: state.revision,
                  values: { ...(state.values as Record<string, unknown>), links: [...links, link] },
                });
                bound = writeResult.status === "saved";
              }
              if (bound) {
                bindLine = `【TAPD 关联】本会话已与 TAPD ${KIND_LABELS[kind]} #${ref.id}${title ? `「${title}」` : ""} 建立关联，后续请围绕这张单据跟进。`;
              }
            }
          }
        }
      } catch {
        // 自动绑定失败不阻断请求发送（提示词里会给出兜底关联指引）
      }

      // 其余请求交给当前 Agent 执行：由 AI 识别单据类型、追问缺失信息、串联多步操作
      await paseo.agents.ref(agent.id).send(buildAgentTapdRequest(text, bindLine));
    },
  });
  return () => {};
}
