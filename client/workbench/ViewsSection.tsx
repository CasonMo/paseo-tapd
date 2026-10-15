import { useRpc } from "@getpaseo/plugin/client";
import type { SettingsState } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { effectiveViews, filterOptionsRpc, tapdSettingsSchema, type TapdFilters, type TapdView } from "../../shared/contracts";
import type { WorkbenchTheme } from "./bits";

export type ReadySettings = Extract<SettingsState<typeof tapdSettingsSchema>, { status: "ready" }>;

export function ViewsSection({ theme, settings }: { theme: WorkbenchTheme; settings: ReadySettings }) {
  const toast = useToast();
  const fetchOptions = useRpc(filterOptionsRpc);
  const optionsQuery = useQuery({
    queryKey: ["tapd-filter-options"],
    queryFn: () => fetchOptions({}),
    staleTime: 600_000,
    retry: 1,
  });

  const views = effectiveViews(settings.values);

  function iterationName(id: string): string {
    if (!id) return "";
    return optionsQuery.data?.iterations.find((iteration) => iteration.id === id)?.name ?? id;
  }

  function describe(filters: TapdFilters): string {
    const parts: string[] = [];
    parts.push(
      `处理人：${
        filters.ownerMode === "mine"
          ? "我"
          : filters.ownerMode === "related"
            ? "我相关（处理/创建/抄送/评论）"
            : filters.ownerMode === "custom"
              ? filters.owner.trim() || "全部"
              : "全部"
      }`,
    );
    parts.push(filters.statusScope === "active" ? "仅进行中" : filters.statusScope === "done" ? "仅已结束" : "全部状态");
    if (filters.iterationId) parts.push(`迭代：${iterationName(filters.iterationId)}`);
    if (filters.keyword) parts.push(`关键词：${filters.keyword}`);
    if (filters.creator) parts.push(`创建人：${filters.creator}`);
    if (filters.modifiedWithinDays > 0) parts.push(`近${filters.modifiedWithinDays}天`);
    if (filters.priorities.length > 0) parts.push(`优先级×${filters.priorities.length}`);
    if (filters.severities.length > 0) parts.push(`严重程度×${filters.severities.length}`);
    if (filters.label) parts.push(`标签：${filters.label}`);
    if (filters.conditions.length > 0) parts.push(`高级条件×${filters.conditions.length}`);
    return parts.join(" · ");
  }

  function isDefault(view: TapdView): boolean {
    return (
      settings.values.defaultViewId === view.id ||
      (settings.values.defaultViewId === "" && views[0]?.id === view.id)
    );
  }

  async function persist(nextViews: readonly TapdView[], nextDefaultId: string): Promise<boolean> {
    const ok = await settings.save(
      { ...settings.values, views: [...nextViews], defaultViewId: nextDefaultId },
      settings.revision,
    );
    if (!ok) toast.error(settings.saveError ?? "保存失败，请重试");
    return ok;
  }

  async function removeView(view: TapdView) {
    if (views.length <= 1) {
      toast.error("至少保留一个视图");
      return;
    }
    const next = views.filter((item) => item.id !== view.id);
    const nextDefault = settings.values.defaultViewId === view.id ? next[0]?.id ?? "" : settings.values.defaultViewId;
    if (await persist(next, nextDefault)) toast.show(`已删除「${view.name}」`, { variant: "success" });
  }

  async function setDefault(view: TapdView) {
    if (await persist(views, view.id)) toast.show(`「${view.name}」已设为默认`, { variant: "success" });
  }

  const styles = useMemo<{ actions: ViewStyle; link: TextStyle; linkDanger: TextStyle }>(() => ({
    actions: { flexDirection: "row", alignItems: "center", gap: 12 },
    link: { color: theme.colors.accent, fontSize: 12 },
    linkDanger: { color: theme.colors.statusDanger, fontSize: 12 },
  }), [theme]);

  return (
    <SettingsSection title="视图" info="过滤条件在工作台顶部直接调整，点「+ 新增视图」即可保存复用；这里管理默认视图和删除">
      <SettingsCard>
        {views.map((view) => (
          <SettingsRow
            key={view.id}
            label={isDefault(view) ? `${view.name}（默认）` : view.name}
            hint={describe(view.filters)}
          >
            <View style={styles.actions}>
              {!isDefault(view) ? (
                <Pressable accessibilityRole="button" onPress={() => void setDefault(view)}>
                  <Text style={styles.link}>设为默认</Text>
                </Pressable>
              ) : null}
              {views.length > 1 ? (
                <Pressable accessibilityRole="button" onPress={() => void removeView(view)}>
                  <Text style={styles.linkDanger}>删除</Text>
                </Pressable>
              ) : null}
            </View>
          </SettingsRow>
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}
