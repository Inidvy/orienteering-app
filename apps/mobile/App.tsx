// Demo shell: Home -> Run -> Finish with a bundled demo course and the mock
// punch provider (simulate taps with the DEV buttons). Real navigation,
// onboarding, course browse, and leaderboards land per docs/design.md.

import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { RunSession, type CourseSpec } from "@orienteering/run-engine";
import { RunScreen } from "./src/screens/RunScreen";
import { FinishScreen } from "./src/screens/FinishScreen";
import { mockPunchProvider, type TagRead } from "./src/nfc/PunchProvider";
import { color, touch, type as t } from "./src/theme";

const DEMO_COURSE: CourseSpec = {
  id: "demo",
  flagOrder: ["S", "C1", "F"],
  flagPositions: {
    S: { lat: 60.0, lon: 10.0 },
    C1: { lat: 60.0018, lon: 10.0 },
    F: { lat: 60.0036, lon: 10.0 },
  },
  shortCodes: { S: "1", C1: "4", F: "9" },
  referenceLegTimesMs: [55_000, 58_000],
  referenceLabel: "course record pace",
};

const REGISTRY: Record<string, string> = {
  "uid-S": "S",
  "uid-C1": "C1",
  "uid-F": "F",
};

type Screen = "home" | "run" | "finish";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const t0 = useRef(Date.now());
  const monotonicNow = () => Date.now() - t0.current;

  // DEV punch queue: each press of a DEV button enqueues the next tag read
  const queueRef = useRef<(TagRead | Error)[]>([]);
  const provider = useMemo(
    () => mockPunchProvider(queueRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [screen],
  );

  const sessionRef = useRef<RunSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new RunSession(DEMO_COURSE, {
      uuid: () => Math.random().toString(36).slice(2),
    });
  }
  const session = sessionRef.current;

  if (screen === "home") {
    return (
      <View style={styles.home}>
        <Text style={styles.title}>Orienteering App</Text>
        <Pressable style={styles.cta} onPress={() => setScreen("run")}>
          <Text style={styles.ctaText}>Run a course (demo)</Text>
        </Pressable>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (screen === "run") {
    return (
      <View style={{ flex: 1 }}>
        <RunScreen
          session={session}
          punchProvider={provider}
          resolveTag={(uid) => REGISTRY[uid]}
          monotonicNow={monotonicNow}
          onFinished={() => setScreen("finish")}
          onAbandoned={() => setScreen("home")}
        />
        {/* DEV: simulate the next tag read (removed in field builds) */}
        <View style={styles.devRow}>
          {Object.keys(REGISTRY).map((uid) => (
            <Pressable
              key={uid}
              style={styles.devBtn}
              onPress={() => queueRef.current.push({ tagUid: uid })}
            >
              <Text style={styles.devText}>{uid}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return <FinishScreen session={session} />;
}

const styles = StyleSheet.create({
  home: {
    flex: 1,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  title: { fontSize: t.nextControl, fontWeight: "700", color: color.onSurface },
  cta: {
    minHeight: touch.default,
    paddingHorizontal: 24,
    backgroundColor: color.accent,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: color.onPanel, fontSize: t.body, fontWeight: "700" },
  devRow: {
    flexDirection: "row",
    gap: 8,
    padding: 8,
    backgroundColor: "#f3f4f6",
  },
  devBtn: { padding: 8, backgroundColor: "#e5e7eb", borderRadius: 6 },
  devText: { fontSize: t.min - 2, color: color.muted },
});
