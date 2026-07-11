// Course browse + detail (screen map P1-1A): list with records and flag
// warnings; detail holds the START affordance. Bearing assist deliberately
// absent from all of this (P7-D12). Flag photos render when the registry
// carries photo URLs (D15.1).

import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { CourseSpec } from "@orienteering/run-engine";
import { color, touch, type as t } from "../theme";

export interface CourseListing {
  spec: CourseSpec;
  name: string;
  lengthM?: number;
  recordMs?: number;
  recordHolder?: string;
  openFlagReports: number;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function CourseBrowseScreen({
  courses,
  onStart,
  onLeaderboard,
}: {
  courses: CourseListing[];
  onStart: (c: CourseListing) => void;
  onLeaderboard: (c: CourseListing) => void;
}) {
  const [selected, setSelected] = useState<CourseListing | null>(null);

  if (selected) {
    return (
      <View style={styles.root}>
        <Pressable style={styles.back} onPress={() => setSelected(null)}>
          <Text style={styles.backText}>‹ Courses</Text>
        </Pressable>
        <Text style={styles.h1}>{selected.name}</Text>
        <Text style={styles.meta}>
          {selected.spec.flagOrder.length - 2} controls
          {selected.lengthM ? ` · ${(selected.lengthM / 1000).toFixed(1)} km` : ""}
        </Text>
        {selected.recordMs != null && (
          <Text style={styles.meta}>
            Record {fmt(selected.recordMs)}
            {selected.recordHolder ? ` — ${selected.recordHolder}` : ""}
          </Text>
        )}
        {selected.openFlagReports > 0 && (
          <Text style={styles.warning}>
            ⚠ {selected.openFlagReports} flag report
            {selected.openFlagReports > 1 ? "s" : ""} open on this course
          </Text>
        )}
        <Pressable style={styles.start} onPress={() => onStart(selected)}>
          <Text style={styles.startText}>START</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => onLeaderboard(selected)}>
          <Text style={styles.secondaryText}>Leaderboard ›</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.h1}>Courses</Text>
      {courses.length === 0 ? (
        <Text style={styles.meta}>No courses here yet.</Text>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.spec.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => setSelected(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.spec.flagOrder.length - 2} controls
                  {item.recordMs != null ? ` · record ${fmt(item.recordMs)}` : ""}
                  {item.openFlagReports > 0 ? " · ⚠" : ""}
                </Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface, padding: 16, gap: 8 },
  back: { minHeight: touch.default, justifyContent: "center" },
  backText: { fontSize: t.body, color: color.accent, fontWeight: "600" },
  h1: { fontSize: t.nextControl, fontWeight: "700", color: color.onSurface },
  meta: { fontSize: t.min, color: color.muted },
  warning: { fontSize: t.body, color: color.warning, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touch.run,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  rowName: { fontSize: t.body, fontWeight: "600", color: color.onSurface },
  chev: { fontSize: t.nextControl, color: color.muted },
  start: {
    minHeight: touch.punchButton,
    backgroundColor: color.accent,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  startText: { color: color.onPanel, fontSize: t.nextControl, fontWeight: "700" },
  secondary: { minHeight: touch.default, justifyContent: "center", alignItems: "center" },
  secondaryText: { fontSize: t.body, color: color.accent, fontWeight: "600" },
});
