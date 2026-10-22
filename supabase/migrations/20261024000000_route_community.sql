-- Lo que la comunidad aporta a una ruta publicada: fotos y reportes de cómo está el sendero.
-- user_id sale de auth.uid() por default y no está en los grants de insert: nadie publica a nombre de otro.

-- ---------------------------------------------------------------------------
-- Fotos
-- ---------------------------------------------------------------------------

create table public.route_photos (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- <user_id>/<uuid>.jpg en el bucket route-photos; el navegador la reduce y la vuelve JPEG (sin EXIF ni ubicación)
  path        text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  caption     text check (char_length(caption) <= 140),
  width       integer not null check (width between 1 and 4000),
  height      integer not null check (height between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index route_photos_route_idx on public.route_photos (route_id, created_at desc);
create index route_photos_user_idx on public.route_photos (user_id);

alter table public.route_photos enable row level security;

create policy "fotos de rutas publicadas" on public.route_photos
  for select to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and r.status = 'publicada'));
create policy "subir fotos a una ruta publicada" on public.route_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and split_part(path, '/', 1) = (select auth.uid())::text
    and exists (select 1 from public.routes r where r.id = route_id and r.status = 'publicada')
  );
create policy "borrar mi foto o moderar" on public.route_photos
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create or replace function public.limit_route_photos()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.route_photos where route_id = new.route_id and user_id = new.user_id) >= 12 then
    raise exception 'Ya subiste 12 fotos a esta ruta' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function public.limit_route_photos() from public, anon, authenticated;

create trigger route_photos_limit
  before insert on public.route_photos
  for each row execute function public.limit_route_photos();

-- ---------------------------------------------------------------------------
-- Condiciones del sendero
-- ---------------------------------------------------------------------------

create table public.trail_reports (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  visited_on  date not null,
  status      text not null check (status in ('bien', 'precaucion', 'cerrada')),
  issues      text[] not null default '{}'
              check (issues <@ array['lodo', 'agua', 'obstaculos', 'senalizacion', 'acceso', 'cobro', 'basura', 'concurrido', 'inseguridad']),
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  -- un reporte por persona y día de visita
  unique (route_id, user_id, visited_on)
);
create index trail_reports_route_idx on public.trail_reports (route_id, visited_on desc);
create index trail_reports_user_idx on public.trail_reports (user_id);

alter table public.trail_reports enable row level security;

create policy "reportes de rutas publicadas" on public.trail_reports
  for select to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id and r.status = 'publicada'));
-- la visita es de los últimos 60 días, en fecha de CDMX
create policy "reportar una ruta publicada" on public.trail_reports
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and visited_on <= (now() at time zone 'America/Mexico_City')::date
    and visited_on >= (now() at time zone 'America/Mexico_City')::date - 60
    and exists (select 1 from public.routes r where r.id = route_id and r.status = 'publicada')
  );
create policy "borrar mi reporte o moderar" on public.trail_reports
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: remove() busca el objeto antes de borrarlo, así que "borrar lo que subí" necesita poder verlo.
-- Las lecturas públicas de los buckets no pasan por estas políticas.
-- ---------------------------------------------------------------------------

create policy "ver lo que subí" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('route-photos', 'route-tracks')
    and owner_id = (select auth.uid())::text
  );

create policy "moderar fotos: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'route-photos' and (select public.is_admin()));

create policy "moderar fotos: borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'route-photos' and (select public.is_admin()));

grant select on public.route_photos, public.trail_reports to anon, authenticated;
grant insert (route_id, path, caption, width, height), delete on public.route_photos to authenticated;
grant insert (route_id, visited_on, status, issues, note), delete on public.trail_reports to authenticated;
grant all on public.route_photos, public.trail_reports to service_role;
