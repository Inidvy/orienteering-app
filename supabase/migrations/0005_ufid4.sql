-- UFID is the flag's code again, shortened to 4 letters (simple enough: ~280k
-- combinations from the 23-letter alphabet). A flag has no inherent number —
-- its course-order number is assigned per course. short_code defaults to the
-- UFID so the NOT NULL/UNIQUE constraint is satisfied without the admin typing
-- anything.

create or replace function gen_ufid() returns text
language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPRSTUVWXYZ', (floor(random() * 23) + 1)::int, 1), '')
  from generate_series(1, 4);
$$;

-- fill ufid (collision-retry) and short_code on insert
create or replace function flags_defaults() returns trigger
language plpgsql as $$
begin
  if new.ufid is null then
    loop
      new.ufid := gen_ufid();
      exit when not exists (select 1 from flags where ufid = new.ufid);
    end loop;
  end if;
  if new.short_code is null then new.short_code := new.ufid; end if;
  return new;
end $$;

drop trigger if exists trg_flags_defaults on flags;
create trigger trg_flags_defaults before insert on flags
  for each row execute function flags_defaults();

-- regenerate existing 6-letter ufids to 4 letters
do $$
declare r record; u text;
begin
  for r in select id from flags loop
    loop
      u := gen_ufid();
      begin
        update flags set ufid = u where id = r.id;
        exit;
      exception when unique_violation then
      end;
    end loop;
  end loop;
end $$;
