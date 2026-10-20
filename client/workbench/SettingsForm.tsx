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
import { checkRpc, syncPullRpc, syncPushRpc, tapdSettings } from "../../shared/contracts";
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
  const [autoRefresh, setAutoRefresh] = useState(String(settings.values.autoRefreshSeconds || ""));
  const [checkState, setCheckState] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const toast = useToast();
  const check = useRpc(checkRpc);

  function parseAutoRefresh(): number {
    const parsed = Number.parseInt(autoRefresh.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.max(30, Math.min(3600, parsed));
  }

  async function save() {
    const ok = await settings.save(
      {
        ...settings.values,
        token: token.trim(),
        workspaceIds: workspaceIds.trim(),
        autoRefreshSeconds: parseAutoRefresh(),
      },
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
      <SettingsSection title="看板">
        <SettingsCard>
          <SettingsInput
            label="自动刷新间隔（秒）"
            hint="0 或留空=关闭；填写 ≥30 按该秒数定时自动强制刷新看板数据，上限 3600"
            placeholder="0"
            initialValue={String(settings.values.autoRefreshSeconds || "")}
            onChangeText={setAutoRefresh}
          />
        </SettingsCard>
      </SettingsSection>
      <ViewsSection theme={theme} settings={settings} />
      <SyncSettingsSection settings={settings} theme={theme} />
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

function SyncSettingsSection({ settings, theme }: { settings: ReadySettings; theme: WorkbenchTheme }) {
  const [gitUrl, setGitUrl] = useState(settings.values.syncGitUrl);
  const [gitToken, setGitToken] = useState(settings.values.syncGitToken);
  const [branch, setBranch] = useState(settings.values.syncBranch);
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const toast = useToast();
  const push = useRpc(syncPushRpc);
  const pull = useRpc(syncPullRpc);

  async function saveSyncConfig(): Promise<boolean> {
    return settings.save(
      {
        ...settings.values,
        syncGitUrl: gitUrl.trim(),
        syncGitToken: gitToken.trim(),
        syncBranch: branch.trim() || "main",
      },
      settings.revision,
    );
  }

  async function runSync(kind: "push" | "pull") {
    setBusy(kind);
    try {
      if (!(await saveSyncConfig())) throw new Error(settings.saveError ?? "同步配置保存失败");
      if (kind === "push") {
        toast.show((await push({})).message, { variant: "success" });
      } else {
        const pulled = await pull({});
        const merged = { ...settings.values, ...(pulled.values as Partial<typeof settings.values>) };
        const ok = await settings.save(merged, settings.revision);
        if (!ok) throw new Error(settings.saveError ?? "拉取内容写入失败，请再次点击拉取");
        toast.show("已从 Git 恢复配置", { variant: "success" });
        await settings.reload();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const hintStyle = useMemo<TextStyle>(() => ({ color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 16 }), [theme]);

  return (
    <SettingsSection title="配置同步（Git）">
      <SettingsCard>
        <SettingsInput
          label="Git 仓库地址"
          hint="常用 https:// 地址（私有仓库需令牌）；推荐单独建一个空仓库，插件在其中维护 tapd-workbench-settings.json"
          placeholder="https://github.com/you/paseo-config.git"
          initialValue={settings.values.syncGitUrl}
          onChangeText={setGitUrl}
        />
        <SettingsInput
          label="Git 访问令牌"
          hint="HTTPS 模式下会随推送/拉取发送到仓库服务器，并暂存于临时克隆目录（用完即删）；不写入同步文件、不注入 Agent 会话，报错不回显"
          placeholder="GitHub/GitLab access token"
          secureTextEntry
          initialValue={settings.values.syncGitToken}
          onChangeText={setGitToken}
        />
        <SettingsInput
          label="分支"
          hint="默认 main"
          placeholder="main"
          initialValue={settings.values.syncBranch}
          onChangeText={setBranch}
        />
        <SettingsAction
          label="推送到 Git 备份"
          actionLabel={busy === "push" ? "推送中…" : "推送"}
          disabled={busy !== null}
          onPress={() => void runSync("push")}
        />
        <SettingsAction
          label="从 Git 恢复（覆盖本地视图/关联等）"
          actionLabel={busy === "pull" ? "拉取中…" : "拉取"}
          disabled={busy !== null}
          onPress={() => void runSync("pull")}
        />
        <Text style={hintStyle}>
          同步内容：视图、收藏、看板列、关联记录、Agent 自动回评开关等设置。不推送的隐私字段：TAPD Token、项目 ID、Git 令牌、派活仓库路径，均只保留在本机。
        </Text>
      </SettingsCard>
    </SettingsSection>
  );
}
