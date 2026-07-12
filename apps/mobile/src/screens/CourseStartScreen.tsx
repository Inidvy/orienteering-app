// Course detail / pre-start screen. Sits between picking a course on the map
// and entering the run: shows the course drawn on the O-map plus its stats
// (distance, controls, difficulty, record pace), then one big Start button.
// This is where the runner reads the course before committing — the run screen
// itself is sport-pure and shows no such chrome.

import { useWindowDimensions } from "react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CourseMap } from "../map/CourseMap";
import { color, font, touch, type as t } from "../theme";
import type { CoursePin } from "./CourseMapPicker";
import type { ClassStats } from "../leaderboard";

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

const DIFF_COLOR = { Easy: color.verified, Medium: color.warning, Hard: color.error };

export function CourseStartScreen({
  pin,
  classStats,
  onStart,
  onBack,
}: {
  pin: CoursePin;
  /** best/avg verified time in the viewer's own class (null while loading) */
  classStats?: ClassStats | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const spec = pin.spec;
  const controls = Math.max(0, spec.flagOrder.length - 2);
  const km = (pin.lengthM / 1000).toFixed(1);
  // fair start (user decision 2026-07-12): before the run only the START flag
  // is shown — no controls, no legs, so the route can't be studied for free
  const startOnly = [spec.flagPositions[spec.flagOrder[0]!]!];
  const recordMs = spec.referenceLegTimesMs?.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);

  const stats: { label: string; value: string; tint?: string }[] = [
    { label: "Distance", value: `${km} km` },
    { label: "Controls", value: `${controls}` },
    { label: "Difficulty", value: pin.difficulty, tint: DIFF_COLOR[pin.difficulty] },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        {/* ONLY the start on the O-map — the course reveals at the start punch */}
        <View style={styles.mapBox}>
          <CourseMap flags={startOnly} width={width} height={280} topInset={insets.top + 8} />
          <Pressable
            style={[styles.back, { top: insets.top + 8 }]}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="back to courses"
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.eyebrow}>Course</Text>
          <Text style={styles.name}>{pin.name}</Text>

          <View style={styles.statRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={[styles.statValue, s.tint ? { color: s.tint } : null]}>
                  {s.value}
                </Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {recordMs != null && (
            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>
                {spec.referenceLabel ?? "record pace"}
              </Text>
              <Text style={styles.recordTime}>{fmt(recordMs)}</Text>
            </View>
          )}

          {/* your class on this course: best + average verified time */}
          {classStats && (
            <View style={styles.recordRow}>
              <Text style={styles.recordLabel}>
                {classStats.classLabel} · best / avg
              </Text>
              {classStats.count > 0 ? (
                <Text style={styles.recordTime}>
                  {fmt(classStats.bestMs)} / {fmt(classStats.avgMs)}
                </Text>
              ) : (
                <Text style={styles.recordLabel}>be the first</Text>
              )}
            </View>
          )}

          <Text style={styles.note}>
            Punch the start flag to begin — the clock starts there, not now. Your
            GPS route records silently for verification.
          </Text>
        </View>
      </ScrollView>

      {/* pinned start action */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.start} onPress={onStart} accessibilityRole="button">
          <Text style={styles.startText}>Start run</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  mapBox: { height: 280, backgroundColor: "#fff" },
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
  body: { padding: 20, gap: 14 },
  eyebrow: {
    fontFamily: font.mono,
    fontSize: t.min - 4,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: color.accent,
  },
  name: {
    fontFamily: font.display,
    fontSize: 32,
    lineHeight: 34,
    color: color.onSurface,
    marginTop: -6,
  },
  statRow: {
    flexDirection: "row",
    marginTop: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.hair,
  },
  stat: { flex: 1, paddingVertical: 14, gap: 4 },
  statValue: { fontFamily: font.mono, fontSize: 22, color: color.onSurface },
  statLabel: {
    fontFamily: font.mono,
    fontSize: t.min - 5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: color.muted,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#faf6f0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  recordLabel: {
    fontFamily: font.mono,
    fontSize: t.min - 3,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: color.muted,
  },
  recordTime: {
    fontFamily: font.mono,
    fontSize: t.nextControl,
    color: color.onSurface,
    fontVariant: ["tabular-nums"],
  },
  note: { fontFamily: font.sans, fontSize: t.min, color: color.muted, lineHeight: 22 },
  cta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.hair,
  },
  start: {
    minHeight: touch.punchButton,
    borderRadius: 14,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  startText: {
    color: color.onPanel,
    fontFamily: font.mono,
    fontSize: t.body,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
