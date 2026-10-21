-- Reglas al editar o cancelar una salida que RLS no expresa ("editar mi salida" solo valida quién).
-- Corre con los permisos de quien edita: contar inscritos está permitido por "inscritos visibles".
create or replace function public.guard_outing_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_taken integer;
begin
  if new.route_id <> old.route_id or new.organizer_id <> old.organizer_id then
    raise exception 'La ruta y quien organiza no se pueden cambiar' using errcode = 'check_violation';
  end if;
  if old.status = 'cancelada' then
    raise exception 'La salida ya está cancelada' using errcode = 'check_violation';
  end if;
  if old.starts_at <= now() then
    raise exception 'La salida ya pasó' using errcode = 'check_violation';
  end if;
  if new.starts_at <> old.starts_at and new.starts_at <= now() then
    raise exception 'La salida tiene que ser en el futuro' using errcode = 'check_violation';
  end if;
  if new.capacity < old.capacity then
    -- el trigger de cupo bloquea esta misma fila al inscribir, así que el conteo no se adelanta
    select count(*) into v_taken from public.outing_members where outing_id = new.id;
    if new.capacity < v_taken then
      raise exception 'Ya hay % personas inscritas: el cupo no puede ser menor', v_taken using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger outings_guard_update
  before update on public.outings
  for each row execute function public.guard_outing_update();
