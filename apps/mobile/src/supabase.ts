// Supabase client. The publishable key is the PUBLIC client key (RLS is the
// security boundary, decision 1A) — safe to ship in the app bundle.
// Session persists in AsyncStorage: with anonymous auth (no email login) a
// lost session would be a lost account, so persistence is part of the trust
// story, not a convenience. Setup follows the Supabase React Native docs
// (storage adapter + AppState-driven token autorefresh).
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://chqsntkriusxcbjxoqik.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vrN6tj-6GWR5QtR5jzB-7g_Qoo86sOu";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// refresh tokens only while the app is foregrounded (Supabase RN pattern)
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
