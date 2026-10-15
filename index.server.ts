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

  console.log("[tapd-workbench] server ready");
  return () => {
    unsubscribe();
  };
}
