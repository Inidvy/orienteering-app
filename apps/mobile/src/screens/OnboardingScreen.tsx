// Onboarding — "set up at home, run tomorrow" (decision P3-7A). Steps all
// completable with signal at home; the trailhead then needs nothing.
// Auth is invisible (anonymous device account): the runner only enters
// name + birth year + gender. Adapters live in ports/supabasePorts.ts.

import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { color, font, touch, type as t } from "../theme";
import { strings } from "../strings";

export interface OnboardingPorts {
  /** invisible anonymous sign-in; resolves when the device account exists */
  signIn(): Promise<void>;
  /** true when this device already has an account WITH a profile */
  hasAccount(): Promise<boolean>;
  saveProfile(p: {
    displayName: string;
    birthYear: number;
    gender: "M" | "W";
    /** contact address, stored unverified */
    email: string;
  }): Promise<void>;
  /** returns true when granted */
  requestLocation(): Promise<boolean>;
  requestNfc(): Promise<boolean>;
  requestBatteryExemption(): Promise<boolean>;
}

type Step = "welcome" | "anchored" | "permissions" | "done";

export function OnboardingScreen({
  ports,
  onComplete,
}: {
  ports: OnboardingPorts;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<"M" | "W" | null>(null);
  const [granted, setGranted] = useState({ loc: false, nfc: false, batt: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const profileValid =
    name.trim().length > 0 &&
    /^\S+@\S+\.\S+$/.test(email.trim()) &&
    /^\d{4}$/.test(birthYear) &&
    +birthYear > 1900 &&
    gender !== null;

  if (step === "welcome") {
    return (
      <View style={styles.root}>
        <Text style={styles.h1}>Timed courses in the forest.</Text>
        <Text style={styles.p}>Verified leaderboards. Real orienteering.</Text>

        <TextInput
          style={styles.input}
          placeholder="display name"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="birth year"
          keyboardType="number-pad"
          maxLength={4}
          value={birthYear}
          onChangeText={setBirthYear}
        />
        <Text style={styles.why}>
          Birth year and gender put you in your class — Elite and age classes,
          M and W ranked separately.
        </Text>
        <View style={styles.genderRow}>
          {(["M", "W"] as const).map((g) => (
            <Pressable
              key={g}
              style={[styles.gender, gender === g && styles.genderActive]}
              onPress={() => setGender(g)}
            >
              <Text
                style={[styles.genderText, gender === g && styles.genderTextActive]}
              >
                {g}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.cta, (!profileValid || busy) && styles.ctaDisabled]}
          disabled={!profileValid || busy}
          onPress={async () => {
            setBusy(true);
            setErr("");
            try {
              await ports.signIn();
              await ports.saveProfile({
                displayName: name.trim(),
                birthYear: +birthYear,
                gender: gender!,
                email: email.trim(),
              });
              setStep("anchored");
            } catch {
              setErr(strings.signInFail);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Text style={styles.ctaText}>{busy ? "…" : "Start running"}</Text>
        </Pressable>
        {!!err && <Text style={styles.err}>{err}</Text>}

        {/* sign-in shortcut (user request 2026-07-12): a device that already
            has an account+profile skips sign-up, anchored AND permissions */}
        <Pressable
          style={styles.linkRow}
          disabled={busy}
          onPress={async () => {
            setErr("");
            setBusy(true);
            try {
              if (await ports.hasAccount()) onComplete();
              else setErr(strings.noAccountYet);
            } catch {
              setErr(strings.signInFail);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Text style={styles.link}>Already set up on this phone? Sign in ›</Text>
        </Pressable>
      </View>
    );
  }

  if (step === "anchored") {
    return (
      <View style={styles.root}>
        <Text style={styles.h1}>{strings.anchored}</Text>
        <Text style={styles.p}>
          Being online once before you run lets your times be trusted — even if
          the whole run happens with zero signal.
        </Text>
        <Pressable style={styles.cta} onPress={() => setStep("permissions")}>
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </View>
    );
  }

  if (step === "permissions") {
    const rows: {
      key: keyof typeof granted;
      label: string;
      why: string;
      ask: () => Promise<boolean>;
    }[] = [
      { key: "loc", label: "Location — always", why: strings.permLocation, ask: ports.requestLocation },
      { key: "nfc", label: "NFC", why: strings.permNfc, ask: ports.requestNfc },
      { key: "batt", label: "Battery exemption", why: strings.permBattery, ask: ports.requestBatteryExemption },
    ];
    const allGranted = rows.every((r) => granted[r.key]);
    return (
      <View style={styles.root}>
        <Text style={styles.h1}>Three permissions, three reasons.</Text>
        {rows.map((r) => (
          <Pressable
            key={r.key}
            style={styles.permRow}
            onPress={async () => {
              const ok = await r.ask();
              setGranted((g) => ({ ...g, [r.key]: ok }));
            }}
          >
            <Text style={styles.permLabel}>
              {granted[r.key] ? "✓ " : "○ "}
              {r.label}
            </Text>
            <Text style={styles.why}>{r.why}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.cta, !allGranted && styles.ctaDisabled]}
          disabled={!allGranted}
          onPress={() => {
            setStep("done");
            onComplete();
          }}
        >
          <Text style={styles.ctaText}>Pick tomorrow's run</Text>
        </Pressable>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface, padding: 24, gap: 12, justifyContent: "center" },
  h1: { fontSize: 34, fontFamily: font.display, color: color.onSurface, lineHeight: 36 },
  p: { fontSize: t.body, color: color.onSurface, fontFamily: font.sans },
  why: { fontSize: t.min, color: color.muted },
  input: {
    borderWidth: 1,
    borderColor: color.muted,
    borderRadius: 8,
    minHeight: touch.default,
    paddingHorizontal: 12,
    fontSize: t.body,
    color: color.onSurface,
  },
  genderRow: { flexDirection: "row", gap: 8 },
  gender: {
    minWidth: touch.default,
    minHeight: touch.default,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  genderActive: { backgroundColor: color.accent, borderColor: color.accent },
  genderText: { fontSize: t.body, color: color.onSurface, fontWeight: "600" },
  genderTextActive: { color: color.onPanel },
  err: { fontSize: t.min, color: color.error },
  linkRow: { minHeight: touch.default, justifyContent: "center", marginTop: 4 },
  link: {
    fontSize: t.min - 1,
    color: color.accent,
    fontFamily: font.mono,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  permRow: { gap: 2, paddingVertical: 8, minHeight: touch.default },
  permLabel: { fontSize: t.body, fontWeight: "600", color: color.onSurface },
  cta: {
    minHeight: touch.default,
    backgroundColor: color.accent,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    color: color.onPanel,
    fontSize: t.min - 1,
    fontFamily: font.mono,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
