// The run screen — sport-pure by decision P7-D12:
//   map + course overlay + elapsed time + punch affordance + compass toggle.
//   NO live position dot. NO bearing/distance hints. Manual rotation only
//   (map component lands with the O-map tile pipeline; placeholder below).
// The leg clock stops at tag read (RunSession.punch), never at UI confirm.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FallbackPunchSheet } from "./FallbackPunchSheet";
import { CourseMap } from "../map/CourseMap";
import { useWindowDimensions } from "react-native";
import * as Location from "expo-location";
import {
  DEFAULT_PUNCH_FLOW,
  punchFlowInitial,
  punchFlowReduce,
  type PunchFlowState,
  type PunchOutcome,
  type RunSession,
} from "@orienteering/run-engine";
import type { PunchProvider } from "../nfc/PunchProvider";
import { color, touch, type as t } from "../theme";
import { strings } from "../strings";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function fmtDelta(ms: number, label?: string): string {
  const sign = ms <= 0 ? "-" : "+";
  return `${sign}${fmt(Math.abs(ms))}${label ? ` vs ${label}` : " vs best"}`;
}

export interface RunScreenProps {
  session: RunSession;
  punchProvider: PunchProvider;
  /** registry cache: chip UID -> flagId */
  resolveTag: (tagUid: string) => string | undefined;
  monotonicNow: () => number;
  onFinished: () => void;
  onAbandoned: () => void;
  /** back out before the run has started (pre-start only) */
  onExit: () => void;
}

export function RunScreen({
  session,
  punchProvider,
  resolveTag,
  monotonicNow,
  onFinished,
  onAbandoned,
  onExit,
}: RunScreenProps) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [flow, setFlow] = useState<PunchFlowState>(punchFlowInitial);
  const [elapsed, setElapsed] = useState<number | undefined>();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [showDesc, setShowDesc] = useState(false);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  // control descriptions (Postenbeschreibung): Start / 1 / 2 / … / Finish + code
  const descriptions = session.course.flagOrder.map((fid, i, arr) => {
    const label =
      i === 0 ? "Start" : i === arr.length - 1 ? "Finish" : `Control ${i}`;
    const code = session.course.ufids?.[fid] ?? session.course.shortCodes[fid] ?? "?";
    return { label, code, symbol: i === 0 ? "△" : i === arr.length - 1 ? "◎" : `${i}` };
  });

  // resolve a scanned/typed token (UFID letters OR printed number) -> flagId
  const flagByToken = (token: string): string | undefined => {
    const up = token.toUpperCase();
    const byUfid = Object.entries(session.course.ufids ?? {}).find(
      ([, u]) => u.toUpperCase() === up,
    )?.[0];
    if (byUfid) return byUfid;
    return Object.entries(session.course.shortCodes).find(([, c]) => c === token)?.[0];
  };

  // 1 Hz timer repaint
  useEffect(() => {
    const id = setInterval(() => setElapsed(session.elapsedMs(monotonicNow())), 1000);
    return () => clearInterval(id);
  }, [session, monotonicNow]);

  // record the GPS track for the whole run (foreground). Screen-off/background
  // tracking needs a dev build; in Expo Go it records while the app is open.
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000 },
        (loc) => session.gps(loc.coords.latitude, loc.coords.longitude, monotonicNow()),
      );
    })();
    return () => sub?.remove();
  }, [session, monotonicNow]);

  const dispatch = useCallback(
    (ev: Parameters<typeof punchFlowReduce>[1]) =>
      setFlow((s) => punchFlowReduce(s, ev)),
    [],
  );

  const handleOutcome = useCallback(
    (outcome: PunchOutcome) => {
      switch (outcome.result) {
        case "started":
          setFeedback(null);
          break;
        case "leg_closed":
          Vibration.vibrate(200);
          setFeedback(
            strings.punchSuccess(
              session.expectedShortCode ?? "?",
              fmt(outcome.legTimeMs),
              outcome.deltaToReferenceMs !== undefined
                ? fmtDelta(outcome.deltaToReferenceMs, outcome.referenceLabel)
                : "",
            ),
          );
          break;
        case "finished":
          Vibration.vibrate([0, 200, 100, 200]);
          onFinished();
          break;
        case "wrong_flag":
          setFeedback(
            strings.wrongFlag(outcome.punchedShortCode, outcome.expectedShortCode),
          );
          break;
        case "duplicate":
        case "ignored_phase":
          break;
      }
    },
    [session, onFinished],
  );

  const arm = useCallback(async () => {
    const now = monotonicNow();
    dispatch({ type: "ARM", nowMs: now });
    try {
      const read = await punchProvider.scan(DEFAULT_PUNCH_FLOW.scanTimeoutMs);
      const flagId = resolveTag(read.tagUid);
      const tNow = monotonicNow();
      dispatch({ type: "TAG_READ", nowMs: tNow });
      if (flagId) {
        // clock stops HERE — at tag read
        handleOutcome(session.punch(flagId, "nfc", tNow, read.tagUid));
      } else {
        // unknown chip: recorded server-side as evidence, user sees fallback
        dispatch({ type: "USE_FALLBACK" });
      }
      setTimeout(
        () => dispatch({ type: "DISMISS" }),
        DEFAULT_PUNCH_FLOW.successAutoDismissMs,
      );
    } catch {
      dispatch({ type: "READ_FAIL" });
    }
  }, [dispatch, handleOutcome, monotonicNow, punchProvider, resolveTag, session]);

  const confirmAbandon = useCallback(() => {
    Alert.alert(strings.abandonPrompt, undefined, [
      { text: strings.resumeYes, style: "cancel" },
      {
        text: strings.resumeNo,
        style: "destructive",
        onPress: () => {
          session.abandon(monotonicNow());
          onAbandoned();
        },
      },
    ]);
  }, [session, monotonicNow, onAbandoned]);

  const preStart = session.phase === "pre-start";

  // back: pre-start exits freely; mid-run it means abandoning (with confirm)
  const onBack = useCallback(() => {
    if (preStart) onExit();
    else confirmAbandon();
  }, [preStart, onExit, confirmAbandon]);

  const handleFallbackPunch = useCallback(
    (token: string, method: "qr" | "manual") => {
      const flagId = flagByToken(token);
      setShowFallback(false);
      if (!flagId) {
        setFeedback(`No flag "${token}" on this course.`);
        return;
      }
      handleOutcome(session.punch(flagId, method, monotonicNow()));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, monotonicNow, handleOutcome],
  );

  return (
    <View style={styles.root}>
      {/* Georeferenced O-map backdrop + course overlay. Deliberately NO live
          position dot, ever (P7-D12). */}
      <View style={styles.map}>
        <CourseMap
          flags={session.course.flagOrder.map((f) => session.course.flagPositions[f]!)}
          width={screenW}
          height={screenH}
          topInset={insets.top + 60}
        />
        {/* the rotating compass lives inside CourseMap */}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={styles.back}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={preStart ? "back" : "abandon run"}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.next}>
          {preStart ? "" : `next control #${session.expectedShortCode ?? "—"}`}
        </Text>
        {/* timer top-right (long-press to abandon) */}
        <Pressable onLongPress={confirmAbandon} delayLongPress={800}>
          <Text style={styles.timer}>
            {elapsed !== undefined ? fmt(elapsed) : "0:00"}
          </Text>
        </Pressable>
      </View>

      {/* control descriptions toggle (Postenbeschreibung), top-left below bar */}
      <Pressable
        style={[styles.descBtn, { top: insets.top + 60 }]}
        onPress={() => setShowDesc((s) => !s)}
        accessibilityLabel="control descriptions"
      >
        <Text style={styles.descBtnText}>≣</Text>
      </Pressable>

      {showDesc && (
        <View style={[styles.descPanel, { top: insets.top + 60 }]}>
          <Text style={styles.descTitle}>Controls</Text>
          {descriptions.map((d, i) => (
            <View key={i} style={styles.descRow}>
              <Text style={styles.descSym}>{d.symbol}</Text>
              <Text style={styles.descLabel}>{d.label}</Text>
              <Text style={styles.descCode}>{d.code}</Text>
            </View>
          ))}
        </View>
      )}

      {feedback && (
        <View style={styles.sheet}>
          <Text style={styles.sheetText}>{feedback}</Text>
        </View>
      )}

      {/* punch row: NFC button (iOS-style arm) + always-available QR/number */}
      <View style={[styles.punchRow, { paddingBottom: insets.bottom }]}>
        {!punchProvider.autoArms && (
          <Pressable
            style={[
              styles.punch,
              flow.kind === "scanning" && styles.punchScanning,
            ]}
            onPress={() => {
              if (flow.kind === "idle" || flow.kind === "failed") void arm();
              if (flow.kind === "fallback") setShowFallback(true);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.punchText}>
              {flow.kind === "scanning"
                ? strings.scanning
                : flow.kind === "fallback"
                  ? strings.nfcReadFail
                  : preStart
                    ? "TAP START FLAG TO BEGIN"
                    : strings.punchButton(session.expectedShortCode ?? "—")}
            </Text>
          </Pressable>
        )}
        <Pressable
          style={styles.qrBtn}
          onPress={() => setShowFallback(true)}
          accessibilityRole="button"
          accessibilityLabel="punch by QR code or flag number"
        >
          <Text style={styles.qrBtnText}>QR{"\n"}#</Text>
        </Pressable>
      </View>

      {showFallback && (
        <FallbackPunchSheet
          onPunch={handleFallbackPunch}
          onClose={() => setShowFallback(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  map: { flex: 1, backgroundColor: "#ffffff" },
  compass: {
    position: "absolute",
    top: 110,
    right: 12,
    width: touch.run,
    height: touch.run,
    borderRadius: touch.run / 2,
    backgroundColor: color.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  compassText: { color: color.onPanel, fontSize: t.body, fontWeight: "700" },
  compassGhost: {
    position: "absolute",
    top: 110,
    right: 12,
    width: touch.default,
    height: touch.default,
    alignItems: "center",
    justifyContent: "center",
  },
  compassGhostText: { color: color.muted, fontSize: t.body },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: color.panel, // SOLID, never translucent over the map
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  timer: {
    color: color.onPanel,
    fontSize: t.timer,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  next: { color: color.onPanel, fontSize: t.nextControl, fontWeight: "600" },
  back: {
    width: touch.default,
    height: touch.default,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: color.onPanel, fontSize: 32, fontWeight: "700" },
  descBtn: {
    position: "absolute",
    left: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(20,20,20,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  descBtnText: { color: color.onPanel, fontSize: 22, fontWeight: "700" },
  descPanel: {
    position: "absolute",
    left: 14,
    marginTop: 54,
    backgroundColor: color.panel,
    borderRadius: 12,
    padding: 12,
    minWidth: 190,
  },
  descTitle: {
    color: color.onPanel,
    fontSize: t.min,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  descRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4, gap: 10 },
  descSym: {
    color: color.accent,
    fontSize: t.body,
    fontWeight: "800",
    width: 24,
    textAlign: "center",
  },
  descLabel: { color: color.onPanel, fontSize: t.body, flex: 1 },
  descCode: {
    color: color.onPanel,
    fontSize: t.body,
    fontWeight: "700",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  punchRow: { flexDirection: "row", backgroundColor: color.panel },
  qrBtn: {
    width: touch.punchButton + 16,
    minHeight: touch.punchButton,
    backgroundColor: color.panel,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#333",
  },
  qrBtnText: {
    color: color.onPanel,
    fontSize: t.body,
    fontWeight: "700",
    textAlign: "center",
  },
  sheet: {
    backgroundColor: color.panel,
    padding: 16,
  },
  sheetText: { color: color.onPanel, fontSize: t.body, fontWeight: "600" },
  punch: {
    flex: 1,
    minHeight: touch.punchButton,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  punchScanning: { backgroundColor: color.panel },
  punchText: { color: color.onPanel, fontSize: t.nextControl, fontWeight: "700" },
});
