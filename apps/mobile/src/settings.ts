// Local device preferences (AsyncStorage) — not part of the profile row.
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFER_QR_KEY = "prefer-qr-punch";

/** Punch preference (user request 2026-07-12): when true, the run screen's
 * punch button opens the QR camera directly instead of arming NFC. */
export async function getPreferQrPunch(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREFER_QR_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setPreferQrPunch(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFER_QR_KEY, value ? "1" : "0");
  } catch {}
}
