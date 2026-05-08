-- ===========================================================
-- PRO-GESTIÓN · Migration #2: avatar_url, language, storage
-- Pegar en: https://supabase.com/dashboard/project/ajtikvqfhylhafuwemnq/sql/new
-- ===========================================================

-- 1. Agregar columnas a profiles
alter table pro_gestion.profiles add column if not exists avatar_url text;
alter table pro_gestion.profiles add column if not exists language text not null default 'es' check (language in ('es','en'));

-- 2. Bucket storage avatars (público para lecturas, escribe solo dueño)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Políticas storage avatars
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_user_insert" on storage.objects;
create policy "avatars_user_insert" on storage.objects for insert to authenticated
with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_user_update" on storage.objects;
create policy "avatars_user_update" on storage.objects for update to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "avatars_user_delete" on storage.objects;
create policy "avatars_user_delete" on storage.objects for delete to authenticated
using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Política update profiles refinada (cualquier user edita su propio perfil; admin edita todos)
drop policy if exists "profiles_self_update" on pro_gestion.profiles;
create policy "profiles_self_update" on pro_gestion.profiles for update to authenticated
using (id = auth.uid() or pro_gestion.is_admin())
with check (
    -- Si es admin: cualquier cambio. Si es self: no cambia su propio role.
    pro_gestion.is_admin()
    or (id = auth.uid() and role = (select role from pro_gestion.profiles where id = auth.uid()))
);

notify pgrst, 'reload config';
