// Real adapters replacing the demo mocks, backed by the live Supabase project.
// Auth is ANONYMOUS (revised on user decision: zero friction, no email): the
// app creates an invisible Supabase device account so RLS write-authority
// keeps working; the runner only types name + birth year + gender.
// Requires "Allow anonymous sign-ins" in the Supabase auth settings.
import { supabase, SUPABASE_URL } from "../supabase";
import type { OnboardingPorts } from "../screens/OnboardingScreen";

/** Idempotent: reuses the existing session, otherwise creates the account. */
export async function signInAnonymously(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export async function saveProfile(p: {
  displayName: string;
  birthYear: number;
  gender: "M" | "W";
  /**
   * unverified contact address (user decision) — column is service-role-read
   * only, so the app can't prefill it; omit/empty = keep the stored one
   */
  email?: string;
}): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("not signed in");
  // NOT an upsert: ON CONFLICT DO UPDATE needs SELECT on every written column,
  // and profiles.email is deliberately unreadable to clients (migration 0009).
  // Plain UPDATE, then INSERT when the row doesn't exist yet.
  const row: Record<string, unknown> = {
    display_name: p.displayName,
    birth_year: p.birthYear,
    gender: p.gender,
  };
  if (p.email && p.email.trim()) row.email = p.email.trim().toLowerCase();
  const { error: updErr, count } = await supabase
    .from("profiles")
    .update(row, { count: "exact" })
    .eq("id", user.user.id);
  if (updErr) throw updErr;
  if (!count) {
    const { error: insErr } = await supabase
      .from("profiles")
      .insert({ id: user.user.id, ...row });
    if (insErr) throw insErr;
  }
}

/**
 * Own profile for the settings screen. The email column is client-unreadable
 * (0009), so the OWN address comes via the get_own_email() RPC — a
 * SECURITY DEFINER function keyed to auth.uid() (migration 0012).
 */
export async function getOwnProfile(): Promise<{
  displayName: string;
  birthYear: number;
  gender: "M" | "W";
  email: string | null;
} | null> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  const [{ data: p }, { data: email }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, birth_year, gender")
      .eq("id", uid)
      .maybeSingle(),
    supabase.rpc("get_own_email"),
  ]);
  if (!p) return null;
  return {
    displayName: (p as any).display_name,
    birthYear: (p as any).birth_year,
    gender: (p as any).gender,
    email: (email as string | null) ?? null,
  };
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
export function devBuildPorts(): OnboardingPorts {
  return {
    signIn: signInAnonymously,
    hasAccount: async () => (await getOwnProfile()) !== null,
    saveProfile,
    requestLocation: async () => true,
    requestNfc: async () => true,
    requestBatteryExemption: async () => true,
  };
}
