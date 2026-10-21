-- Rutas subidas con GPX: perfil de altitud, archivo original y trazo como GeoJSON.

-- [km, altitud m, lng, lat] por punto, unos 200 por ruta: alcanza para la gráfica y para ubicar el punto en el mapa
alter table public.routes
  add column elevation_profile jsonb check (elevation_profile is null or jsonb_typeof(elevation_profile) = 'array'),
  add column gpx_path text;  -- ruta dentro del bucket route-tracks (<user_id>/<archivo>.gpx)

-- /rutas/nueva es la página para subir rutas: ninguna ruta puede llamarse así
alter table public.routes
  add constraint routes_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug <> 'nueva');

-- El trazo pesa decenas de KB: va aparte de routes_feed, que se lee completo en el mapa.
-- security_invoker: aplica el RLS de routes (publicadas para todos, las mías en revisión para mí).
create view public.route_shapes with (security_invoker = true) as
select
  r.id,
  r.slug,
  extensions.st_asgeojson(r.track, 5)::jsonb as track,
  r.elevation_profile,
  r.gpx_path
from public.routes r
where r.track is not null;

grant select on public.route_shapes to anon, authenticated;
