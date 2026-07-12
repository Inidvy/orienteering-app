// Supabase client. The publishable key is the PUBLIC client key (RLS is the
// security boundary, decision 1A) — safe to ship in the app bundle.
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://chqsntkriusxcbjxoqik.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_vrN6tj-6GWR5QtR5jzB-7g_Qoo86sOu";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // React Native: session persistence wires to AsyncStorage in the dev
    // build; in-memory is fine for the demo shell.
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
