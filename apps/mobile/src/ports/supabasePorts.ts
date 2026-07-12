// Real adapters replacing the demo mocks, backed by the live Supabase project.
// Auth uses email OTP codes rather than magic LINKS on mobile: a 6-digit code
// typed into the app avoids deep-link plumbing and works in Expo Go.
import { supabase, SUPABASE_URL } from "../supabase";
import type { OnboardingPorts } from "../screens/OnboardingScreen";

export interface OtpAuth {
  /** step 1: send the 6-digit code to the email */
  requestCode(email: string): Promise<void>;
  /** step 2: verify the code the user typed */
  verifyCode(email: string, code: string): Promise<void>;
}

export const otpAuth: OtpAuth = {
  async requestCode(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  },
  async verifyCode(email, code) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) throw error;
  },
};

export async function saveProfile(p: {
  displayName: string;
  birthYear: number;
  gender: "M" | "W";
}): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("not signed in");
  const { error } = await supabase.from("profiles").upsert({
    id: user.user.id,
    display_name: p.displayName,
    birth_year: p.birthYear,
    gender: p.gender,
  });
  if (error) throw error;
}

/**
 * Pre-run time anchor (D19): server wall-clock captured while online. Stored
 * locally; sent with the run row at sync. One successful call ever clears the
 * "no pre-run anchor" cap for future runs.
 */
export async function fetchServerTimeAnchor(): Promise<string> {
  // any REST response carries the server Date header — that's the truth we
  // anchor to (no dedicated endpoint needed).
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { method: "HEAD" });
  const date = res.headers.get("date");
  if (!date) throw new Error("no server date header");
  return new Date(date).toISOString();
}

/** Permission asks stay mocked until the EAS dev build (expo-location etc.). */
export function devBuildPorts(auth: {
  signIn: OnboardingPorts["signIn"];
}): OnboardingPorts {
  return {
    signIn: auth.signIn,
    saveProfile,
    requestLocation: async () => true,
    requestNfc: async () => true,
    requestBatteryExemption: async () => true,
  };
}
