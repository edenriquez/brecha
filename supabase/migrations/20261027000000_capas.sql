-- ---------------------------------------------------------------------------
-- Capas del mapa (relieve LiDAR y sus hallazgos): cualquiera las lee, solo se
-- suben con la llave de servicio (no hay políticas de escritura)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas', 'capas', true, 52428800, array['application/vnd.pmtiles', 'application/geo+json', 'application/json'])
on conflict (id) do nothing;
