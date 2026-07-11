// Finish screen — PRE-SYNC state by default (decision P2-6B): splits and total
// from local data, "provisionally verified — syncing…" chip (never a bare ✓),
// ranks pending. When the server verdict arrives, the screen upgrades in
// place; a demotion gets its designed slot here, never a toast.

import { StyleSheet, Text, View } from "react-native";
import type { RunSession, ServerVerdict } from "@orienteering/run-engine";
import { color, type as t } from "../theme";
import { strings } from "../strings";

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function FinishScreen({
  session,
  verdict,
}: {
  session: RunSession;
  /** undefined until sync completes */
  verdict?: ServerVerdict;
}) {
  const provisional = session.provisionalLegs();
  const legs = verdict?.legs ?? null;

  return (
    <View style={styles.root}>
      <Text style={styles.total}>
        {session.elapsedMs(0) !== undefined ? fmt(session.elapsedMs(0)!) : "--:--"}
      </Text>

      {verdict ? (
        <Text
          style={[
            styles.chip,
            verdict.status === "verified" ? styles.chipVerified : styles.chipOther,
          ]}
        >
          {verdict.status === "verified"
            ? "Verified ✓"
            : verdict.status === "partial"
              ? "Partial"
              : "Unverified"}
        </Text>
      ) : (
        <Text style={[styles.chip, styles.chipPending]}>{strings.preSyncChip}</Text>
      )}

      {/* designed demotion slot (copy table) */}
      {verdict && verdict.status !== "verified" && verdict.runReasons.length > 0 && (
        <Text style={styles.demotion}>{verdict.runReasons.join(" · ")}</Text>
      )}

      <View style={styles.table}>
        {(legs ?? provisional.map((l, i) => ({
          legIndex: i,
          status: l.status,
          reasons: l.reasons,
          legTimeMs: l.legTimeMs ?? null,
        }))).map((leg) => (
          <View key={leg.legIndex} style={styles.row}>
            <Text style={styles.cellLeg}>Leg {leg.legIndex + 1}</Text>
            <Text style={styles.cellTime}>
              {leg.legTimeMs != null ? fmt(leg.legTimeMs) : "—"}
            </Text>
            <Text style={styles.cellRank}>
              {verdict ? leg.status : strings.rankPending}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface, padding: 16, gap: 12 },
  total: {
    fontSize: t.timer,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: color.onSurface,
  },
  chip: { fontSize: t.body, fontWeight: "600", paddingVertical: 4 },
  chipVerified: { color: color.verified },
  chipOther: { color: color.warning },
  chipPending: { color: color.muted },
  demotion: { fontSize: t.body, color: color.error },
  table: { gap: 8, marginTop: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  cellLeg: { fontSize: t.body, color: color.onSurface, fontWeight: "600" },
  cellTime: {
    fontSize: t.body,
    color: color.onSurface,
    fontVariant: ["tabular-nums"],
  },
  cellRank: { fontSize: t.min, color: color.muted },
});
