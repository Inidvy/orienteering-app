-- Public flag identifier (UFID): 6 uppercase letters printed on the plate and
-- encoded in the QR code as https://ol-ka.de/f/<UFID>. Separate from the short
-- numeric code (human entry) and the NFC chip UID (cryptographic punch).
-- Alphabet excludes I/O/Q to avoid confusion when typed.

create or replace function gen_ufid() returns text
language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPRSTUVWXYZ', (floor(random() * 23) + 1)::int, 1), '')
  from generate_series(1, 6);
$$;

alter table flags add column if not exists ufid text;

-- backfill existing flags, retrying on the (rare) unique collision
do $$
declare r record; u text;
begin
  for r in select id from flags where ufid is null loop
    loop
      u := gen_ufid();
      begin
        update flags set ufid = u where id = r.id;
        exit;
      exception when unique_violation then
        -- try another
      end;
    end loop;
  end loop;
end $$;

alter table flags alter column ufid set default gen_ufid();
alter table flags alter column ufid set not null;
create unique index if not exists idx_flags_ufid on flags (ufid);
