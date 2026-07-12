// Run history — "My runs": every past run with course, date, total time and
// its trust status, filterable by status. Tapping a run opens the run DETAIL
// PAGE (map + splits + comparisons) — the earlier inline map expansion was
// janky inside the sheet (user feedback 2026-07-12).

import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, touch, type as t } from "../theme";
import { strings } from "../strings";
import type { MyRun } from "../leaderboard";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}.${d.getFullYear()}`;
}

const STATUS_COLOR: Record<string, string> = {
  verified: color.verified,
  partial: color.warning,
  unverified: color.error,
};

// status filter chips (user request 2026-07-12)
const FILTERS = ["all", "verified", "partial", "unverified"] as const;
type Filter = (typeof FILTERS)[number];

export function RunHistoryScreen({
  runs,
  onOpenRun,
}: {
  runs: MyRun[];
  /** tap a run -> full detail page (route, splits, comparisons) */
  onOpenRun: (run: MyRun) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? runs : runs.filter((r) => r.status === filter);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>My runs</Text>
        <Text style={styles.count}>{shown.length} shown</Text>
      </View>

      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{strings.emptyHistory}</Text>
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => r.runId}
          renderItem={({ item }) => {
            const badge = item.dnf
              ? "abandoned"
              : item.status ?? strings.rankPending;
            return (
              <Pressable style={styles.card} onPress={() => onOpenRun(item)}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.course}>{item.courseName}</Text>
                    <Text style={styles.date}>{fmtDate(item.completedAtMs)}</Text>
                  </View>
                  <Text style={styles.time}>
                    {item.totalTimeMs != null ? fmt(item.totalTimeMs) : "—"}
                  </Text>
                  <Text
                    style={[
                      styles.badge,
                      { color: STATUS_COLOR[item.status ?? ""] ?? color.muted },
                    ]}
                  >
                    {badge}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    padding: 16,
  },
  title: { fontSize: t.nextControl, fontFamily: font.display, color: color.onSurface },
  count: {
    fontSize: t.min - 2,
    color: color.muted,
    fontFamily: font.mono,
    textTransform: "uppercase",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    minHeight: touch.default - 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: color.accent, borderColor: color.accent },
  chipText: {
    fontSize: t.min - 3,
    color: color.onSurface,
    fontFamily: font.mono,
    textTransform: "uppercase",
  },
  chipTextActive: { color: color.onPanel },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { fontSize: t.body, color: color.muted, textAlign: "center" },
  card: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: touch.default,
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  course: { fontSize: t.body, color: color.onSurface, fontFamily: font.sansBold },
  date: { fontSize: t.min - 2, color: color.muted, fontFamily: font.mono },
  time: {
    fontSize: t.body,
    color: color.onSurface,
    fontFamily: font.mono,
    fontVariant: ["tabular-nums"],
  },
  badge: {
    fontSize: t.min - 3,
    fontFamily: font.mono,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  chevron: { fontSize: t.nextControl, color: color.muted, marginTop: -2 },
});
