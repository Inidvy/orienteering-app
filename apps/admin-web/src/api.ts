import { supabase, type Course, type FlagCoord, type Report } from "./supabase";

export async function listFlags(): Promise<
  { id: string; short_code: string; ufid: string; lat: number; lon: number; photo_url: string | null }[]
> {
  // flags (id, short_code, ufid, photo_url) joined to flag_coords (lat, lon)
  const [{ data: flags, error: e1 }, { data: coords, error: e2 }] = await Promise.all([
    supabase.from("flags").select("id, short_code, ufid, photo_url"),
    supabase.from("flag_coords").select("flag_id, lat, lon"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byId = new Map((coords as FlagCoord[]).map((c) => [c.flag_id, c]));
  return (flags ?? []).map((f: any) => ({
    ...f,
    lat: Number(byId.get(f.id)?.lat ?? 0),
    lon: Number(byId.get(f.id)?.lon ?? 0),
  }));
}

export async function createFlag(
  lat: number,
  lon: number,
  photoUrl?: string,
): Promise<{ id: string; ufid: string }> {
  // no number to type: the DB trigger assigns the 4-letter UFID and sets
  // short_code = ufid
  const { data, error } = await supabase
    .from("flags")
    .insert({ position: `POINT(${lon} ${lat})`, photo_url: photoUrl ?? null })
    .select("id, ufid")
    .single();
  if (error) throw error;
  return data as { id: string; ufid: string };
}

export async function deleteFlag(id: string): Promise<void> {
  // remove admin references first (tags, course memberships), then the flag.
  // Fails if the flag has recorded runs — you don't delete a flag people ran.
  await supabase.from("course_flags").delete().eq("flag_id", id);
  await supabase.from("tags").delete().eq("flag_id", id);
  const { error } = await supabase.from("flags").delete().eq("id", id);
  if (error) throw error;
}

export async function listCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, length_m")
    .order("name");
  if (error) throw error;
  return data as Course[];
}

export async function createCourse(
  name: string,
  flagIdsInOrder: string[],
): Promise<string> {
  const { data: course, error } = await supabase
    .from("courses")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw error;
  const rows = flagIdsInOrder.map((flag_id, position) => ({
    course_id: course.id,
    flag_id,
    position,
  }));
  const { error: e2 } = await supabase.from("course_flags").insert(rows);
  if (e2) throw e2;
  return course.id;
}

export async function listReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from("flag_reports")
    .select("id, flag_id, note, created_at, resolved_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Report[];
}

export async function resolveReport(id: string): Promise<void> {
  const { error } = await supabase
    .from("flag_reports")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
