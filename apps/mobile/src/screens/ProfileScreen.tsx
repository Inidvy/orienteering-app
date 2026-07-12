// Profile settings (gear top-right on the browse map): edit display name,
// birth year, gender and (write-only) email, plus a profile photo taken with
// the camera. The photo stays ON DEVICE (AsyncStorage) — the user hasn't
// decided yet whether it gets used anywhere else, so nothing is uploaded.
// Email can't be prefilled: the column is client-unreadable by design (0009);
// leaving the field empty keeps the stored address.

import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getOwnProfile, saveProfile } from "../ports/supabasePorts";
import { getPreferQrPunch, setPreferQrPunch } from "../settings";
import { color, font, touch, type as t } from "../theme";

const PHOTO_KEY = "profile-photo-base64";

export function ProfileScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState<"M" | "W" | null>(null);
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [preferQr, setPreferQr] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const camRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  useEffect(() => {
    getOwnProfile()
      .then((p) => {
        if (!p) return;
        setName(p.displayName);
        setBirthYear(String(p.birthYear));
        setGender(p.gender);
        if (p.email) setEmail(p.email);
      })
      .catch(() => {});
    AsyncStorage.getItem(PHOTO_KEY).then(setPhoto).catch(() => {});
    getPreferQrPunch().then(setPreferQr).catch(() => {});
  }, []);

  const valid =
    name.trim().length > 0 && /^\d{4}$/.test(birthYear) && +birthYear > 1900 && gender !== null;

  const save = async () => {
    setBusy(true);
    setMsg("");
    try {
      // email deliberately not sent — it's read-only on this screen
      await saveProfile({
        displayName: name.trim(),
        birthYear: +birthYear,
        gender: gender!,
      });
      setMsg("Saved.");
    } catch {
      setMsg("Saving didn't finish — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (!camPerm?.granted) {
      const r = await requestCamPerm();
      if (!r.granted) return;
    }
    setCameraOpen(true);
  };

  const snap = async () => {
    const pic = await camRef.current?.takePictureAsync({ base64: true, quality: 0.15 });
    setCameraOpen(false);
    if (pic?.base64) {
      const uri = `data:image/jpeg;base64,${pic.base64}`;
      setPhoto(uri);
      AsyncStorage.setItem(PHOTO_KEY, uri).catch(() => {});
    }
  };

  if (cameraOpen) {
    return (
      <View style={styles.camRoot}>
        <CameraView ref={camRef} style={{ flex: 1 }} facing="front" />
        <View style={[styles.camBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.camCancel} onPress={() => setCameraOpen(false)}>
            <Text style={styles.camCancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.shutter} onPress={snap} accessibilityLabel="take photo" />
          <View style={styles.camCancel} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 24, paddingTop: insets.top + 16, gap: 12 }}
    >
      <View style={styles.headRow}>
        <Pressable style={styles.back} onPress={onBack} accessibilityLabel="back">
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.h1}>Profile</Text>
      </View>

      <View style={styles.avatarRow}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Text style={styles.avatarInitial}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
          </View>
        )}
        <Pressable style={styles.photoBtn} onPress={takePhoto}>
          <Text style={styles.photoBtnText}>{photo ? "Retake photo" : "Take photo"}</Text>
        </Pressable>
      </View>
      <Text style={styles.why}>The photo stays on this device.</Text>

      <TextInput style={styles.input} placeholder="display name" value={name} onChangeText={setName} />

      {/* email is read-only here (user decision 2026-07-12): shown as a hint,
          set once at onboarding */}
      {!!email && (
        <View style={styles.emailRow}>
          <Text style={styles.emailLabel}>email</Text>
          <Text style={styles.emailValue}>{email}</Text>
        </View>
      )}
      <TextInput
        style={styles.input}
        placeholder="birth year"
        keyboardType="number-pad"
        maxLength={4}
        value={birthYear}
        onChangeText={setBirthYear}
      />
      <View style={styles.genderRow}>
        {(["M", "W"] as const).map((g) => (
          <Pressable
            key={g}
            style={[styles.gender, gender === g && styles.genderActive]}
            onPress={() => setGender(g)}
          >
            <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>{g}</Text>
          </Pressable>
        ))}
      </View>

      {/* punch preference (user request 2026-07-12): saved immediately,
          device-local */}
      <View style={styles.prefRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.prefLabel}>Punch by QR code</Text>
          <Text style={styles.why}>The punch button opens the camera right away.</Text>
        </View>
        <Switch
          value={preferQr}
          onValueChange={(v) => {
            setPreferQr(v);
            void setPreferQrPunch(v);
          }}
          trackColor={{ true: color.accent, false: color.hair }}
          thumbColor="#fff"
        />
      </View>

      <Pressable
        style={[styles.cta, (!valid || busy) && styles.ctaDisabled]}
        disabled={!valid || busy}
        onPress={save}
      >
        <Text style={styles.ctaText}>{busy ? "…" : "Save"}</Text>
      </Pressable>
      {!!msg && <Text style={msg === "Saved." ? styles.ok : styles.err}>{msg}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  back: {
    width: touch.default,
    height: touch.default,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 32, fontWeight: "700", color: color.onSurface, marginTop: -4 },
  h1: { fontSize: 30, fontFamily: font.display, color: color.onSurface },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: color.hair },
  avatarEmpty: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 40, fontFamily: font.display, color: color.muted },
  photoBtn: {
    minHeight: touch.default,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  photoBtnText: {
    fontSize: t.min - 1,
    fontFamily: font.mono,
    color: color.onSurface,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  why: { fontSize: t.min, color: color.muted },
  emailRow: {
    minHeight: touch.default,
    borderRadius: 8,
    backgroundColor: color.hair,
    paddingHorizontal: 12,
    justifyContent: "center",
    gap: 2,
  },
  emailLabel: {
    fontSize: t.min - 5,
    color: color.muted,
    fontFamily: font.mono,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  emailValue: { fontSize: t.body, color: color.onSurface, fontFamily: font.sans },
  input: {
    borderWidth: 1,
    borderColor: color.muted,
    borderRadius: 8,
    minHeight: touch.default,
    paddingHorizontal: 12,
    fontSize: t.body,
    color: color.onSurface,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: touch.default,
    marginTop: 4,
  },
  prefLabel: { fontSize: t.body, color: color.onSurface, fontFamily: font.sansBold },
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
  ok: { fontSize: t.min, color: color.verified },
  err: { fontSize: t.min, color: color.error },
  camRoot: { flex: 1, backgroundColor: "#000" },
  camBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  camCancel: { width: 80, minHeight: touch.default, justifyContent: "center" },
  camCancelText: { color: "#fff", fontSize: t.body, fontFamily: font.sansBold },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    borderWidth: 5,
    borderColor: "rgba(255,255,255,.5)",
  },
});
