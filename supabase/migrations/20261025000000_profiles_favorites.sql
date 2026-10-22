-- Perfil público y editable (bio, zona, foto propia) y rutas guardadas.

-- ---------------------------------------------------------------------------
-- Perfil
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column bio text check (char_length(bio) <= 280),
  add column home_area text check (char_length(home_area) <= 60),
  -- foto subida a Brecha (<id>/<uuid>.jpg en el bucket avatars); avatar_url queda para la de Google
  add column avatar_path text,
  add constraint profiles_avatar_path_own check (avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$')),
  add constraint profiles_display_name_length check (char_length(display_name) <= 80) not valid;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 80),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end $$;

-- La foto de Google se puede quitar pero no reemplazar por otra URL: next/image solo carga hosts conocidos
-- y una URL ajena rompería cada página donde aparece el avatar.
create function public.guard_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null and new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null then
    raise exception 'La foto de perfil se sube desde Brecha' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

revoke execute on function public.guard_profile_update() from public, anon, authenticated;

grant update (display_name, avatar_url, avatar_path, bio, home_area) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "avatar: subir a mi carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatar: ver el mío" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

create policy "avatar: borrar el mío" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Rutas guardadas: privadas, cada quien ve solo las suyas
-- ---------------------------------------------------------------------------

create table public.route_favorites (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  route_id    uuid not null references public.routes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, route_id)
);
create index route_favorites_route_idx on public.route_favorites (route_id);

alter table public.route_favorites enable row level security;

create policy "mis guardadas" on public.route_favorites
  for select to authenticated using (user_id = (select auth.uid()));
create policy "guardar una ruta publicada" on public.route_favorites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.routes r where r.id = route_id and r.status = 'publicada')
  );
create policy "quitar de guardadas" on public.route_favorites
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, delete on public.route_favorites to authenticated;
grant insert (route_id) on public.route_favorites to authenticated;
grant all on public.route_favorites to service_role;
