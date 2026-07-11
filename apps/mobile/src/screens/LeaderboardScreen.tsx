// Leaderboard — the payoff screen. Verified runs ranked; partial/unverified
// visibly below, unranked (the trust story made visible). Class chips filter
// the same data (P7-D13-A). The viewer's row is highlighted and, when
// off-screen, pinned at the bottom edge (P3-8A).

import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  buildLeaderboard,
  findOwnRank,
  CLASS_CHIPS,
  type ClassChip,
  type LeaderboardRun,
} from "@orienteering/verification-core";
import { color, touch, type as t } from "../theme";
import { strings } from "../strings";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function LeaderboardScreen({
  courseName,
  runs,
  viewerId,
}: {
  courseName: string;
  runs: LeaderboardRun[];
  viewerId: string;
}) {
  const [chip, setChip] = useState<ClassChip>("overall");
  const [ownVisible, setOwnVisible] = useState(true);
  const board = useMemo(() => buildLeaderboard(runs, chip), [runs, chip]);
  const own = findOwnRank(board, viewerId);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{courseName}</Text>
        <Text style={styles.count}>{board.ranked.length} verified</Text>
      </View>

      <View style={styles.chips}>
        {CLASS_CHIPS.map((c) => (
          <Pressable
            key={c}
            style={[styles.chip, chip === c && styles.chipActive]}
            onPress={() => setChip(c)}
          >
            <Text style={[styles.chipText, chip === c && styles.chipTextActive]}>
              {c === "overall" ? "Overall" : c}
            </Text>
          </Pressable>
        ))}
      </View>

      {board.ranked.length === 0 && board.unranked.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{strings.emptyLeaderboard}</Text>
        </View>
      ) : (
        <FlatList
          data={board.ranked}
          keyExtractor={(e) => e.run.runId}
          onViewableItemsChanged={({ viewableItems }) =>
            setOwnVisible(
              !own ||
                viewableItems.some((v) => v.item?.run?.userId === viewerId),
            )
          }
          renderItem={({ item }) => {
            const you = item.run.userId === viewerId;
            return (
              <View style={[styles.row, you && styles.youRow]}>
                <Text style={styles.rank}>{item.rank}</Text>
                <Text style={[styles.name, you && styles.youText]}>
                  {item.run.displayName}
                  {you ? "  · you" : ""}
                </Text>
                <Text style={styles.time}>{fmt(item.run.totalTimeMs)}</Text>
                <Text style={styles.badge}>✓</Text>
              </View>
            );
          }}
          ListFooterComponent={
            board.unranked.length > 0 ? (
              <View style={styles.unrankedBlock}>
                <Text style={styles.unrankedHeader}>unranked</Text>
                {board.unranked.map((r) => (
                  <View key={r.runId} style={styles.row}>
                    <Text style={styles.rank}>–</Text>
                    <Text style={styles.nameMuted}>{r.displayName}</Text>
                    <Text style={styles.timeMuted}>{fmt(r.totalTimeMs)}</Text>
                    <Text style={styles.badgeMuted}>{r.status}</Text>
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}

      {/* you-row pin when scrolled out of view (P3-8A) */}
      {own && !ownVisible && (
        <View style={[styles.row, styles.youRow, styles.pinned]}>
          <Text style={styles.rank}>{own.rank}</Text>
          <Text style={[styles.name, styles.youText]}>
            {own.run.displayName}  · you
          </Text>
          <Text style={styles.time}>{fmt(own.run.totalTimeMs)}</Text>
          <Text style={styles.badge}>✓</Text>
        </View>
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
  title: { fontSize: t.nextControl, fontWeight: "700", color: color.onSurface },
  count: { fontSize: t.min, color: color.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  chip: {
    minHeight: touch.default,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: color.accent, borderColor: color.accent },
  chipText: { fontSize: t.min, color: color.onSurface },
  chipTextActive: { color: color.onPanel, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { fontSize: t.body, color: color.muted, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    minHeight: touch.default,
  },
  youRow: { backgroundColor: "#fdeef7" },
  youText: { fontWeight: "700" },
  pinned: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: color.accent,
  },
  rank: { width: 28, fontSize: t.body, color: color.onSurface, fontWeight: "600" },
  name: { flex: 1, fontSize: t.body, color: color.onSurface },
  nameMuted: { flex: 1, fontSize: t.body, color: color.muted },
  time: {
    fontSize: t.body,
    color: color.onSurface,
    fontVariant: ["tabular-nums"],
  },
  timeMuted: { fontSize: t.body, color: color.muted, fontVariant: ["tabular-nums"] },
  badge: { fontSize: t.body, color: color.verified, fontWeight: "700" },
  badgeMuted: { fontSize: t.min - 2, color: color.muted },
  unrankedBlock: { marginTop: 12, paddingBottom: 80 },
  unrankedHeader: {
    fontSize: t.min - 2,
    color: color.muted,
    paddingHorizontal: 16,
    textTransform: "uppercase",
  },
});
