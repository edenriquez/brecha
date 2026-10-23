-- Seguridad: suspensiones, reportes de contenido, contacto de emergencia y lo que la moderación necesita para actuar.

-- ---------------------------------------------------------------------------
-- Suspensiones. Tabla aparte de profiles para que no sean públicas.
-- ---------------------------------------------------------------------------

create table public.user_suspensions (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  until       timestamptz,                         -- null: hasta que la moderación la levante
  reason      text not null check (char_length(reason) between 5 and 500),
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.user_suspensions enable row level security;

create policy "mi suspensión o moderación" on public.user_suspensions
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "moderación suspende" on public.user_suspensions
  for insert to authenticated with check ((select public.is_admin()) and user_id <> (select auth.uid()));
create policy "moderación cambia suspensiones" on public.user_suspensions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()) and user_id <> (select auth.uid()));
create policy "moderación levanta suspensiones" on public.user_suspensions
  for delete to authenticated using ((select public.is_admin()));

grant select, delete on public.user_suspensions to authenticated;
grant insert (user_id, until, reason) on public.user_suspensions to authenticated;
grant update (until, reason) on public.user_suspensions to authenticated;
grant all on public.user_suspensions to service_role;

create function public.is_suspended()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_suspensions
    where user_id = (select auth.uid()) and (until is null or until > now())
  );
$$;
revoke execute on function public.is_suspended() from public, anon;
grant execute on function public.is_suspended() to authenticated;

-- Restrictivas: se suman (AND) a las políticas de cada tabla. Salirse de una salida o borrar lo propio sigue permitido.
create policy "suspendida: no sube rutas" on public.routes as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no edita rutas" on public.routes as restrictive
  for update to authenticated using (not (select public.is_suspended()));
create policy "suspendida: no convoca" on public.outings as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no edita salidas" on public.outings as restrictive
  for update to authenticated using (not (select public.is_suspended()));
create policy "suspendida: no se une" on public.outing_members as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no sube fotos" on public.route_photos as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no reporta senderos" on public.trail_reports as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no sugiere" on public.route_suggestions as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no edita su perfil" on public.profiles as restrictive
  for update to authenticated using (not (select public.is_suspended()));

-- ---------------------------------------------------------------------------
-- La moderación cancela salidas y limpia perfiles (las columnas editables ya están acotadas por los grants)
-- ---------------------------------------------------------------------------

create policy "moderación cancela salidas" on public.outings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "moderación limpia perfiles" on public.profiles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "moderar avatares: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (select public.is_admin()));
create policy "moderar avatares: borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Reportes de contenido
-- ---------------------------------------------------------------------------

create table public.content_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('perfil', 'salida', 'foto', 'reporte')),
  target_id    uuid not null,
  reason       text not null check (reason in ('spam', 'acoso', 'peligro', 'falso', 'suplantacion', 'otro')),
  details      text check (char_length(details) <= 500),
  status       text not null default 'abierto' check (status in ('abierto', 'resuelto', 'descartado')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null
);
create unique index content_reports_open_once on public.content_reports (reporter_id, target_type, target_id) where status = 'abierto';
create index content_reports_open_idx on public.content_reports (created_at) where status = 'abierto';
create index content_reports_target_idx on public.content_reports (target_type, target_id);

-- Corre con los permisos de quien reporta: todo lo que se puede reportar es público y sus propios reportes los puede contar.
create function public.check_content_report()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_owner uuid;
begin
  v_owner := case new.target_type
    when 'perfil' then (select id from public.profiles where id = new.target_id)
    when 'salida' then (select organizer_id from public.outings where id = new.target_id)
    when 'foto' then (select user_id from public.route_photos where id = new.target_id)
    when 'reporte' then (select user_id from public.trail_reports where id = new.target_id)
  end;
  if v_owner is null then
    raise exception 'Lo que quieres reportar ya no existe' using errcode = 'check_violation';
  end if;
  if v_owner = new.reporter_id then
    raise exception 'No puedes reportar algo tuyo' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.content_reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Hiciste muchos reportes hoy; intenta mañana' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger content_reports_check
  before insert on public.content_reports
  for each row execute function public.check_content_report();

revoke execute on function public.check_content_report() from public, anon, authenticated;

alter table public.content_reports enable row level security;

create policy "reportar" on public.content_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()) and status = 'abierto');
create policy "mis reportes o moderación" on public.content_reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy "moderación resuelve reportes" on public.content_reports
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

grant select on public.content_reports to authenticated;
grant insert (target_type, target_id, reason, details) on public.content_reports to authenticated;
grant update (status, resolved_at, resolved_by) on public.content_reports to authenticated;
grant all on public.content_reports to service_role;

-- ---------------------------------------------------------------------------
-- Contacto de emergencia: privado. Solo lo lee quien organiza, cerca de la fecha, con outing_emergency_contacts().
-- ---------------------------------------------------------------------------

create table public.emergency_contacts (
  user_id       uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 60),
  phone         text not null check (phone ~ '^\+?[0-9][0-9 ()-]{6,18}[0-9]$'),
  relationship  text check (char_length(relationship) <= 30),
  updated_at    timestamptz not null default now()
);

create trigger emergency_contacts_updated_at
  before update on public.emergency_contacts
  for each row execute function public.set_updated_at();

alter table public.emergency_contacts enable row level security;

create policy "mi contacto: ver" on public.emergency_contacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mi contacto: crear" on public.emergency_contacts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "mi contacto: editar" on public.emergency_contacts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "mi contacto: borrar" on public.emergency_contacts
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, delete on public.emergency_contacts to authenticated;
grant insert (name, phone, relationship), update (name, phone, relationship) on public.emergency_contacts to authenticated;
grant all on public.emergency_contacts to service_role;

-- Inscritos (sin quien organiza) con su contacto, o null si no registraron uno.
-- Vacío si quien pregunta no organiza la salida o si no es entre 2 días antes y 1 día después del inicio.
create function public.outing_emergency_contacts(p_outing uuid)
returns table (user_id uuid, display_name text, contact_name text, phone text, relationship text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.display_name, c.name, c.phone, c.relationship
  from public.outings o
  join public.outing_members m on m.outing_id = o.id and m.user_id <> o.organizer_id
  join public.profiles p on p.id = m.user_id
  left join public.emergency_contacts c on c.user_id = m.user_id
  where o.id = p_outing
    and o.organizer_id = (select auth.uid())
    and o.status = 'abierta'
    and now() between o.starts_at - interval '2 days' and o.starts_at + interval '1 day'
  order by m.joined_at;
$$;
revoke execute on function public.outing_emergency_contacts(uuid) from public, anon;
grant execute on function public.outing_emergency_contacts(uuid) to authenticated;
