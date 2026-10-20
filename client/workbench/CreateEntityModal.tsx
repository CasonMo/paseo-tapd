import { useRpc, openExternalUrl } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { createFieldsRpc, createRpc, filterOptionsRpc, type EntityKind } from "../../shared/contracts";
import { Chip, type WorkbenchTheme } from "./bits";
import { DatePicker } from "./DatePicker";

/** 宽松校验 YYYY-MM-DD（日历行展示用） */
function parseKey(key: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

/** fields_info 的 text 自定义字段常被管理员拿来存日期（如「开始时间」「结束时间」），按 label/key 猜日期语义启用日历 */
function looksLikeDateField(field: { key: string; label: string }): boolean {
  return /时间|日期/.test(field.label) || /date|time/i.test(field.key);
}

const KIND_TITLES: Record<EntityKind, string> = { story: "需求", task: "任务", bug: "缺陷" };

type ModalMode = { name: "form" } | { name: "iteration" } | { name: "date"; fieldKey: string };

export interface CreatedEntity {
  id: string;
  kind: EntityKind;
  url: string;
  title: string;
}

/** 从需求详情发起创建时的预填上下文：锁类别为任务/缺陷并挂到该需求 */
export interface CreateChildPreset {
  kind: "task" | "bug";
  storyId: string;
  workspaceId: string;
  storyTitle: string;
  storyUrl: string;
}

export function CreateEntityModal({ open, onClose, theme, onCreated, initial }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  onCreated: (created: CreatedEntity) => void;
  initial?: CreateChildPreset | null;
}) {
  const create = useRpc(createRpc);
  const fetchCreateFields = useRpc(createFieldsRpc);
  const fetchOptions = useRpc(filterOptionsRpc);
  const optionsQuery = useQuery({
    queryKey: ["tapd-filter-options"],
    queryFn: () => fetchOptions({}),
    enabled: open,
    staleTime: 600_000,
    retry: 1,
  });
  const toast = useToast();

  const [kind, setKind] = useState<EntityKind>("story");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [ownerTouched, setOwnerTouched] = useState(false);
  const [priority, setPriority] = useState("");
  const [iterationId, setIterationId] = useState("");
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ModalMode>({ name: "form" });
  const [submitting, setSubmitting] = useState(false);
  const fieldsQuery = useQuery({
    queryKey: ["tapd-create-fields", kind, initial?.workspaceId ?? ""],
    queryFn: () => fetchCreateFields({ kind, workspaceId: initial?.workspaceId ?? "" }),
    enabled: open && initial !== null,
    staleTime: 600_000,
    retry: 1,
  });

  useEffect(() => {
    if (!open) {
      setKind("story");
      setTitle("");
      setDescription("");
      setOwner("");
      setOwnerTouched(false);
      setPriority("");
      setIterationId("");
      setExtraValues({});
      setMode({ name: "form" });
      setSubmitting(false);
    } else if (initial) {
      setKind(initial.kind);
    }
  }, [open, initial]);

  // 挂载创建：fields_info 就绪且用户未手改过处理人时，默认填当前登录用户
  const me = fieldsQuery.data?.me ?? "";
  useEffect(() => {
    if (!ownerTouched && me && owner === "") setOwner(me);
  }, [ownerTouched, me, owner]);

  const priorityOptions = useMemo(
    () => (optionsQuery.data?.priorities ?? []).filter((option) => option.kinds.includes(kind)),
    [optionsQuery.data, kind],
  );
  const iterations = optionsQuery.data?.iterations ?? [];
  const iterationLabel = iterationId
    ? iterations.find((item) => item.id === iterationId)?.name ?? iterationId
    : "全部迭代";

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await create({
        kind,
        title: trimmed,
        description: description.trim(),
        owner: owner.trim(),
        priority,
        iterationId,
        storyId: initial ? initial.storyId : undefined,
        workspaceId: initial ? initial.workspaceId : undefined,
        extraFields: initial ? extraValues : undefined,
      });
      toast.show(`已创建「${trimmed}」#${created.id}`, { variant: "success" });
      onCreated({ id: created.id, kind: created.kind, url: created.url, title: trimmed });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  }

  const styles = useMemo<{
    row: ViewStyle;
    rowLabel: TextStyle;
    input: TextStyle;
    inputMultiline: TextStyle;
    chips: ViewStyle;
    backRow: ViewStyle;
    link: TextStyle;
    footer: ViewStyle;
    primaryButton: ViewStyle;
    primaryLabel: TextStyle;
    disabledButton: ViewStyle;
    optionRow: ViewStyle;
    optionText: TextStyle;
  }>(() => ({
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    rowLabel: { color: theme.colors.foregroundMuted, fontSize: 13, width: 64 },
    input: {
      backgroundColor: theme.colors.surface2,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      color: theme.colors.foreground,
      fontSize: 13,
      flex: 1,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: "top" },
    chips: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
    link: { color: theme.colors.accent, fontSize: 13 },
    footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 6 },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    primaryLabel: { color: theme.colors.accentForeground, fontSize: 13 },
    disabledButton: { opacity: 0.5 },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 11,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    optionText: { color: theme.colors.foreground, fontSize: 13, flex: 1 },
  }), [theme]);

  if (mode.name === "date") {
    const dateField = fieldsQuery.data?.fields.find((field) => field.key === mode.fieldKey);
    if (dateField) {
      return (
        <Modal title={`新建单据 · 选择${dateField.label}`} open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
          <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
            <View style={{ flex: 1, minHeight: 0, gap: 10, padding: 14 }}>
              <Pressable accessibilityRole="button" style={styles.backRow} onPress={() => setMode({ name: "form" })}>
                <Icon name="ChevronLeft" size={16} color={theme.colors.accent} />
                <Text style={styles.link}>返回</Text>
              </Pressable>
              <DatePicker
                theme={theme}
                value={extraValues[dateField.key] ?? ""}
                onChange={(next) => {
                  setExtraValues((prev) => ({ ...prev, [dateField.key]: next }));
                  if (next) setMode({ name: "form" });
                }}
              />
            </View>
          </Modal.Content>
        </Modal>
      );
    }
  }

  if (mode.name === "iteration") {
    const rows = [{ id: "", name: "全部迭代", status: "" }, ...iterations];
    return (
      <Modal title="新建单据 · 选择迭代" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <View style={{ flex: 1, minHeight: 0, paddingTop: 8, paddingHorizontal: 14 }}>
            <Pressable accessibilityRole="button" style={styles.backRow} onPress={() => setMode({ name: "form" })}>
              <Icon name="ChevronLeft" size={16} color={theme.colors.accent} />
              <Text style={styles.link}>返回</Text>
            </Pressable>
            <FlatList
              style={{ flex: 1, minHeight: 0 }}
              data={rows}
              keyExtractor={(item) => item.id || "__all__"}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  style={styles.optionRow}
                  onPress={() => {
                    setIterationId(item.id);
                    setMode({ name: "form" });
                  }}
                >
                  <Text style={styles.optionText} numberOfLines={1}>
                    {item.id === "" ? item.name : item.status === "done" ? `${item.name}（已关闭）` : item.name}
                  </Text>
                  {iterationId === item.id ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Modal.Content>
      </Modal>
    );
  }

  return (
    <Modal title="新建单据" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        <View style={{ gap: 10 }}>
          {initial ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>挂载到</Text>
              <Pressable accessibilityRole="button" onPress={() => void openExternalUrl(initial.storyUrl)}>
                <Text style={{ ...styles.link, flex: 1 }} numberOfLines={1}>
                  #{initial.storyId} {initial.storyTitle || "（标题未获取）"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>类型</Text>
            <View style={styles.chips}>
              {(initial ? (["task", "bug"] as const) : (["story", "task", "bug"] as const)).map((item) => (
                <Chip
                  key={item}
                  label={KIND_TITLES[item]}
                  theme={theme}
                  active={kind === item}
                  onPress={() => {
                    setKind(item);
                    setPriority("");
                    setExtraValues({});
                  }}
                />
              ))}
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>标题</Text>
            <TextInput
              style={styles.input}
              placeholder="必填"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={title}
              onChangeText={setTitle}
            />
          </View>
          <View style={[styles.row, { alignItems: "flex-start" }]}>
            <Text style={[styles.rowLabel, { paddingTop: 8 }]}>描述</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="可选，纯文本（保存时自动转 HTML）"
              placeholderTextColor={theme.colors.foregroundMuted}
              multiline
              value={description}
              onChangeText={setDescription}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>处理人</Text>
            <TextInput
              style={styles.input}
              placeholder="昵称，默认当前登录用户"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={owner}
              onChangeText={(text) => {
                setOwnerTouched(true);
                setOwner(text);
              }}
            />
          </View>
          {priorityOptions.length > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>优先级</Text>
              <View style={styles.chips}>
                {priorityOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label === option.value ? option.value : option.label}
                    theme={theme}
                    active={priority === option.value}
                    onPress={() => setPriority(priority === option.value ? "" : option.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" style={styles.optionRow} onPress={() => setMode({ name: "iteration" })}>
            <Text style={[styles.optionText, { flex: undefined, width: 64, color: theme.colors.foregroundMuted, fontSize: 13 }]}>迭代</Text>
            <Text style={styles.optionText} numberOfLines={1}>{iterationLabel}</Text>
            <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
          </Pressable>
          {initial
            ? (fieldsQuery.data?.fields ?? []).map((field) => {
                const value = extraValues[field.key] ?? "";
                const setValue = (text: string) => setExtraValues((prev) => ({ ...prev, [field.key]: text }));
                const label = `${field.label}${field.required ? " *" : ""}`;
                if (field.inputKind === "enum" || field.inputKind === "user") {
                  return (
                    <View key={field.key} style={styles.row}>
                      <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
                      <View style={styles.chips}>
                        {field.options.length > 0 && field.options.length <= 8
                          ? field.options.map((option) => {
                              const active = field.single ? value === option.value : value.split(";").includes(option.value);
                              return (
                                <Chip
                                  key={option.value}
                                  label={option.label}
                                  theme={theme}
                                  active={active}
                                  onPress={() => {
                                    if (field.single) {
                                      setValue(active ? "" : option.value);
                                    } else {
                                      const list = value.split(";").filter(Boolean);
                                      const next = active
                                        ? list.filter((item) => item !== option.value)
                                        : [...list, option.value];
                                      setValue(next.join(";"));
                                    }
                                  }}
                                />
                              );
                            })
                          : (
                              <TextInput
                                style={styles.input}
                                placeholder={
                                  field.inputKind === "user"
                                    ? "昵称，多个用英文分号分隔"
                                    : "可选，多个用英文分号分隔"
                                }
                                placeholderTextColor={theme.colors.foregroundMuted}
                                value={value}
                                onChangeText={setValue}
                              />
                            )}
                      </View>
                    </View>
                  );
                }
                if (field.inputKind === "textarea") {
                  return (
                    <View key={field.key} style={[styles.row, { alignItems: "flex-start" }]}>
                      <Text style={[styles.rowLabel, { paddingTop: 8 }]}>{label}</Text>
                      <TextInput
                        style={[styles.input, styles.inputMultiline]}
                        placeholder="可选"
                        placeholderTextColor={theme.colors.foregroundMuted}
                        multiline
                        value={value}
                        onChangeText={setValue}
                      />
                    </View>
                  );
                }
                if (field.inputKind === "date" || looksLikeDateField(field)) {
                  const dateValue = value ? parseKey(value) : null;
                  return (
                    <Pressable
                      key={field.key}
                      accessibilityRole="button"
                      accessibilityLabel={`选择${field.label}`}
                      style={styles.optionRow}
                      onPress={() => setMode({ name: "date", fieldKey: field.key })}
                    >
                      <Text style={[styles.optionText, { flex: undefined, width: 96, color: theme.colors.foregroundMuted, fontSize: 13 }]} numberOfLines={1}>
                        {label}
                      </Text>
                      <Text style={styles.optionText} numberOfLines={1}>{dateValue ? value : "未选择"}</Text>
                      <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
                    </Pressable>
                  );
                }
                return (
                  <View key={field.key} style={styles.row}>
                    <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="可选"
                      placeholderTextColor={theme.colors.foregroundMuted}
                      value={value}
                      onChangeText={setValue}
                    />
                  </View>
                );
              })
            : null}
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, !title.trim() || submitting ? styles.disabledButton : null]}
              disabled={!title.trim() || submitting}
              onPress={() => void submit()}
            >
              <Text style={styles.primaryLabel}>{submitting ? "创建中…" : "创建"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}
