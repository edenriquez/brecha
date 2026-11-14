-- Anotaciones que quien subió una ruta le deja al trazo: tracción "desde aquí" y avisos en un punto.
-- Toda anotación es un punto del trazo (km acumulado + coordenadas). Los tramos de tracción no se guardan:
-- cada marca vale hasta la siguiente o el final, y la app los deriva.

create table public.route_annotations (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes (id) on delete cascade,
  kind        text not null check (kind in ('traccion', 'obstruccion', 'lodo_agua', 'paso_dificil', 'chicken_line', 'comentario')),
  traction    text check (traction in ('normal', '4h', '4l')),
  km          numeric(5, 2) not null check (km >= 0),
  lng         double precision not null check (lng between -180 and 180),
  lat         double precision not null check (lat between -90 and 90),
  note        text check (char_length(note) between 1 and 280),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((kind = 'traccion') = (traction is not null)),
  check (kind <> 'comentario' or note is not null)
);
-- una sola marca de tracción por punto
create unique index route_annotations_traction_km on public.route_annotations (route_id, km) where kind = 'traccion';
create index route_annotations_route_idx on public.route_annotations (route_id, km);

create trigger route_annotations_updated_at
  before update on public.route_annotations
  for each row execute function public.set_updated_at();

alter table public.route_annotations enable row level security;

-- quien puede ver la ruta ve sus anotaciones: el RLS de routes ya resuelve publicada / mía / moderación
create policy "anotaciones de rutas visibles" on public.route_annotations
  for select to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id));
create policy "anotar mi ruta o moderar" on public.route_annotations
  for insert to authenticated
  with check (exists (select 1 from public.routes r where r.id = route_id and (r.created_by = (select auth.uid()) or (select public.is_admin()))));
create policy "editar anotaciones de mi ruta o moderar" on public.route_annotations
  for update to authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and (r.created_by = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.routes r where r.id = route_id and (r.created_by = (select auth.uid()) or (select public.is_admin()))));
create policy "borrar anotaciones de mi ruta o moderar" on public.route_annotations
  for delete to authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and (r.created_by = (select auth.uid()) or (select public.is_admin()))));

create policy "suspendida: no anota" on public.route_annotations as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no edita anotaciones" on public.route_annotations as restrictive
  for update to authenticated using (not (select public.is_suspended()));

grant select on public.route_annotations to anon, authenticated;
grant insert (route_id, kind, traction, km, lng, lat, note), update (kind, traction, km, lng, lat, note), delete on public.route_annotations to authenticated;
grant all on public.route_annotations to service_role;
