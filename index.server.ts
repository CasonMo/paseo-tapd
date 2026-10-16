import type { PluginServerContext } from "@getpaseo/plugin/server";
import { addCommentRpc, boardRpc, checkRpc, createRpc, entityRpc, filterFieldsRpc, filterOptionsRpc, searchRpc, tapdSettings, updateStatusRpc } from "./shared/contracts";
import { createHandlers } from "./server/handlers";
import { clearTapdCache } from "./server/tapd";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(tapdSettings);

  const getValues = async () => {
    const state = await settings.read();
    if (state.status === "ready") return state.values;
    throw new Error("TAPD 工作台配置数据无效，请到插件设置中重置。");
  };

  const handlers = createHandlers(getValues);
  server.handle(boardRpc, handlers.board);
  server.handle(createRpc, handlers.create);
  server.handle(updateStatusRpc, handlers.updateStatus);
  server.handle(addCommentRpc, handlers.addComment);
  server.handle(entityRpc, handlers.entity);
  server.handle(searchRpc, handlers.search);
  server.handle(filterOptionsRpc, handlers.filterOptions);
  server.handle(filterFieldsRpc, handlers.filterFields);
  server.handle(checkRpc, handlers.check);

  const unsubscribe = settings.subscribe(() => {
    clearTapdCache();
  });

  // 给每个 agent 会话注入 TAPD 环境变量（不覆盖已有同名变量），便于 agent 直接调用 TAPD OpenAPI
  server.before("agent.session_open", async ({ request }) => {
    let values: { token: string; workspaceIds: string } | null = null;
    try {
      const state = await settings.read();
      if (state.status === "ready") values = state.values;
    } catch {
      values = null;
    }
    const token = (values?.token ?? "").trim() || (process.env.TAPD_TOKEN ?? "").trim();
    const endpoint = (process.env.TAPD_API_ENDPOINT ?? "").trim();
    const site = (process.env.TAPD_SITE_URL ?? "").trim();
    const workspaces =
      ((values?.workspaceIds ?? "").trim() || (process.env.TAPD_WORKSPACE_IDS ?? "").trim());
    if (!token && !endpoint && !site && !workspaces) return request;
    const env: Record<string, string> = { ...(request.env ?? {}) };
    if (token && !env.TAPD_TOKEN) env.TAPD_TOKEN = token;
    if (endpoint && !env.TAPD_API_ENDPOINT) env.TAPD_API_ENDPOINT = endpoint;
    if (site && !env.TAPD_SITE_URL) env.TAPD_SITE_URL = site;
    if (workspaces && !env.TAPD_WORKSPACE_IDS) env.TAPD_WORKSPACE_IDS = workspaces;
    return { ...request, env };
  });

  console.log("[tapd-workbench] server ready");
  return () => {
    unsubscribe();
  };
}
