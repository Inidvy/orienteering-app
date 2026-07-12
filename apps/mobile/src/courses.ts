// Load real courses + flags from the live database (created in the admin).
// This is what makes admin courses show up in the app.
import { supabase } from "./supabase";
import type { CourseSpec } from "@orienteering/run-engine";
import type { CoursePin } from "./screens/CourseMapPicker";

interface FlagRow {
  id: string;
  short_code: string;
  ufid: string;
  lat: number;
  lon: number;
}

async function loadFlags(): Promise<Map<string, FlagRow>> {
  const [{ data: flags }, { data: coords }] = await Promise.all([
    supabase.from("flags").select("id, short_code, ufid"),
    supabase.from("flag_coords").select("flag_id, lat, lon"),
  ]);
  const byId = new Map<string, { lat: number; lon: number }>();
  for (const c of coords ?? []) byId.set((c as any).flag_id, {
    lat: Number((c as any).lat),
    lon: Number((c as any).lon),
  });
  const m = new Map<string, FlagRow>();
  for (const f of flags ?? []) {
    const c = byId.get((f as any).id);
    if (!c) continue;
    m.set((f as any).id, { id: (f as any).id, short_code: (f as any).short_code, ufid: (f as any).ufid, ...c });
  }
  return m;
}

export async function loadCoursePins(): Promise<CoursePin[]> {
  const flags = await loadFlags();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, length_m")
    .order("name");
  const pins: CoursePin[] = [];
  for (const c of courses ?? []) {
    const { data: cf } = await supabase
      .from("course_flags")
      .select("flag_id, position")
      .eq("course_id", (c as any).id)
      .order("position");
    const order = (cf ?? []).map((r: any) => r.flag_id).filter((id: string) => flags.has(id));
    if (order.length < 2) continue;
    const flagPositions: CourseSpec["flagPositions"] = {};
    const shortCodes: CourseSpec["shortCodes"] = {};
    const ufids: NonNullable<CourseSpec["ufids"]> = {};
    for (const id of order) {
      const f = flags.get(id)!;
      flagPositions[id] = { lat: f.lat, lon: f.lon };
      shortCodes[id] = f.short_code;
      ufids[id] = f.ufid;
    }
    const spec: CourseSpec = {
      id: (c as any).id,
      flagOrder: order,
      flagPositions,
      shortCodes,
      ufids,
    };
    const startId = order[0]!;
    pins.push({
      spec,
      name: (c as any).name,
      lengthM: (c as any).length_m ?? 0,
      difficulty: "Medium",
      start: flagPositions[startId]!,
    });
  }
  return pins;
}
