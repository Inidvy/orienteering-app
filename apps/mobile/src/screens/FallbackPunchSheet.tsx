// QR-scan + manual number entry — always reachable from the run screen (user
// field feedback), not only after NFC failures. QR plates encode the flag's
// printed short code; manual entry types the same number. Both demote the
// leg per the trust rules (qr/manual method), which the runner already knows.

import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { color, touch, type as t } from "../theme";

export function FallbackPunchSheet({
  onPunch,
  onClose,
}: {
  /** shortCode as printed on the plate; method qr or manual */
  onPunch: (shortCode: string, method: "qr" | "manual") => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [scanned, setScanned] = useState(false);

  const extractCode = (data: string): string | null => {
    // QR payload is the short code, optionally wrapped (e.g. "...flag=4")
    const m = data.match(/\d{1,4}/);
    return m ? m[0] : null;
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Punch by QR or number</Text>
        <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      {permission?.granted ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (scanned) return;
            const code = extractCode(data);
            if (code) {
              setScanned(true);
              onPunch(code, "qr");
            }
          }}
        />
      ) : (
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permText}>Allow camera to scan QR codes</Text>
        </Pressable>
      )}

      <View style={styles.manualRow}>
        <TextInput
          style={styles.input}
          placeholder="flag number"
          keyboardType="number-pad"
          maxLength={4}
          value={manual}
          onChangeText={setManual}
        />
        <Pressable
          style={[styles.submit, manual.length === 0 && styles.submitDisabled]}
          disabled={manual.length === 0}
          onPress={() => onPunch(manual, "manual")}
        >
          <Text style={styles.submitText}>Punch</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: "25%",
    backgroundColor: color.panel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: color.onPanel, fontSize: t.body, fontWeight: "700" },
  close: {
    width: touch.default,
    height: touch.default,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: color.onPanel, fontSize: t.nextControl },
  camera: { flex: 1, borderRadius: 8, overflow: "hidden" },
  permBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.muted,
    borderRadius: 8,
  },
  permText: { color: color.onPanel, fontSize: t.body },
  manualRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: 8,
    minHeight: touch.run,
    paddingHorizontal: 12,
    fontSize: t.nextControl,
    color: color.onSurface,
  },
  submit: {
    minWidth: 100,
    minHeight: touch.run,
    backgroundColor: color.accent,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: color.onPanel, fontSize: t.body, fontWeight: "700" },
});
