import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { tapdAttachmentSource, type EntityKind } from "./shared/contracts";
import { BindPickerScreen } from "./client/workbench/BindPickerScreen";
import { WorkbenchScreen } from "./client/workbench/WorkbenchScreen";
import { TapdSettingsScreen } from "./client/workbench/SettingsForm";

function parseTapdCommand(raw: string): { mode: "create"; kind: EntityKind; title: string } | { mode: "search"; query: string } {
  const text = raw.trim();
  const createMatch = text.match(/^(?:请|帮我)?\s*创建\s*(需求|任务|缺陷)?[\s:：]*([\s\S]*)$/);
  if (createMatch) {
    const kindMap: Record<string, EntityKind> = { 需求: "story", 任务: "task", 缺陷: "bug" };
    const kindKey = createMatch[1];
    const kind: EntityKind = kindKey ? kindMap[kindKey] ?? "story" : "story";
    return { mode: "create", kind, title: (createMatch[2] ?? "").trim() };
  }
  const query = text.replace(/^(?:请|帮我)?\s*(?:绑定|关联)?[\s:：]*/, "");
  return { mode: "search", query };
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
    description: "关联 TAPD 单据到当前会话：绑定已有单据或创建新需求",
    argumentHint: "<ID或关键词> | 创建需求|任务|缺陷 <标题>",
    context: "agent",
    onSubmit({ args, agent, openScreen }) {
      const parsed = parseTapdCommand(args);
      if (parsed.mode === "create") {
        if (!parsed.title) {
          throw new Error("请提供标题，例如：/paseo-tapd 创建需求 登录页优化");
        }
        openScreen({
          screenId: "tapd-bind",
          params: {
            mode: "create",
            kind: parsed.kind,
            title: parsed.title,
            agentId: agent.id,
            workspaceId: agent.workspaceId,
            agentTitle: agent.title ?? "",
          },
        });
        return;
      }
      openScreen({
        screenId: "tapd-bind",
        params: {
          mode: "search",
          query: parsed.query,
          agentId: agent.id,
          workspaceId: agent.workspaceId,
          agentTitle: agent.title ?? "",
        },
      });
    },
  });
  return () => {};
}
