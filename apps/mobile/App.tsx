// App shell walking the full v1 journey:
//   Onboarding -> Course browse -> RUN -> Finish -> Leaderboard
// Live pieces: anonymous auth + profile (ports/supabasePorts), run sync +
// server verdict (sync/supabaseTransport -> sync-run edge fn), leaderboard
// rows from the DB. Permissions, NFC and map tiles stay mocked until the EAS
// dev build. Screens follow docs/design.md UI Specification.

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Archivo_800ExtraBold } from "@expo-google-fonts/archivo";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_600SemiBold,
} from "@expo-google-fonts/ibm-plex-sans";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_700Bold,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  RunSession,
  syncRun,
  memoryCheckpointStore,
  type CourseSpec,
  type ServerVerdict,
} from "@orienteering/run-engine";
import { RERUN_COOLDOWN_MS, type LeaderboardRun } from "@orienteering/verification-core";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { devBuildPorts, fetchServerTimeAnchor, getOwnProfile } from "./src/ports/supabasePorts";
import { supabaseTransport } from "./src/sync/supabaseTransport";
import {
  loadLeaderboard,
  loadMyRuns,
  loadOwnClassStats,
  saveLocalTrack,
  type ClassStats,
  type MyRun,
} from "./src/leaderboard";
import { RunHistoryScreen } from "./src/screens/RunHistoryScreen";
import { RunDetailScreen } from "./src/screens/RunDetailScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { getPreferQrPunch } from "./src/settings";
import { supabase } from "./src/supabase";
import { CourseMapPicker, type CoursePin } from "./src/screens/CourseMapPicker";
import { CourseStartScreen } from "./src/screens/CourseStartScreen";
import { loadCoursePins } from "./src/courses";
import { RunScreen } from "./src/screens/RunScreen";
import { FinishScreen } from "./src/screens/FinishScreen";
import { LeaderboardScreen } from "./src/screens/LeaderboardScreen";
import { mockPunchProvider, type TagRead } from "./src/nfc/PunchProvider";
import { color, font, type as t } from "./src/theme";

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

// Invisible anonymous auth + profile save; permission asks still auto-grant.
const onboardingPorts = devBuildPorts();

// RFC-4122 v4 shape from Math.random — runs.id/punches.id are Postgres uuid
// columns, so the ID must be a REAL uuid (a random base36 string 400s at the
// DB). Randomness quality is fine here: these are idempotency keys, not
// secrets. No crypto polyfill needed in Expo Go.
const uuid4 = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

type Screen =
  | "onboarding"
  | "browse"
  | "courseStart"
  | "run"
  | "finish"
  | "leaderboard"
  | "profile"
  | "runDetail";

export default function App() {
  const [fontsLoaded] = useFonts({
    Archivo_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_700Bold,
  });
  if (!fontsLoaded) return null;
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
  const [pins, setPins] = useState<CoursePin[]>([DEMO_PIN]);
  const t0 = useRef(Date.now());
  const monotonicNow = () => Date.now() - t0.current;

  const queueRef = useRef<(TagRead | Error)[]>([]);
  const providerRef = useRef(mockPunchProvider(queueRef.current));

  // load real courses from the DB (created in the admin); keep demo as fallback
  useEffect(() => {
    loadCoursePins()
      .then((p) => { if (p.length) setPins(p); })
      .catch(() => {});
  }, []);

  // skip onboarding only when session AND profile exist — a session without a
  // profile row (e.g. the profile save failed once) breaks every run sync at
  // the runs.runner -> profiles FK, so send those users through onboarding
  // again (sign-in is idempotent, the profile gets created this time)
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session) return;
        const profile = await getOwnProfile().catch(() => null);
        if (profile) setScreen((s) => (s === "onboarding" ? "browse" : s));
      })
      .catch(() => {});
  }, []);

  const [selected, setSelected] = useState<CoursePin | null>(null);
  const sessionRef = useRef<RunSession | null>(null);

  // sync + ranking state
  const [verdict, setVerdict] = useState<ServerVerdict | undefined>();
  const [board, setBoard] = useState<LeaderboardRun[]>([]);
  const [classStats, setClassStats] = useState<ClassStats | null>(null);
  const [uid, setUid] = useState("");

  // device preference: punch button opens the QR camera directly
  const [preferQr, setPreferQr] = useState(false);
  useEffect(() => {
    getPreferQrPunch().then(setPreferQr).catch(() => {});
  }, [screen]);

  // run history: feeds "My runs" sheet + done/cooldown/best pins on the map
  const [myRuns, setMyRuns] = useState<MyRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailRun, setDetailRun] = useState<MyRun | null>(null);
  useEffect(() => {
    if (screen !== "browse") return;
    loadMyRuns().then(setMyRuns).catch(() => {});
  }, [screen]);
  const doneCourseIds = [...new Set(myRuns.map((r) => r.courseId))];
  const coolingCourseIds = [
    ...new Set(
      myRuns
        .filter((r) => r.completedAtMs + RERUN_COOLDOWN_MS > Date.now())
        .map((r) => r.courseId),
    ),
  ];
  const bestMsByCourse = new Map<string, number>();
  for (const r of myRuns) {
    if (r.status !== "verified" || r.totalTimeMs == null) continue;
    const prev = bestMsByCourse.get(r.courseId);
    if (prev === undefined || r.totalTimeMs < prev) bestMsByCourse.set(r.courseId, r.totalTimeMs);
  }
  const myBest: Record<string, string> = {};
  for (const [cid, ms] of bestMsByCourse) {
    const s = Math.floor(ms / 1000);
    myBest[cid] = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }
  const checkpointsRef = useRef(memoryCheckpointStore());
  const anchorRef = useRef<string | undefined>(undefined);

  // pre-run time anchor (D19): grab server wall-clock whenever we're online
  const refreshAnchor = () =>
    fetchServerTimeAnchor()
      .then((iso) => { anchorRef.current = iso; })
      .catch(() => {});
  useEffect(() => { void refreshAnchor(); }, []);

  // pick on the map -> course detail screen (stats + start), not straight to run
  const openCourse = (courseId: string) => {
    const pin = pins.find((p) => p.spec.id === courseId) ?? pins[0]!;
    setSelected(pin);
    setClassStats(null);
    loadOwnClassStats(pin.spec.id).then(setClassStats).catch(() => {});
    setScreen("courseStart");
  };

  const startRun = (pin: CoursePin) => {
    sessionRef.current = new RunSession(pin.spec, { uuid: uuid4 });
    setVerdict(undefined);
    void refreshAnchor();
    setScreen("run");
  };

  // upload the finished run and get the server verdict; safe to call again
  // forever (idempotent upserts + checkpoints), so we retry while offline
  const syncFinished = async () => {
    const session = sessionRef.current;
    if (!session) return;
    const result = await syncRun(
      session.buildSyncPayload(),
      supabaseTransport(supabase),
      checkpointsRef.current,
      { preRunAnchorIso: anchorRef.current },
    );
    if (result.ok) setVerdict(result.verdict);
  };

  // retry sync every 15 s while the finish screen waits for a verdict
  // (forest-edge connectivity: interrupted uploads are the normal case)
  useEffect(() => {
    if (screen !== "finish" || verdict) return;
    const id = setInterval(() => void syncFinished(), 15_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, verdict]);

  // real leaderboard rows for the selected course
  useEffect(() => {
    if (screen !== "leaderboard" || !selected) return;
    loadLeaderboard(selected.spec.id).then(setBoard).catch(() => {});
    supabase.auth.getSession()
      .then(({ data }) => setUid(data.session?.user.id ?? ""))
      .catch(() => {});
  }, [screen, selected]);

  switch (screen) {
    case "onboarding":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <OnboardingScreen ports={onboardingPorts} onComplete={() => setScreen("browse")} />
          <StatusBar style="auto" />
        </SafeAreaView>
      );

    case "browse":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            <CourseMapPicker
              courses={pins}
              doneCourseIds={doneCourseIds}
              coolingCourseIds={coolingCourseIds}
              myBest={myBest}
              onSelect={(id) => openCourse(id)}
              onViewRun={(courseId) => {
                const latest = myRuns.find((r) => r.courseId === courseId);
                if (latest) {
                  setDetailRun(latest);
                  setScreen("runDetail");
                } else setHistoryOpen(true);
              }}
            />
            {historyOpen && (
              <View style={styles.historySheet}>
                <RunHistoryScreen
                  runs={myRuns}
                  onOpenRun={(run) => {
                    setDetailRun(run);
                    setScreen("runDetail");
                  }}
                />
              </View>
            )}
            {/* profile settings, top-right (user request 2026-07-12) */}
            <Pressable
              style={styles.gear}
              onPress={() => setScreen("profile")}
              accessibilityLabel="profile settings"
            >
              <Text style={styles.gearText}>⚙</Text>
            </Pressable>
          </View>
          {/* bottom toggle bar: my past runs as a slide-up list */}
          <Pressable style={styles.link} onPress={() => setHistoryOpen((o) => !o)}>
            <Text style={styles.linkText}>
              {historyOpen ? "▾ Hide my runs" : `▴ My runs (${myRuns.length})`}
            </Text>
          </Pressable>
        </SafeAreaView>
      );

    case "runDetail": {
      const pin = pins.find((p) => p.spec.id === detailRun?.courseId);
      return (
        <RunDetailScreen
          run={detailRun!}
          flags={pin ? pin.spec.flagOrder.map((f) => pin.spec.flagPositions[f]!) : []}
          onBack={() => setScreen("browse")}
        />
      );
    }

    case "profile":
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
          <ProfileScreen onBack={() => setScreen("browse")} />
        </SafeAreaView>
      );

    case "courseStart":
      // course detail: stats + course drawn on the map, then Start.
      return (
        <CourseStartScreen
          pin={selected ?? pins[0]!}
          classStats={classStats}
          onStart={() => startRun(selected ?? pins[0]!)}
          onBack={() => setScreen("browse")}
        />
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
          preferQr={preferQr}
          onFinished={() => {
            // route cache for the run history — works offline/pre-sync
            const s = sessionRef.current;
            if (s) {
              void saveLocalTrack(
                s.runId,
                s.track.map((p) => ({ lat: p.lat, lon: p.lon })),
              );
            }
            setScreen("finish");
            void syncFinished();
          }}
          onAbandoned={() => setScreen("browse")}
          onExit={() => setScreen("browse")}
        />
      );

    case "finish":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <FinishScreen session={sessionRef.current!} verdict={verdict} />
          <Pressable style={styles.link} onPress={() => setScreen("leaderboard")}>
            <Text style={styles.linkText}>See yourself on the leaderboard →</Text>
          </Pressable>
        </SafeAreaView>
      );

    case "leaderboard":
      return (
        <SafeAreaView style={{ flex: 1 }}>
          <LeaderboardScreen
            courseName={selected?.name ?? pins[0]!.name}
            runs={board}
            viewerId={uid}
          />
          <Pressable style={styles.link} onPress={() => setScreen("browse")}>
            <Text style={styles.linkText}>‹ Courses</Text>
          </Pressable>
        </SafeAreaView>
      );
  }
}

const styles = StyleSheet.create({
  gear: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.panel,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  gearText: { color: color.onPanel, fontSize: 24, lineHeight: 28 },
  historySheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "58%",
    backgroundColor: color.surface,
    borderTopWidth: 2,
    borderTopColor: color.accent,
  },
  link: { padding: 16, backgroundColor: color.surface },
  linkText: {
    fontSize: t.min - 1,
    color: color.accent,
    fontFamily: font.mono,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
