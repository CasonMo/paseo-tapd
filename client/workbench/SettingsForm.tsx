import { useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Text, View, type TextStyle, type ViewStyle } from "react-native";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { checkRpc, skillInstallRpc, skillStatusRpc, skillUninstallRpc, tapdSettings } from "../../shared/contracts";
import type { WorkbenchTheme } from "./bits";
import { ViewsSection, type ReadySettings } from "./ViewsSection";

export function TapdSettingsScreen({ theme }: PluginSurfaceProps) {
  return <SettingsBody theme={theme} />;
}

export function SettingsModal({ open, onClose, theme }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
}) {
  return (
    <Modal
      title="TAPD 工作台设置"
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Content>
        <SettingsBody theme={theme} />
      </Modal.Content>
    </Modal>
  );
}

function SettingsBody({ theme }: { theme: WorkbenchTheme }) {
  const settings = useSettings(tapdSettings);
  const styles = useMemo<{ center: ViewStyle; error: TextStyle }>(() => ({
    center: { paddingVertical: 24, alignItems: "center" },
    error: { color: theme.colors.statusDanger, fontSize: 13, lineHeight: 19 },
  }), [theme]);

  if (settings.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.foreground} />
      </View>
    );
  }
  if (settings.status === "error") {
    return <Text style={styles.error}>配置读取失败：{settings.error}</Text>;
  }
  if (settings.status === "invalid") {
    return (
      <View style={{ gap: 12 }}>
        <Text style={styles.error}>配置数据无效：{settings.error}</Text>
        <SettingsAction label="重置配置" actionLabel="重置" onPress={() => void settings.reset()} />
      </View>
    );
  }
  return <SettingsEditor settings={settings} theme={theme} />;
}

function SettingsEditor({ settings, theme }: { settings: ReadySettings; theme: WorkbenchTheme }) {
  const [token, setToken] = useState(settings.values.token);
  const [workspaceIds, setWorkspaceIds] = useState(settings.values.workspaceIds);
  const [checkState, setCheckState] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [skillBusy, setSkillBusy] = useState(false);
  const toast = useToast();
  const check = useRpc(checkRpc);
  const fetchSkillStatus = useRpc(skillStatusRpc);
  const installSkillAction = useRpc(skillInstallRpc);
  const uninstallSkillAction = useRpc(skillUninstallRpc);
  const skillQuery = useQuery({
    queryKey: ["tapd-skill-status"],
    queryFn: () => fetchSkillStatus({}),
    staleTime: 10_000,
    retry: 1,
  });

  async function runSkillAction(action: "install" | "uninstall") {
    if (skillBusy) return;
    setSkillBusy(true);
    try {
      if (action === "install") {
        const result = await installSkillAction({});
        toast.show(`已安装技能（${result.files} 个文件）→ ${result.path}`, { variant: "success" });
      } else {
        await uninstallSkillAction({});
        toast.show("已卸载技能", { variant: "success" });
      }
      void skillQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSkillBusy(false);
    }
  }

  async function save() {
    const ok = await settings.save(
      { ...settings.values, token: token.trim(), workspaceIds: workspaceIds.trim() },
      settings.revision,
    );
    if (ok) toast.show("设置已保存", { variant: "success" });
    else toast.error(settings.saveError ?? "保存失败，请重试");
  }

  async function testConnection() {
    setTesting(true);
    setCheckState(null);
    try {
      const result = await check({
        token: token.trim() || undefined,
        workspaceIds: workspaceIds.trim() || undefined,
      });
      setCheckState({ ok: result.ok, message: result.message });
    } catch (error) {
      setCheckState({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }

  const resultStyle = useMemo<TextStyle>(() => ({
    color: checkState?.ok ? theme.colors.statusSuccess : theme.colors.statusDanger,
    fontSize: 12,
  }), [theme, checkState?.ok]);

  const skillState = skillQuery.data?.state;
  const skillInstalled = skillState === "current" || skillState === "stale";
  const skillStateText = skillQuery.isError
    ? "状态未知"
    : skillState === "current"
      ? "已安装（最新）"
      : skillState === "stale"
        ? "已安装（有更新，点“更新”即可）"
        : skillState === "missing"
          ? "未安装"
          : "读取中…";
  const skillStateStyle = useMemo<TextStyle>(() => ({
    color:
      skillState === "current"
        ? theme.colors.statusSuccess
        : skillState === "stale"
          ? theme.colors.statusWarning
          : skillState === undefined
            ? theme.colors.foregroundMuted
            : skillQuery.isError
              ? theme.colors.statusDanger
              : theme.colors.foregroundMuted,
    fontSize: 12,
  }), [theme, skillState, skillQuery.isError]);

  return (
    <View style={{ gap: 16 }}>
      <SettingsSection title="连接">
        <SettingsCard>
          <SettingsInput
            label="API Token"
            hint="留空则使用 daemon 环境变量 TAPD_TOKEN；填写后以明文 JSON 保存在 daemon，可被本机设置页读取"
            placeholder="TAPD OpenAPI Token"
            secureTextEntry
            initialValue={settings.values.token}
            onChangeText={setToken}
          />
          <SettingsInput
            label="项目 ID"
            hint="多个项目用英文逗号分隔；留空则使用环境变量 TAPD_WORKSPACE_IDS"
            placeholder="例如 12345678"
            initialValue={settings.values.workspaceIds}
            onChangeText={setWorkspaceIds}
          />
        </SettingsCard>
      </SettingsSection>
      <ViewsSection theme={theme} settings={settings} />
      <SettingsSection title="Agent 技能">
        <SettingsCard>
          <SettingsRow
            label="TAPD 技能（paseo-tapd）"
            hint="安装到本机 ~/.agents/skills/paseo-tapd；Claude Code / Codex / Pi 等读取该目录的 Agent 即可直接使用"
          >
            <Text style={skillStateStyle}>{skillStateText}</Text>
          </SettingsRow>
          <SettingsAction
            label={skillInstalled ? "更新技能" : "安装技能"}
            actionLabel={skillBusy ? "处理中…" : skillInstalled ? "更新" : "安装"}
            disabled={skillBusy}
            onPress={() => void runSkillAction("install")}
          />
          {skillInstalled ? (
            <SettingsAction
              label="卸载技能"
              actionLabel="卸载"
              disabled={skillBusy}
              onPress={() => void runSkillAction("uninstall")}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="操作">
        <SettingsCard>
          <SettingsAction
            label="保存设置"
            actionLabel={settings.saving ? "保存中…" : "保存"}
            disabled={settings.saving}
            onPress={() => void save()}
          />
          <SettingsAction
            label="测试连接"
            actionLabel={testing ? "测试中…" : "测试"}
            disabled={testing}
            onPress={() => void testConnection()}
          />
          {checkState ? (
            <SettingsRow label="测试结果">
              <Text style={resultStyle}>{checkState.message}</Text>
            </SettingsRow>
          ) : null}
        </SettingsCard>
      </SettingsSection>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 16 }}>
        插件在 daemon 侧调用 TAPD OpenAPI，凭证仅保存在本机。
      </Text>
    </View>
  );
}
