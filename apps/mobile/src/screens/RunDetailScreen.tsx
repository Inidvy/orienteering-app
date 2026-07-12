// Run detail — its own page (user request 2026-07-12, replaces the buggy
// inline map in the history list): route over the course map on the top half,
// below it start/finish/total wall times and the per-leg splits with
// cumulative time and comparison against the course's best and average
// verified split.

import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LatLon } from "@orienteering/verification-core";
import { CourseMap } from "../map/CourseMap";
import { color, font, touch, type as t } from "../theme";
import {
  loadCourseSplitStats,
  loadRunTrack,
  type LegStat,
  type MyRun,
} from "../leaderboard";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function fmtDelta(ms: number): string {
  const sign = ms < 0 ? "-" : "+";
  return `${sign}${fmt(Math.abs(ms))}`;
}

function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

const STATUS_COLOR: Record<string, string> = {
  verified: color.verified,
  partial: color.warning,
  unverified: color.error,
};

export function RunDetailScreen({
  run,
  flags,
  onBack,
}: {
  run: MyRun;
  /** course flag positions, for the map under the route */
  flags: LatLon[];
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [track, setTrack] = useState<LatLon[] | null>(null);
  const [stats, setStats] = useState<Record<number, LegStat>>({});

  useEffect(() => {
    loadRunTrack(run.runId).then(setTrack).catch(() => setTrack([]));
    loadCourseSplitStats(run.courseId).then(setStats).catch(() => {});
  }, [run.runId, run.courseId]);

  const mapH = Math.round(height * 0.48);
  const startMs =
    run.totalTimeMs != null ? run.completedAtMs - run.totalTimeMs : null;

  // cumulative time at each control
  let cum = 0;
  const rows = run.splits.map((s) => {
    cum += s.legTimeMs ?? 0;
    return { ...s, cumMs: s.legTimeMs != null ? cum : null };
  });

  return (
    <View style={styles.root}>
      {/* top half: the route over the course */}
      <View style={[styles.mapBox, { height: mapH }]}>
        {flags.length > 0 && (
          <CourseMap
            flags={flags}
            track={track ?? undefined}
            width={width}
            height={mapH}
            topInset={insets.top + 8}
          />
        )}
        <Pressable
          style={[styles.back, { top: insets.top + 8 }]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="back"
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        {track !== null && track.length < 2 && (
          <Text style={[styles.noTrack, { top: insets.top + 16 }]}>
            no route recorded
          </Text>
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      >
        <Text style={styles.course}>{run.courseName}</Text>
        <Text style={[styles.status, { color: STATUS_COLOR[run.status ?? ""] ?? color.muted }]}>
          {run.dnf ? "abandoned" : run.status ?? "pending sync"}
        </Text>

        {/* start / finish / total */}
        <View style={styles.timesRow}>
          <View style={styles.timeCell}>
            <Text style={styles.timeValue}>{startMs != null ? fmtClock(startMs) : "—"}</Text>
            <Text style={styles.timeLabel}>start</Text>
          </View>
          <View style={styles.timeCell}>
            <Text style={styles.timeValue}>{fmtClock(run.completedAtMs)}</Text>
            <Text style={styles.timeLabel}>finish</Text>
          </View>
          <View style={styles.timeCell}>
            <Text style={styles.timeValue}>
              {run.totalTimeMs != null ? fmt(run.totalTimeMs) : "—"}
            </Text>
            <Text style={styles.timeLabel}>total</Text>
          </View>
        </View>

        {/* legs: split, cumulative, vs best, vs average */}
        {rows.length > 0 && (
          <View style={styles.table}>
            <View style={styles.headRow}>
              <Text style={[styles.hCell, styles.cLeg]}>leg</Text>
              <Text style={[styles.hCell, styles.cTime]}>split</Text>
              <Text style={[styles.hCell, styles.cTime]}>@</Text>
              <Text style={[styles.hCell, styles.cDelta]}>vs best</Text>
              <Text style={[styles.hCell, styles.cDelta]}>vs Ø</Text>
            </View>
            {rows.map((s) => {
              const st = stats[s.legIndex];
              const dBest =
                st && s.legTimeMs != null ? s.legTimeMs - st.bestMs : null;
              const dAvg =
                st && s.legTimeMs != null ? s.legTimeMs - st.avgMs : null;
              return (
                <View key={s.legIndex} style={styles.row}>
                  <Text
                    style={[
                      styles.cell,
                      styles.cLeg,
                      { color: STATUS_COLOR[s.status] ?? color.muted },
                    ]}
                  >
                    {s.legIndex + 1}
                  </Text>
                  <Text style={[styles.cell, styles.cTime]}>
                    {s.legTimeMs != null ? fmt(s.legTimeMs) : "—"}
                  </Text>
                  <Text style={[styles.cell, styles.cTime, { color: color.muted }]}>
                    {s.cumMs != null ? fmt(s.cumMs) : "—"}
                  </Text>
                  <Text
                    style={[
                      styles.cell,
                      styles.cDelta,
                      { color: dBest != null && dBest <= 0 ? color.verified : color.muted },
                    ]}
                  >
                    {dBest != null ? fmtDelta(dBest) : "—"}
                  </Text>
                  <Text
                    style={[
                      styles.cell,
                      styles.cDelta,
                      {
                        color:
                          dAvg == null
                            ? color.muted
                            : dAvg <= 0
                              ? color.verified
                              : color.error,
                      },
                    ]}
                  >
                    {dAvg != null ? fmtDelta(dAvg) : "—"}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        {rows.length === 0 && (
          <Text style={styles.noSplits}>
            Splits appear once the run has synced.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  mapBox: { backgroundColor: "#fff" },
  back: {
    position: "absolute",
    left: 12,
    width: touch.default,
    height: touch.default,
    borderRadius: touch.default / 2,
    backgroundColor: color.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: color.onPanel, fontSize: 30, fontWeight: "700", marginTop: -2 },
  noTrack: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: color.panel,
    color: color.onPanel,
    fontSize: t.min - 2,
    fontFamily: font.mono,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  body: { flex: 1, borderTopWidth: 1, borderTopColor: color.hair },
  course: { fontSize: t.nextControl, fontFamily: font.display, color: color.onSurface },
  status: {
    fontSize: t.min - 2,
    fontFamily: font.mono,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  timesRow: {
    flexDirection: "row",
    marginTop: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.hair,
  },
  timeCell: { flex: 1, paddingVertical: 10, gap: 2 },
  timeValue: {
    fontFamily: font.mono,
    fontSize: t.body,
    color: color.onSurface,
    fontVariant: ["tabular-nums"],
  },
  timeLabel: {
    fontFamily: font.mono,
    fontSize: t.min - 5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: color.muted,
  },
  table: { marginTop: 12 },
  headRow: { flexDirection: "row", paddingVertical: 6 },
  hCell: {
    fontFamily: font.mono,
    fontSize: t.min - 5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: color.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touch.default - 10,
    borderTopWidth: 1,
    borderTopColor: color.hair,
  },
  cell: {
    fontFamily: font.mono,
    fontSize: t.min,
    color: color.onSurface,
    fontVariant: ["tabular-nums"],
  },
  cLeg: { width: 44 },
  cTime: { flex: 1 },
  cDelta: { flex: 1, textAlign: "right" },
  noSplits: { marginTop: 16, fontSize: t.min, color: color.muted },
});
