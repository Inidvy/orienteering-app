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

/** flag_id -> names of every course that uses it (butterfly = still one name) */
export async function listFlagUsage(): Promise<Record<string, string[]>> {
  const [{ data: cf, error: e1 }, { data: courses, error: e2 }] = await Promise.all([
    supabase.from("course_flags").select("flag_id, course_id"),
    supabase.from("courses").select("id, name"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const nameById = new Map((courses ?? []).map((c: any) => [c.id, c.name]));
  const usage: Record<string, string[]> = {};
  for (const row of (cf ?? []) as { flag_id: string; course_id: string }[]) {
    const name = nameById.get(row.course_id) ?? "?";
    (usage[row.flag_id] ??= []);
    if (!usage[row.flag_id].includes(name)) usage[row.flag_id].push(name);
  }
  return usage;
}

export async function deleteFlag(id: string): Promise<void> {
  // A flag that belongs to a course must NOT be deleted — that would silently
  // break the course. Block here (backstop; the UI blocks first with names) and
  // list the courses so the message is actionable.
  const usage = await listFlagUsage();
  const inCourses = usage[id];
  if (inCourses?.length) {
    throw new Error(`Used in ${inCourses.join(", ")} — remove it from those courses first.`);
  }
  await supabase.from("tags").delete().eq("flag_id", id);
  // Fails if the flag has recorded runs — you don't delete a flag people ran.
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

export async function deleteCourse(id: string): Promise<void> {
  // course_flags rows cascade away (FK ON DELETE CASCADE); the flags themselves
  // stay. Fails if runs were recorded on this course (runs.course_id has no
  // cascade) — a course people ran isn't silently erased.
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) throw error;
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
