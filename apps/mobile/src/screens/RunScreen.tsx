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
}

export function RunScreen({
  session,
  punchProvider,
  resolveTag,
  monotonicNow,
  onFinished,
  onAbandoned,
}: RunScreenProps) {
  const [flow, setFlow] = useState<PunchFlowState>(punchFlowInitial);
  const [elapsed, setElapsed] = useState<number | undefined>();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [compassOn, setCompassOn] = useState(true);
  const flowRef = useRef(flow);
  flowRef.current = flow;

  // 1 Hz timer repaint
  useEffect(() => {
    const id = setInterval(() => setElapsed(session.elapsedMs(monotonicNow())), 1000);
    return () => clearInterval(id);
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

  const onTimerLongPress = useCallback(() => {
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

  return (
    <View style={styles.root}>
      {/* Map placeholder — MapLibre + O-map raster tiles land with the tile
          pipeline. Deliberately NO position dot, ever (P7-D12). */}
      <View style={styles.map}>
        <Text style={styles.mapNote}>O-map</Text>
        {compassOn && (
          <Pressable
            style={styles.compass}
            onPress={() => setCompassOn(false)}
            accessibilityLabel="compass (tap to hide)"
          >
            <Text style={styles.compassText}>N▲</Text>
          </Pressable>
        )}
        {!compassOn && (
          <Pressable style={styles.compassGhost} onPress={() => setCompassOn(true)}>
            <Text style={styles.compassGhostText}>◦</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.topBar}>
        <Pressable onLongPress={onTimerLongPress} delayLongPress={800}>
          <Text style={styles.timer}>
            {elapsed !== undefined ? fmt(elapsed) : "--:--"}
          </Text>
        </Pressable>
        <Text style={styles.next}>
          {preStart
            ? strings.preStart
            : `next: #${session.expectedShortCode ?? "—"}`}
        </Text>
      </View>

      {feedback && (
        <View style={styles.sheet}>
          <Text style={styles.sheetText}>{feedback}</Text>
        </View>
      )}

      {/* iOS punch button; on Android reader-mode devices this auto-arms */}
      {!punchProvider.autoArms && (
        <Pressable
          style={[styles.punch, flow.kind === "scanning" && styles.punchScanning]}
          onPress={() => {
            if (flow.kind === "idle" || flow.kind === "failed") void arm();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.punchText}>
            {flow.kind === "scanning"
              ? strings.scanning
              : flow.kind === "fallback"
                ? strings.nfcReadFail
                : strings.punchButton(session.expectedShortCode ?? "—")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  map: { flex: 1, backgroundColor: "#eef3e2" },
  mapNote: { margin: 8, color: color.muted, fontSize: t.min },
  compass: {
    position: "absolute",
    top: 12,
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
    top: 12,
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
    alignItems: "baseline",
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
  sheet: {
    backgroundColor: color.panel,
    padding: 16,
  },
  sheetText: { color: color.onPanel, fontSize: t.body, fontWeight: "600" },
  punch: {
    minHeight: touch.punchButton,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  punchScanning: { backgroundColor: color.panel },
  punchText: { color: color.onPanel, fontSize: t.nextControl, fontWeight: "700" },
});
