import { useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import type { TapdFilters } from "../../shared/contracts";
import { AdvancedFilterChip } from "./AdvancedFilter";
import { Chip, ToolbarButton, type WorkbenchTheme } from "./bits";

export function FilterBar({ theme, filters, onChange, onReset }: {
  theme: WorkbenchTheme;
  filters: TapdFilters;
  onChange: (patch: Partial<TapdFilters>) => void;
  onReset: () => void;
}) {
  const styles = useMemo<{ bar: ViewStyle; group: ViewStyle }>(() => ({
    bar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
    group: { flexDirection: "row", alignItems: "center", gap: 4 },
  }), []);

  return (
    <View style={styles.bar}>
      <View style={styles.group}>
        <Chip label="全部状态" theme={theme} active={filters.statusScope === "all"} onPress={() => onChange({ statusScope: "all" })} />
        <Chip label="进行中" theme={theme} active={filters.statusScope === "active"} onPress={() => onChange({ statusScope: "active" })} />
        <Chip label="已结束" theme={theme} active={filters.statusScope === "done"} onPress={() => onChange({ statusScope: "done" })} />
      </View>
      <View style={styles.group}>
        <Chip label="不限时间" theme={theme} active={filters.modifiedWithinDays === 0} onPress={() => onChange({ modifiedWithinDays: 0 })} />
        <Chip label="近7天" theme={theme} active={filters.modifiedWithinDays === 7} onPress={() => onChange({ modifiedWithinDays: 7 })} />
        <Chip label="近30天" theme={theme} active={filters.modifiedWithinDays === 30} onPress={() => onChange({ modifiedWithinDays: 30 })} />
        <Chip label="近90天" theme={theme} active={filters.modifiedWithinDays === 90} onPress={() => onChange({ modifiedWithinDays: 90 })} />
      </View>
      <AdvancedFilterChip theme={theme} filters={filters} onChange={onChange} />
      <ToolbarButton icon="RotateCcw" label="重置" theme={theme} onPress={onReset} />
    </View>
  );
}
