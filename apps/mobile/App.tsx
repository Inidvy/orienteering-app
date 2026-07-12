// Demo shell walking the full v1 journey with mock ports:
//   Onboarding -> Course browse -> RUN -> Finish -> Leaderboard
// Real adapters (Supabase auth, expo permissions, NFC, map tiles) replace the
// mocks in the EAS dev build. Screens follow docs/design.md UI Specification.

import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { RunSession, type CourseSpec } from "@orienteering/run-engine";
import type { LeaderboardRun } from "@orienteering/verification-core";
import { OnboardingScreen, type OnboardingPorts } from "./src/screens/OnboardingScreen";
import { CourseMapPicker, type CoursePin } from "./src/screens/CourseMapPicker";
import { RunScreen } from "./src/screens/RunScreen";
import { FinishScreen } from "./src/screens/FinishScreen";
import { LeaderboardScreen } from "./src/screens/LeaderboardScreen";
import { mockPunchProvider, type TagRead } from "./src/nfc/PunchProvider";
import { color, type as t } from "./src/theme";

// Demo course in the real mapped area (Karlsruhe, inside hadiko-bounds.json)
const DEMO_COURSE: CourseSpec = {
  id: "demo",
  flagOrder: ["S", "C1", "F"],
  flagPositions: {
    S: { lat: 49.0158, lon: 8.4262 },
    C1: { lat: 49.0186, lon: 8.4318 },
    F: { lat: 49.0208, lon: 8.4288 },
  },
  shortCodes: { S: "1", C1: "4", F: "9" }, // course-order labels
  ufids: { S: "PZKU", C1: "MKRZ", F: "UZAG" }, // 4-letter codes (live DB) — scan/type these
  referenceLegTimesMs: [55_000, 58_000],
  referenceLabel: "course record pace",
};

const DEMO_PIN: CoursePin = {
  spec: DEMO_COURSE,
  name: "Hadiko Sprint (demo)",
  lengthM: 1200,
  difficulty: "Medium",
  start: DEMO_COURSE.flagPositions.S!,
};

const REGISTRY: Record<string, string> = {
  "uid-S": "S",
  "uid-C1": "C1",
  "uid-F": "F",
};

const DEMO_BOARD: LeaderboardRun[] = [
  { runId: "r1", userId: "u-a", displayName: "Henri S.", birthYear: 1992, gender: "M", status: "verified", totalTimeMs: 113_000, completedAtMs: Date.UTC(2026, 5, 1) },
  { runId: "r2", userId: "u-b", displayName: "Mikko L.", birthYear: 1985, gender: "M", status: "verified", totalTimeMs: 121_000, completedAtMs: Date.UTC(2026, 5, 3) },
  { runId: "r3", userId: "me", displayName: "You", birthYear: 1998, gender: "M", status: "verified", totalTimeMs: 126_000, completedAtMs: Date.UTC(2026, 5, 7) },
  { runId: "r4", userId: "u-d", displayName: "guest_run", birthYear: 2000, gender: "W", status: "unverified", totalTimeMs: 105_000, completedAtMs: Date.UTC(2026, 5, 8) },
];

// Mock ports for the demo shell — instant grants, no network.
const demoPorts: OnboardingPorts = {
  signIn: async () => {},
  saveProfile: async () => {},
  requestLocation: async () => true,
  requestNfc: async () => true,
  requestBatteryExemption: async () => true,
};

type Screen = "onboarding" | "browse" | "run" | "finish" | "leaderboard";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Shell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const [screen, setScreen] = useState<Screen>("onboarding");
  const t0 = useRef(Date.now());
  const monotonicNow = () => Date.now() - t0.current;

  const queueRef = useRef<(TagRead | Error)[]>([]);
  const providerRef = useRef(mockPunchProvider(queueRef.current));

  const sessionRef = useRef<RunSession | null>(null);
  const startRun = () => {
    sessionRef.current = new RunSession(DEMO_COURSE, {
      uuid: () => Math.random().toString(36).slice(2),
    });
    setScreen("run");
  };

  switch (screen) {
    case "onboarding":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <OnboardingScreen ports={demoPorts} onComplete={() => setScreen("browse")} />
          <StatusBar style="auto" />
        </SafeAreaView>
      );

    case "browse":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <CourseMapPicker courses={[DEMO_PIN]} onSelect={() => startRun()} />
        </SafeAreaView>
      );

    case "run":
      // RunScreen handles its own insets (full-bleed map behind the notch).
      // Punch by scanning a plate QR or typing the flag number (QR/# button).
      return (
        <RunScreen
          session={sessionRef.current!}
          punchProvider={providerRef.current}
          resolveTag={(uid) => REGISTRY[uid]}
          monotonicNow={monotonicNow}
          onFinished={() => setScreen("finish")}
          onAbandoned={() => setScreen("browse")}
          onExit={() => setScreen("browse")}
        />
      );

    case "finish":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <FinishScreen session={sessionRef.current!} />
          <Pressable style={styles.link} onPress={() => setScreen("leaderboard")}>
            <Text style={styles.linkText}>See yourself on the leaderboard →</Text>
          </Pressable>
        </SafeAreaView>
      );

    case "leaderboard":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <LeaderboardScreen
            courseName={DEMO_PIN.name}
            runs={DEMO_BOARD}
            viewerId="me"
          />
          <Pressable style={styles.link} onPress={() => setScreen("browse")}>
            <Text style={styles.linkText}>‹ Courses</Text>
          </Pressable>
        </SafeAreaView>
      );
  }
}

const styles = StyleSheet.create({
  link: { padding: 16, backgroundColor: color.surface },
  linkText: { fontSize: t.body, color: color.accent, fontWeight: "600" },
});
