-- El detalle de ruta lee la descripción desde la misma vista que el mapa.
-- create or replace view solo permite agregar columnas al final.
create or replace view public.routes_feed with (security_invoker = true) as
select
  r.id, r.slug, r.activity, r.name, r.place_label, r.difficulty, r.route_type,
  r.distance_km, r.elevation_gain_m, r.duration_min, r.cover_url, r.tags,
  extensions.st_y(r.start_point::extensions.geometry) as lat,
  extensions.st_x(r.start_point::extensions.geometry) as lng,
  (
    select count(*)::integer from public.outings o
    where o.route_id = r.id and o.status = 'abierta' and o.starts_at > now()
  ) as upcoming_outings,
  r.description
from public.routes r
where r.status = 'publicada';
