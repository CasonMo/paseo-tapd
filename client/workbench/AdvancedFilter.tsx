import type { RpcOutput } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { FlatList, Icon, Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import {
  filterFieldsRpc,
  filterOptionsRpc,
  type EntityKind,
  type TapdCondition,
  type TapdFilters,
} from "../../shared/contracts";
import { Chip, type WorkbenchTheme } from "./bits";

type FilterField = RpcOutput<typeof filterFieldsRpc>["fields"][number];
type Mode = "home" | "iteration" | "priority" | "severity" | "field-pick" | "field-value";

const KIND_SHORT: Record<EntityKind, string> = { story: "需求", task: "任务", bug: "缺陷" };

/** 本地草稿 + 防抖提交（避免每个按键都发请求） */
function useDebouncedDraft(
  value: string,
  apply: (text: string) => void,
  delay = 400,
): [string, (text: string) => void] {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft((current) => (current === value ? current : value));
  }, [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => apply(draft), delay);
    return () => clearTimeout(timer);
  }, [draft, value, apply, delay]);
  return [draft, setDraft];
}

function sameKinds(a: readonly EntityKind[], b: readonly EntityKind[]): boolean {
  return [...a].sort().join("|") === [...b].sort().join("|");
}

function conditionSummary(condition: TapdCondition): string {
  if (condition.kind === "date") {
    return `${condition.from || "*"} ~ ${condition.to || "*"}`;
  }
  const visible = condition.values.slice(0, 3).join("、");
  const extra = condition.values.length > 3 ? ` 等${condition.values.length}项` : "";
  return `${visible}${extra}` || "(空)";
}

/** 「更多筛选」徽标计数：高级条件 + 常用项里非默认启用的数量 */
function activeFilterCount(filters: TapdFilters): number {
  let count = filters.conditions.length;
  if (filters.keyword.trim()) count += 1;
  if (filters.ownerMode === "all" || filters.ownerMode === "custom") count += 1;
  if (filters.creator.trim()) count += 1;
  if (filters.iterationId) count += 1;
  if (filters.priorities.length > 0) count += 1;
  if (filters.severities.length > 0) count += 1;
  if (filters.label.trim()) count += 1;
  return count;
}

export function AdvancedFilterChip({ theme, filters, onChange }: {
  theme: WorkbenchTheme;
  filters: TapdFilters;
  onChange: (patch: Partial<TapdFilters>) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(filters);
  return (
    <>
      <Chip
        label={count > 0 ? `更多筛选 · ${count}` : "更多筛选"}
        theme={theme}
        active={count > 0}
        onPress={() => setOpen(true)}
      />
      <MoreFiltersModal
        open={open}
        onClose={() => setOpen(false)}
        theme={theme}
        filters={filters}
        onChange={onChange}
      />
    </>
  );
}

function MoreFiltersModal({ open, onClose, theme, filters, onChange }: {
  open: boolean;
  onClose: () => void;
  theme: WorkbenchTheme;
  filters: TapdFilters;
  onChange: (patch: Partial<TapdFilters>) => void;
}) {
  const fetchFields = useRpc(filterFieldsRpc);
  const fetchOptions = useRpc(filterOptionsRpc);
  const fieldsQuery = useQuery({
    queryKey: ["tapd-filter-fields"],
    queryFn: () => fetchFields({}),
    enabled: open,
    staleTime: 1_800_000,
    retry: 1,
  });
  const optionsQuery = useQuery({
    queryKey: ["tapd-filter-options"],
    queryFn: () => fetchOptions({}),
    enabled: open,
    staleTime: 600_000,
    retry: 1,
  });

  const [mode, setMode] = useState<Mode>("home");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<FilterField | null>(null);
  const [fieldValues, setFieldValues] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const applyKeyword = useCallback((text: string) => onChange({ keyword: text }), [onChange]);
  const applyOwner = useCallback((text: string) => onChange({ owner: text }), [onChange]);
  const applyCreator = useCallback((text: string) => onChange({ creator: text }), [onChange]);
  const applyLabel = useCallback((text: string) => onChange({ label: text }), [onChange]);

  const [keywordDraft, setKeywordDraft] = useDebouncedDraft(filters.keyword, applyKeyword);
  const [ownerDraft, setOwnerDraft] = useDebouncedDraft(filters.owner, applyOwner);
  const [creatorDraft, setCreatorDraft] = useDebouncedDraft(filters.creator, applyCreator);
  const [labelDraft, setLabelDraft] = useDebouncedDraft(filters.label, applyLabel);

  useEffect(() => {
    if (!open) {
      setMode("home");
      setSearch("");
      setPicked(null);
      setFieldValues([]);
      setFrom("");
      setTo("");
    }
  }, [open]);

  const filteredFields = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return fieldsQuery.data?.fields ?? [];
    return (fieldsQuery.data?.fields ?? []).filter(
      (field) => field.label.toLowerCase().includes(query) || field.key.toLowerCase().includes(query),
    );
  }, [fieldsQuery.data, search]);

  const iterations = optionsQuery.data?.iterations ?? [];
  const iterationLabel = filters.iterationId
    ? iterations.find((item) => item.id === filters.iterationId)?.name ?? filters.iterationId
    : "全部迭代";
  const priorityOptions = optionsQuery.data?.priorities ?? [];
  const severityOptions = optionsQuery.data?.severities ?? [];

  function toggleListValue(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function pickField(field: FilterField) {
    setPicked(field);
    setFieldValues([]);
    setFrom("");
    setTo("");
    setMode("field-value");
  }

  function toggleFieldEnumValue(field: FilterField, value: string) {
    if (field.single) {
      setFieldValues([value]);
      return;
    }
    setFieldValues((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  const canConfirmField = (() => {
    if (!picked) return false;
    if (picked.kind === "date") return from.trim().length > 0 || to.trim().length > 0;
    if (picked.kind === "enum" && picked.options.length > 0) return fieldValues.length > 0;
    return (fieldValues[0] ?? "").trim().length > 0;
  })();

  function confirmFieldValue() {
    if (!picked || !canConfirmField) return;
    const condition: TapdCondition = {
      field: picked.key,
      label: picked.label,
      kind: picked.kind,
      kinds: [...picked.kinds],
      values:
        picked.kind === "date"
          ? []
          : picked.kind === "enum"
            ? fieldValues
            : fieldValues.slice(0, 1).map((item) => item.trim()),
      from: picked.kind === "date" ? from.trim() : "",
      to: picked.kind === "date" ? to.trim() : "",
    };
    const rest = filters.conditions.filter(
      (item) => !(item.field === picked.key && sameKinds(item.kinds, picked.kinds)),
    );
    onChange({ conditions: [...rest, condition] });
    setPicked(null);
    setMode("home");
  }

  const styles = useMemo<{
    row: ViewStyle;
    rowLabel: TextStyle;
    rowValue: TextStyle;
    rowSub: TextStyle;
    link: TextStyle;
    linkDanger: TextStyle;
    backRow: ViewStyle;
    input: TextStyle;
    sectionTitle: TextStyle;
    hint: TextStyle;
    divider: ViewStyle;
    footer: ViewStyle;
    primaryButton: ViewStyle;
    primaryLabel: TextStyle;
    disabledButton: ViewStyle;
    chips: ViewStyle;
  }>(() => ({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 9,
      paddingHorizontal: 2,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    rowLabel: { color: theme.colors.foregroundMuted, fontSize: 13, width: 64 },
    rowValue: { color: theme.colors.foreground, fontSize: 13, flex: 1 },
    rowSub: { color: theme.colors.foregroundMuted, fontSize: 11, flex: 1, textAlign: "right" },
    link: { color: theme.colors.accent, fontSize: 13 },
    linkDanger: { color: theme.colors.statusDanger, fontSize: 13 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
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
    sectionTitle: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 },
    hint: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 },
    divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 4 },
    footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 8 },
    primaryButton: { backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    primaryLabel: { color: theme.colors.accentForeground, fontSize: 13 },
    disabledButton: { opacity: 0.5 },
    chips: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 },
  }), [theme]);

  function backRow(to: Mode) {
    return (
      <Pressable accessibilityRole="button" style={styles.backRow} onPress={() => setMode(to)}>
        <Icon name="ChevronLeft" size={16} color={theme.colors.accent} />
        <Text style={styles.link}>返回</Text>
      </Pressable>
    );
  }

  if (mode === "iteration") {
    const rows = [{ id: "", name: "全部迭代", status: "" }, ...iterations];
    return (
      <Modal title="更多筛选 · 迭代" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <View style={{ flex: 1, minHeight: 0, paddingTop: 8, paddingHorizontal: 14 }}>
            {backRow("home")}
            <FlatList
              style={{ flex: 1, minHeight: 0 }}
              data={rows}
              keyExtractor={(item) => item.id || "__all__"}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  style={styles.row}
                  onPress={() => {
                    onChange({ iterationId: item.id });
                    setMode("home");
                  }}
                >
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {item.id === "" ? item.name : item.status === "done" ? `${item.name}（已关闭）` : item.name}
                  </Text>
                  {filters.iterationId === item.id ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                </Pressable>
              )}
            />
          </View>
        </Modal.Content>
      </Modal>
    );
  }

  if (mode === "field-pick") {
    const loading = fieldsQuery.isPending;
    return (
      <Modal title="更多筛选 · 添加条件" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, gap: 0 }}>
          <View style={{ flex: 1, minHeight: 0, gap: 8, paddingTop: 8, paddingHorizontal: 14 }}>
            {backRow("home")}
            <TextInput
              style={[styles.input, { flex: undefined }]}
              placeholder="搜索过滤条件（中文名或字段 key）"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={search}
              onChangeText={setSearch}
            />
            {loading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator color={theme.colors.foreground} />
              </View>
            ) : filteredFields.length === 0 ? (
              <Text style={styles.hint}>
                {fieldsQuery.isError ? "字段加载失败，请检查网络或 Token 后重试。" : "没有匹配的字段。"}
              </Text>
            ) : (
              <FlatList
                style={{ flex: 1, minHeight: 0 }}
                data={filteredFields}
                keyExtractor={(item) => `${item.key}-${item.label}`}
                renderItem={({ item }) => (
                  <Pressable accessibilityRole="button" style={styles.row} onPress={() => pickField(item)}>
                    <Text style={styles.rowValue} numberOfLines={1}>{item.label}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.kinds.map((kind) => KIND_SHORT[kind]).join("/")} · {item.key}
                    </Text>
                  </Pressable>
                )}
              />
            )}
          </View>
        </Modal.Content>
      </Modal>
    );
  }

  return (
    <Modal title="更多筛选" open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Modal.Content>
        {mode === "home" ? (
          <View style={{ gap: 6 }}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>关键词</Text>
              <TextInput
                style={styles.input}
                placeholder="标题模糊匹配"
                placeholderTextColor={theme.colors.foregroundMuted}
                value={keywordDraft}
                onChangeText={setKeywordDraft}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>处理人</Text>
              <View style={styles.chips}>
                <Chip label="我" theme={theme} active={filters.ownerMode === "mine"} onPress={() => onChange({ ownerMode: "mine" })} />
                <Chip label="全部人" theme={theme} active={filters.ownerMode === "all"} onPress={() => onChange({ ownerMode: "all" })} />
                <Chip label="指定人" theme={theme} active={filters.ownerMode === "custom"} onPress={() => onChange({ ownerMode: "custom" })} />
              </View>
            </View>
            {filters.ownerMode === "custom" ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel} />
                <TextInput
                  style={styles.input}
                  placeholder="处理人昵称"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  value={ownerDraft}
                  onChangeText={setOwnerDraft}
                />
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>创建人</Text>
              <TextInput
                style={styles.input}
                placeholder="昵称，留空=全部"
                placeholderTextColor={theme.colors.foregroundMuted}
                value={creatorDraft}
                onChangeText={setCreatorDraft}
              />
            </View>
            <Pressable accessibilityRole="button" style={styles.row} onPress={() => setMode("iteration")}>
              <Text style={styles.rowLabel}>迭代</Text>
              <Text style={styles.rowValue} numberOfLines={1}>{iterationLabel}</Text>
              <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.row} onPress={() => setMode("priority")}>
              <Text style={styles.rowLabel}>优先级</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {filters.priorities.length > 0 ? `已选 ${filters.priorities.length} 项` : "全部"}
              </Text>
              <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.row} onPress={() => setMode("severity")}>
              <Text style={styles.rowLabel}>严重程度</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {filters.severities.length > 0 ? `已选 ${filters.severities.length} 项（缺陷）` : "全部（缺陷）"}
              </Text>
              <Icon name="ChevronRight" size={15} color={theme.colors.foregroundMuted} />
            </Pressable>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>标签</Text>
              <TextInput
                style={styles.input}
                placeholder="精确匹配，留空=全部"
                placeholderTextColor={theme.colors.foregroundMuted}
                value={labelDraft}
                onChangeText={setLabelDraft}
              />
            </View>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>高级条件（任意动态字段）</Text>
            {filters.conditions.length === 0 ? (
              <Text style={styles.hint}>还没有高级条件。可添加如「预计结束」「发布计划」「任务类别」等任意字段。</Text>
            ) : (
              filters.conditions.map((condition) => (
                <View key={`${condition.field}-${condition.kinds.join()}`} style={styles.row}>
                  <Text style={styles.rowValue} numberOfLines={1}>{condition.label || condition.field}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{conditionSummary(condition)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onChange({ conditions: filters.conditions.filter((item) => item !== condition) })}
                  >
                    <Icon name="Trash2" size={15} color={theme.colors.statusDanger} />
                  </Pressable>
                </View>
              ))
            )}
            <Pressable
              accessibilityRole="button"
              style={{ paddingVertical: 10 }}
              onPress={() => {
                setSearch("");
                setMode("field-pick");
              }}
            >
              <Text style={styles.link}>+ 添加条件</Text>
            </Pressable>
          </View>
        ) : mode === "priority" ? (
          <View style={{ gap: 2 }}>
            {backRow("home")}
            {priorityOptions.length === 0 ? (
              <Text style={styles.hint}>暂无可选项，请稍后重试。</Text>
            ) : (
              priorityOptions.map((option) => {
                const selected = filters.priorities.includes(option.value);
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    style={styles.row}
                    onPress={() => onChange({ priorities: toggleListValue(filters.priorities, option.value) })}
                  >
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {option.label === option.value ? option.value : `${option.label}（${option.value}）`}
                    </Text>
                    {selected ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                  </Pressable>
                );
              })
            )}
            {filters.priorities.length > 0 ? (
              <Pressable accessibilityRole="button" style={{ paddingVertical: 10 }} onPress={() => onChange({ priorities: [] })}>
                <Text style={styles.link}>清空选择</Text>
              </Pressable>
            ) : null}
          </View>
        ) : mode === "severity" ? (
          <View style={{ gap: 2 }}>
            {backRow("home")}
            {severityOptions.length === 0 ? (
              <Text style={styles.hint}>暂无可选项，请稍后重试。</Text>
            ) : (
              severityOptions.map((option) => {
                const selected = filters.severities.includes(option.value);
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    style={styles.row}
                    onPress={() => onChange({ severities: toggleListValue(filters.severities, option.value) })}
                  >
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {option.label === option.value ? option.value : `${option.label}（${option.value}）`}
                    </Text>
                    {selected ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                  </Pressable>
                );
              })
            )}
            {filters.severities.length > 0 ? (
              <Pressable accessibilityRole="button" style={{ paddingVertical: 10 }} onPress={() => onChange({ severities: [] })}>
                <Text style={styles.link}>清空选择</Text>
              </Pressable>
            ) : null}
          </View>
        ) : picked ? (
          <View style={{ gap: 12 }}>
            {backRow("field-pick")}
            <Text style={styles.sectionTitle}>
              {picked.label}（{picked.key} · {picked.kinds.map((kind) => KIND_SHORT[kind]).join("/")}）
            </Text>
            {picked.kind === "date" ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  style={styles.input}
                  placeholder="开始日期，例如 2026-01-01（可留空）"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  value={from}
                  onChangeText={setFrom}
                />
                <TextInput
                  style={styles.input}
                  placeholder="结束日期，例如 2026-12-31（可留空）"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  value={to}
                  onChangeText={setTo}
                />
              </View>
            ) : picked.kind === "enum" && picked.options.length > 0 ? (
              <View>
                {picked.options.map((option) => {
                  const selected = fieldValues.includes(option.value);
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      style={styles.row}
                      onPress={() => toggleFieldEnumValue(picked, option.value)}
                    >
                      <Text style={styles.rowValue} numberOfLines={1}>
                        {option.label === option.value ? option.value : `${option.label}（${option.value}）`}
                      </Text>
                      {selected ? <Icon name="Check" size={16} color={theme.colors.accent} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={styles.input}
                placeholder={picked.kind === "user" ? "输入人员昵称" : "输入匹配值"}
                placeholderTextColor={theme.colors.foregroundMuted}
                value={fieldValues[0] ?? ""}
                onChangeText={(text) => setFieldValues([text])}
              />
            )}
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                style={[styles.primaryButton, !canConfirmField ? styles.disabledButton : null]}
                disabled={!canConfirmField}
                onPress={confirmFieldValue}
              >
                <Text style={styles.primaryLabel}>确定</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
