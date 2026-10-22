-- Reglas de la comunidad y aviso de responsabilidad: hay que aceptarlos para unirse a una salida o convocarla.

alter table public.profiles add column rules_accepted_at timestamptz;

-- La fecha de aceptación la pone el servidor: la columna deja de ser editable directo.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create or replace function public.accept_community_rules()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set rules_accepted_at = now() where id = (select auth.uid());
$$;
revoke execute on function public.accept_community_rules() from public, anon;
grant execute on function public.accept_community_rules() to authenticated;

-- Igual que la versión inicial más la verificación de las reglas. Sin auth.uid() (editor SQL, seed) no se exige.
-- También corre al convocar: join_organizer inscribe a quien organiza.
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

  if (select auth.uid()) is not null
     and not exists (select 1 from public.profiles where id = new.user_id and rules_accepted_at is not null) then
    raise exception 'Acepta las reglas de la comunidad para participar en salidas' using errcode = 'check_violation';
  end if;

  select count(*) into v_taken from public.outing_members where outing_id = new.outing_id;
  if v_taken >= v_capacity then
    raise exception 'La salida ya está llena' using errcode = 'check_violation';
  end if;
  return new;
end $$;
