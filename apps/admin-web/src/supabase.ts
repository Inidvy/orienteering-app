import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://chqsntkriusxcbjxoqik.supabase.co",
  "sb_publishable_vrN6tj-6GWR5QtR5jzB-7g_Qoo86sOu",
);

export interface Flag {
  id: string;
  short_code: string;
  ufid: string;
  position: any; // GeoJSON point via PostGIS
  photo_url: string | null;
}
export interface FlagCoord { flag_id: string; lat: number; lon: number }
export interface Course { id: string; name: string; length_m: number | null }
export interface Report {
  id: string; flag_id: string; note: string | null;
  created_at: string; resolved_at: string | null;
}
