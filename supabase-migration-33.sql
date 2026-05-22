-- ===========================================================
-- migration-33: imagen para plataformas.
--
-- Añade `pro_gestion.platforms.image_url` (text, nullable) y crea
-- bucket público `platforms` para que los admins suban un logo /
-- foto de cada plataforma. El cliente prioriza la imagen sobre el
-- emoji `icon` cuando existe.
--
-- Bucket:
--   - público en lectura (sirve la URL directa para mostrar el logo).
--   - escritura (insert/update/delete) restringida a admins
--     (pro_gestion.is_admin()) — el bucket es global, no por proyecto.
--   - el path usado por el cliente es `<platform_id>/<ts>-<safeName>`.
--
-- Idempotente.
-- ===========================================================

-- 1) Columna
alter table pro_gestion.platforms add column if not exists image_url text;

-- 2) Bucket público
insert into storage.buckets (id, name, public)
values ('platforms', 'platforms', true)
on conflict (id) do update set public = true;

-- 3) Policies storage
drop policy if exists "platforms_storage_read" on storage.objects;
create policy "platforms_storage_read" on storage.objects for select to public
using (bucket_id = 'platforms');

drop policy if exists "platforms_storage_insert" on storage.objects;
create policy "platforms_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'platforms' and pro_gestion.is_admin());

drop policy if exists "platforms_storage_update" on storage.objects;
create policy "platforms_storage_update" on storage.objects for update to authenticated
using (bucket_id = 'platforms' and pro_gestion.is_admin());

drop policy if exists "platforms_storage_delete" on storage.objects;
create policy "platforms_storage_delete" on storage.objects for delete to authenticated
using (bucket_id = 'platforms' and pro_gestion.is_admin());

-- 4) Reload PostgREST schema cache (para que `image_url` aparezca en el API).
notify pgrst, 'reload config';
