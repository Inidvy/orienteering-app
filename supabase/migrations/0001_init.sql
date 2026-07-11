-- Orienteering platform v1 schema.
-- Write authority (design decision 1A): clients INSERT raw sync payloads into
-- their own rows only. All derived truth (punch validation, leg/run statuses,
-- leg_splits) is computed exclusively by the verification edge function using
-- the service role. Status columns have NO client UPDATE grants.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Profiles (classes need birth year + gender from first signup, P7-D13-A)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  birth_year int not null check (birth_year between 1900 and 2100),
  gender text not null check (gender in ('M', 'W')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Flags & tags (registry + lifecycle, D15.1: replacing a tag writes a new
-- tags row pointing at the same flag; punches reference the flag via the tag)
-- ---------------------------------------------------------------------------
create table flags (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,          -- human-readable number on the plate
  position geography (point) not null,
  photo_url text,                            -- helps runners find it (D15.1)
  created_at timestamptz not null default now()
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references flags (id),
  uid text not null unique,                  -- NFC chip UID (NTAG 213 in v1)
  -- 424 upgrade slot (D20-C): key reference lands here post-v1
  key_ref text,
  provisioned_at timestamptz not null default now(),
  retired_at timestamptz                     -- set when replaced/vandalized
);

create table flag_reports (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references flags (id),
  reporter uuid not null references profiles (id),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Courses (ordered flag list; bearing-assist intentionally absent — P7-D12)
-- ---------------------------------------------------------------------------
create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  length_m int,
  created_at timestamptz not null default now()
);

create table course_flags (
  course_id uuid not null references courses (id) on delete cascade,
  flag_id uuid not null references flags (id),
  position int not null,                     -- 0 = start, max = finish
  primary key (course_id, position)
);

-- ---------------------------------------------------------------------------
-- Versioned tuning config (D22-A: statuses are re-runnable on config change)
-- ---------------------------------------------------------------------------
create table tuning_configs (
  version int primary key,
  proximity_tolerance_m numeric not null,
  speed_ceiling_mps numeric not null,
  max_track_gap_s numeric not null,
  speed_window_s numeric not null,
  punch_track_tolerance_s numeric not null,
  created_at timestamptz not null default now()
);

insert into tuning_configs
  (version, proximity_tolerance_m, speed_ceiling_mps, max_track_gap_s,
   speed_window_s, punch_track_tolerance_s)
values (1, 35, 8, 30, 10, 60);

-- ---------------------------------------------------------------------------
-- Runs, punches, tracks (client-inserted raw data; UUIDs are client-generated
-- for sync idempotency, decision 2A)
-- ---------------------------------------------------------------------------
create table runs (
  id uuid primary key,                       -- client-generated (idempotent upsert)
  runner uuid not null references profiles (id),
  course_id uuid not null references courses (id),
  started_wall_guess timestamptz,            -- informational only, never trusted
  pre_run_anchor timestamptz,                -- last server-time anchor before run
  sync_anchor timestamptz,                   -- server time at sync (server-set)
  clock_basis_lost boolean not null default false,
  dnf boolean not null default false,
  -- server-computed (service role only):
  status text check (status in ('verified', 'partial', 'unverified')),
  status_reasons text[],
  total_time_ms bigint,
  config_version int references tuning_configs (version),
  created_at timestamptz not null default now()
);

create table punches (
  id uuid primary key,                       -- client-generated
  run_id uuid not null references runs (id) on delete cascade,
  tag_uid text not null,
  method text not null check (method in ('nfc', 'qr', 'manual')),
  t_monotonic_ms bigint not null,
  validation_payload text,                   -- 424 SUN message slot (D20-C)
  -- server-computed:
  validated boolean,
  flag_id uuid references flags (id)
);

create table tracks (
  run_id uuid primary key references runs (id) on delete cascade,
  -- LINESTRING M: lon/lat + monotonic ms as the M coordinate
  geom geography (linestringm) not null
);

create table leg_splits (
  run_id uuid not null references runs (id) on delete cascade,
  leg_index int not null,
  leg_time_ms bigint,
  status text not null check (status in ('verified', 'partial', 'unverified')),
  status_reasons text[],
  config_version int not null references tuning_configs (version),
  primary key (run_id, leg_index)
);

-- Leaderboard query indexes (eng-review performance watch-item)
create index idx_leg_splits_course on leg_splits (run_id, leg_index, status);
create index idx_runs_course_status on runs (course_id, status, total_time_ms);
create index idx_punches_run on punches (run_id);
create index idx_tags_uid on tags (uid);

-- ---------------------------------------------------------------------------
-- RLS: the write-authority boundary
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table flags enable row level security;
alter table tags enable row level security;
alter table flag_reports enable row level security;
alter table courses enable row level security;
alter table course_flags enable row level security;
alter table tuning_configs enable row level security;
alter table runs enable row level security;
alter table punches enable row level security;
alter table tracks enable row level security;
alter table leg_splits enable row level security;

-- Everyone (authed) reads public data
create policy read_flags on flags for select to authenticated using (true);
create policy read_tags on tags for select to authenticated using (true);
create policy read_courses on courses for select to authenticated using (true);
create policy read_course_flags on course_flags for select to authenticated using (true);
create policy read_configs on tuning_configs for select to authenticated using (true);
create policy read_runs on runs for select to authenticated using (true);
create policy read_splits on leg_splits for select to authenticated using (true);
create policy read_profiles on profiles for select to authenticated using (true);

-- Own profile
create policy insert_own_profile on profiles for insert to authenticated
  with check (id = auth.uid());
create policy update_own_profile on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Raw sync payloads: INSERT into own rows only. No client UPDATE policies on
-- runs/punches/leg_splits => status columns are immutable to client tokens.
create policy insert_own_runs on runs for insert to authenticated
  with check (runner = auth.uid());
create policy insert_own_punches on punches for insert to authenticated
  with check (exists (select 1 from runs r where r.id = run_id and r.runner = auth.uid()));
create policy insert_own_tracks on tracks for insert to authenticated
  with check (exists (select 1 from runs r where r.id = run_id and r.runner = auth.uid()));

-- Missing-flag reports: any authed runner may file; only service role resolves
create policy insert_reports on flag_reports for insert to authenticated
  with check (reporter = auth.uid());
create policy read_reports on flag_reports for select to authenticated using (true);

-- leg_splits: no client INSERT/UPDATE at all — service role only (default deny)
