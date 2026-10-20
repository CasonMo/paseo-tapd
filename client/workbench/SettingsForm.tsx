import { useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Text, View, type TextStyle, type ViewStyle } from "react-native";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { checkRpc, tapdSettings } from "../../shared/contracts";
import { PLUGIN_VERSION } from "../../shared/version";
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
  const toast = useToast();
  const check = useRpc(checkRpc);

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
      <SettingsSection title="Agent">
        <SettingsCard>
          <SettingsSwitch
            label="完成工作后自动回写 TAPD 评论"
            hint="每次派给 TAPD 单据的 Agent 完成一轮 turn 后，把结果摘要作为评论写回该单据。仅对已关联的单据生效。"
            value={settings.values.autoReportAgentResult}
            onValueChange={(value) => {
              void (async () => {
                const ok = await settings.save(
                  { ...settings.values, autoReportAgentResult: value },
                  settings.revision,
                );
                if (ok) toast.show(value ? "已开启自动回写评论" : "已关闭自动回写评论", { variant: "success" });
                else toast.error(settings.saveError ?? "保存失败，请重试");
              })();
            }}
          />
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
        插件在 daemon 侧调用 TAPD OpenAPI，凭证仅保存在本机。当前版本 v{PLUGIN_VERSION}。
      </Text>
    </View>
  );
}
