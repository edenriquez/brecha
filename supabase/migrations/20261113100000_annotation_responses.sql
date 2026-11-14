-- "¿Sigue ahí?": quien pasa por una obstrucción o un lodo o agua contesta desde el visor. Una respuesta por persona y aviso;
-- contestar otra vez la reemplaza. Solo cuentan las posteriores al último cambio del aviso: editarlo lo reactiva.

create table public.route_annotation_responses (
  annotation_id  uuid not null references public.route_annotations (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  still_there    boolean not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (annotation_id, user_id)
);

create trigger route_annotation_responses_updated_at
  before update on public.route_annotation_responses
  for each row execute function public.set_updated_at();

alter table public.route_annotation_responses enable row level security;

-- nadie lee las respuestas de otros: solo salen los conteos (confirmed / gone)
create policy "leo mis respuestas" on public.route_annotation_responses
  for select to authenticated
  using (user_id = (select auth.uid()));
-- el aviso tiene que ser visible para quien responde (el RLS de route_annotations) y de un tipo que se confirma
create policy "respondo avisos que veo" on public.route_annotation_responses
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.route_annotations a where a.id = annotation_id and a.kind in ('obstruccion', 'lodo_agua')));
create policy "cambio mi respuesta" on public.route_annotation_responses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.route_annotations a where a.id = annotation_id and a.kind in ('obstruccion', 'lodo_agua')));

create policy "suspendida: no responde avisos" on public.route_annotation_responses as restrictive
  for insert to authenticated with check (not (select public.is_suspended()));
create policy "suspendida: no cambia respuestas" on public.route_annotation_responses as restrictive
  for update to authenticated using (not (select public.is_suspended()));

-- el upsert de PostgREST hace insert … on conflict do update set <columnas enviadas>
grant select, insert (annotation_id, still_there), update (annotation_id, still_there) on public.route_annotation_responses to authenticated;
grant all on public.route_annotation_responses to service_role;

-- Conteos como columnas calculadas de route_annotations (`select=…,confirmed,gone`): no exponen quién respondió.

-- "sigue ahí" desde el último cambio del aviso
create function public.confirmed(a public.route_annotations)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.route_annotation_responses r
  where r.annotation_id = a.id and r.still_there and r.updated_at > a.updated_at;
$$;

-- "ya no está" seguidos más recientes: posteriores al último cambio del aviso y al último "sigue ahí"
create function public.gone(a public.route_annotations)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.route_annotation_responses r
  where r.annotation_id = a.id and not r.still_there
    and r.updated_at > greatest(a.updated_at, (select max(s.updated_at) from public.route_annotation_responses s where s.annotation_id = a.id and s.still_there));
$$;

revoke execute on function public.confirmed(public.route_annotations), public.gone(public.route_annotations) from public;
grant execute on function public.confirmed(public.route_annotations), public.gone(public.route_annotations) to anon, authenticated, service_role;
