-- brecha — esquema inicial: rutas de hiking, salidas en grupo e inscritos.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Perfiles (uno por usuario de Auth; se crea solo al registrarse)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Rutas
-- ---------------------------------------------------------------------------

create type public.difficulty as enum ('facil', 'moderada', 'dificil', 'experto');

create table public.routes (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  activity          text not null default 'hiking' check (activity in ('hiking', 'bici', 'offroad')),
  name              text not null,
  place_label       text not null,                 -- "Tepoztlán, Mor."
  description       text,
  difficulty        public.difficulty not null,
  route_type        text not null default 'ida_vuelta' check (route_type in ('ida_vuelta', 'circular', 'solo_ida')),
  distance_km       numeric(5, 1) not null check (distance_km > 0),
  elevation_gain_m  integer not null check (elevation_gain_m >= 0),
  duration_min      integer not null check (duration_min > 0),
  start_point       extensions.geography(Point, 4326) not null,
  track             extensions.geography(LineString, 4326),
  cover_url         text,
  tags              text[] not null default '{}',
  -- lo que sube la comunidad entra en revisión; solo lo publicado aparece en el mapa
  status            text not null default 'revision' check (status in ('revision', 'publicada', 'rechazada')),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index routes_start_point_gix on public.routes using gist (start_point);
create index routes_status_idx on public.routes (status, activity);
create index routes_created_by_idx on public.routes (created_by);

create trigger routes_updated_at
  before update on public.routes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Salidas (convocatorias a una ruta en una fecha) e inscritos
-- ---------------------------------------------------------------------------

create table public.outings (
  id                   uuid primary key default gen_random_uuid(),
  route_id             uuid not null references public.routes (id) on delete cascade,
  organizer_id         uuid not null references public.profiles (id) on delete cascade,
  title                text not null,
  starts_at            timestamptz not null,
  meeting_point_label  text not null,             -- "Metro Universidad, salida C"
  meeting_point        extensions.geography(Point, 4326),
  capacity             integer not null check (capacity between 2 and 100),
  level                text not null default 'intermedio' check (level in ('principiante', 'intermedio', 'avanzado')),
  pace                 text not null default 'moderado' check (pace in ('relajado', 'moderado', 'rapido')),
  notes                text,
  status               text not null default 'abierta' check (status in ('abierta', 'cancelada')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index outings_route_starts_idx on public.outings (route_id, starts_at);
create index outings_open_starts_idx on public.outings (starts_at) where status = 'abierta';
create index outings_organizer_idx on public.outings (organizer_id);

create trigger outings_updated_at
  before update on public.outings
  for each row execute function public.set_updated_at();

create table public.outing_members (
  outing_id  uuid not null references public.outings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (outing_id, user_id)
);
create index outing_members_user_idx on public.outing_members (user_id);

-- Cupo: se bloquea la fila de la salida para que dos personas no tomen el último lugar a la vez.
-- security definer porque el FOR UPDATE pide permiso de escritura sobre outings.
create or replace function public.check_outing_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_capacity  integer;
  v_status    text;
  v_starts_at timestamptz;
  v_taken     integer;
begin
  select capacity, status, starts_at into v_capacity, v_status, v_starts_at
  from public.outings where id = new.outing_id for update;

  if v_status <> 'abierta' or v_starts_at <= now() then
    raise exception 'La salida ya no acepta inscripciones' using errcode = 'check_violation';
  end if;

  select count(*) into v_taken from public.outing_members where outing_id = new.outing_id;
  if v_taken >= v_capacity then
    raise exception 'La salida ya está llena' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger outing_members_capacity
  before insert on public.outing_members
  for each row execute function public.check_outing_capacity();

-- Quien convoca ocupa el primer lugar.
create or replace function public.join_organizer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outing_members (outing_id, user_id) values (new.id, new.organizer_id);
  return new;
end $$;

create trigger outings_join_organizer
  after insert on public.outings
  for each row execute function public.join_organizer();

-- ---------------------------------------------------------------------------
-- Vista del mapa: rutas publicadas con coordenadas y salidas próximas
-- ---------------------------------------------------------------------------

create view public.routes_feed with (security_invoker = true) as
select
  r.id, r.slug, r.activity, r.name, r.place_label, r.difficulty, r.route_type,
  r.distance_km, r.elevation_gain_m, r.duration_min, r.cover_url, r.tags,
  extensions.st_y(r.start_point::extensions.geometry) as lat,
  extensions.st_x(r.start_point::extensions.geometry) as lng,
  (
    select count(*)::integer from public.outings o
    where o.route_id = r.id and o.status = 'abierta' and o.starts_at > now()
  ) as upcoming_outings
from public.routes r
where r.status = 'publicada';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.outings enable row level security;
alter table public.outing_members enable row level security;

create policy "perfiles visibles" on public.profiles
  for select to anon, authenticated using (true);
create policy "editar mi perfil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "rutas publicadas o mías" on public.routes
  for select to anon, authenticated
  using (status = 'publicada' or created_by = (select auth.uid()));
create policy "subir ruta a revisión" on public.routes
  for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'revision');
create policy "editar mi ruta en revisión" on public.routes
  for update to authenticated
  using (created_by = (select auth.uid()) and status = 'revision')
  with check (created_by = (select auth.uid()) and status = 'revision');

create policy "salidas visibles" on public.outings
  for select to anon, authenticated using (true);
create policy "convocar a una ruta publicada" on public.outings
  for insert to authenticated
  with check (
    organizer_id = (select auth.uid())
    and exists (select 1 from public.routes r where r.id = route_id and r.status = 'publicada')
  );
create policy "editar mi salida" on public.outings
  for update to authenticated
  using (organizer_id = (select auth.uid())) with check (organizer_id = (select auth.uid()));
create policy "borrar mi salida" on public.outings
  for delete to authenticated using (organizer_id = (select auth.uid()));

create policy "inscritos visibles" on public.outing_members
  for select to anon, authenticated using (true);
create policy "unirme" on public.outing_members
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "salirme" on public.outing_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Privilegios explícitos: la CLI reciente ya no los da por defecto sobre tablas nuevas; RLS sigue mandando.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.routes, public.outings, public.outing_members, public.routes_feed
  to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert, update on public.routes to authenticated;
grant insert, update, delete on public.outings to authenticated;
grant insert, delete on public.outing_members to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.check_outing_capacity() from anon, authenticated;
revoke execute on function public.join_organizer() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: fotos y tracks públicos; cada quien sube solo a su carpeta (<user_id>/...)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('route-photos', 'route-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('route-tracks', 'route-tracks', true, 5242880,
   array['application/gpx+xml', 'application/vnd.google-earth.kml+xml', 'application/xml', 'text/xml', 'application/octet-stream'])
on conflict (id) do nothing;

create policy "subir a mi carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('route-photos', 'route-tracks')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "borrar lo que subí" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('route-photos', 'route-tracks')
    and owner_id = (select auth.uid())::text
  );
