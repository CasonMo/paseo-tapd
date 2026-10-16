import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { tapdAttachmentSource } from "./shared/contracts";
import { BindPickerScreen } from "./client/workbench/BindPickerScreen";
import { WorkbenchScreen } from "./client/workbench/WorkbenchScreen";
import { TapdSettingsScreen } from "./client/workbench/SettingsForm";

/** 把 /paseo-tapd 请求交给当前 Agent 执行（AI 负责识别单据类型、追问缺失信息、串联多步操作） */
function buildAgentTapdRequest(request: string): string {
  const trimmed = request.trim();
  return [
    "【TAPD 操作请求（来自 /paseo-tapd，请直接执行）】",
    trimmed ? `用户请求：${trimmed}` : "用户请求：（未填写具体内容，请询问用户要做什么 TAPD 操作）",
    "",
    "执行规则：",
    "1. 用 TAPD OpenAPI 完成（环境变量 TAPD_TOKEN / TAPD_API_ENDPOINT / TAPD_SITE_URL / TAPD_WORKSPACE_IDS；先 `printenv TAPD_TOKEN` 检查，缺失时让用户在 Paseo「TAPD 工作台设置」配置并刷新会话）。",
    "2. 遇到链接或 ID：按 $TAPD_SITE_URL/tapd_fe/{项目}/{story|bug|task}/detail/{ID} 解析，先 GET 对应接口确认真实类型与内容，不要猜。",
    "3. 人员参数用中文昵称；多值用 |；时间用 ~ 区间；写操作用 form 表单 POST；评论正文用 HTML（<p>…</p>）。",
    "4. 「登记任务/排查任务」：确认要挂到哪个需求（task 的 story_id 字段）；用户未指明归属需求时先问用户（可先搜索给出候选）；若目标不是需求，先问是否要创建需求，得到确认后连续创建需求+任务。",
    "5. 「创建需求」：先建需求，再在其下创建任务（连续执行，不要反复确认）。",
    "6. 用户明确且无歧义的操作直接执行，不要过度确认；只问真正缺的关键信息（一次只问一个）。",
    "7. 完成后一两句话汇报结果并贴单据链接。",
    "",
    "速查（详细规则可参考已安装的 paseo-tapd 技能）：",
    "- 查需求 GET /stories?workspace_id=&id= ；建需求 POST /stories（workspace_id, name, description?）",
    "- 查任务 GET /tasks ；建任务 POST /tasks（workspace_id, name, story_id, owner?, description?）",
    "- 建缺陷 POST /bugs（workspace_id, title）；评论 POST /comments（workspace_id, entry_type=stories|tasks|bug, entry_id, author, description）",
    "- 状态流转 POST /stories|/tasks|/bugs（id + status；状态枚举查 get_fields_info?field=status）",
    "- 当前用户 GET /users/info",
  ].join("\n");
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
    async onSubmit({ args, agent, openScreen, paseo }) {
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
      // 其余请求交给当前 Agent 执行：由 AI 识别单据类型、追问缺失信息、串联多步操作
      await paseo.agents.ref(agent.id).send(buildAgentTapdRequest(text));
    },
  });
  return () => {};
}
