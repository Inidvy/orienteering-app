-- PostgREST returns geography columns as WKB hex; the verification function
-- needs plain numbers. security_invoker so the views respect RLS.

create view flag_coords with (security_invoker = true) as
select id as flag_id,
       st_y(position::geometry) as lat,
       st_x(position::geometry) as lon
from flags;

create view track_coords with (security_invoker = true) as
select t.run_id,
       st_x(p.geom) as lon,
       st_y(p.geom) as lat,
       st_m(p.geom) as m
from tracks t,
     lateral st_dumppoints(t.geom::geometry) p;

grant select on flag_coords to authenticated, service_role;
grant select on track_coords to authenticated, service_role;
