-- Moderación de rutas: cola de revisión, edición de la ruta propia y sugerencias de corrección.

-- ---------------------------------------------------------------------------
-- Moderadores. Tabla aparte de profiles: el perfil lo edita su dueño.
-- Sin políticas: no se lee por la API; se consulta con is_admin().
-- Alta: insert into public.admins (user_id) select id from auth.users where email = '…';
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.admins enable row level security;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Rutas: resultado de la revisión y reglas de edición
-- ---------------------------------------------------------------------------

alter table public.routes
  add column review_note text check (review_note is null or char_length(review_note) <= 1000),
  add column reviewed_at timestamptz;

create policy "moderación ve todas las rutas" on public.routes
  for select to authenticated using ((select public.is_admin()));
create policy "moderación edita rutas" on public.routes
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- quien la subió la edita en cualquier estado; el trigger decide qué puede cambiar
drop policy "editar mi ruta en revisión" on public.routes;
create policy "editar mi ruta" on public.routes
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create function public.guard_route_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'No se puede cambiar quién subió la ruta' using errcode = 'check_violation';
  end if;

  -- sin usuario es el editor SQL o la service role; anon no tiene permiso de update
  if (select auth.uid()) is null or public.is_admin() then
    if new.status is distinct from old.status then
      new.reviewed_at := now();
    end if;
    return new;
  end if;

  if new.review_note is distinct from old.review_note or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Solo la moderación revisa rutas' using errcode = 'check_violation';
  end if;

  if old.status = 'publicada' then
    -- ya está en el mapa con su URL y quizá con salidas: el trazo y la dirección no cambian
    if new.status <> 'publicada' then
      raise exception 'Una ruta publicada no puede cambiar de estado' using errcode = 'check_violation';
    end if;
    if new.slug <> old.slug
      or new.distance_km <> old.distance_km
      or new.elevation_gain_m <> old.elevation_gain_m
      or new.gpx_path is distinct from old.gpx_path
      or new.elevation_profile is distinct from old.elevation_profile
      or extensions.st_asbinary(new.start_point) <> extensions.st_asbinary(old.start_point)
      or extensions.st_asbinary(new.track) is distinct from extensions.st_asbinary(old.track) then
      raise exception 'El trazo de una ruta publicada no se puede cambiar' using errcode = 'check_violation';
    end if;
  else
    if new.status = 'publicada' then
      raise exception 'Solo la moderación publica rutas' using errcode = 'check_violation';
    end if;
    -- corregir una ruta rechazada la manda de nuevo a revisión
    new.status := 'revision';
  end if;
  return new;
end $$;

create trigger routes_guard_update
  before update on public.routes
  for each row execute function public.guard_route_update();

-- created_by al final: el detalle muestra "Editar" a quien la subió (los perfiles ya son públicos)
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
  r.description,
  r.created_by
from public.routes r
where r.status = 'publicada';

-- ---------------------------------------------------------------------------
-- Sugerencias de corrección a rutas publicadas
-- ---------------------------------------------------------------------------

create table public.route_suggestions (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.routes (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  message      text not null check (char_length(message) between 10 and 1000),
  status       text not null default 'abierta' check (status in ('abierta', 'resuelta')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index route_suggestions_open_idx on public.route_suggestions (created_at) where status = 'abierta';
create index route_suggestions_route_idx on public.route_suggestions (route_id);
create index route_suggestions_user_idx on public.route_suggestions (user_id);

alter table public.route_suggestions enable row level security;

create policy "sugerir a una ruta publicada" on public.route_suggestions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'abierta'
    and exists (select 1 from public.routes r where r.id = route_id and r.status = 'publicada')
  );
create policy "mis sugerencias o moderación" on public.route_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "moderación resuelve sugerencias" on public.route_suggestions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, insert on public.route_suggestions to authenticated;
grant update (status, resolved_at) on public.route_suggestions to authenticated;
grant all on public.route_suggestions, public.admins to service_role;
