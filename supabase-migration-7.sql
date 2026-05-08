-- ===========================================================
-- Migration #7: parche de seguridad
-- Aplica fixes CN-001..CN-005 del reporte de auditoría.
-- Pegar en: SQL Editor del proyecto Supabase.
-- ===========================================================

-- CN-001 · Privilege escalation: handle_new_user ignora 'role' del metadata.
create or replace function pro_gestion.handle_new_user() returns trigger
language plpgsql security definer set search_path = pro_gestion, auth
as $$
declare
    has_admin boolean;
    chosen_role text;
begin
    select exists(select 1 from pro_gestion.profiles where role = 'admin') into has_admin;
    chosen_role := case when has_admin then 'miembro' else 'admin' end;

    insert into pro_gestion.profiles (id, name, email, role, avatar)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email,
        chosen_role,
        1 + floor(random()*12)::smallint
    )
    on conflict (id) do nothing;
    return new;
end; $$;

-- CN-002 · Bucket 'attachments': forzar primer folder = uid del autor.
-- Path nuevo en cliente debe ser: <uid>/<task_id>/<timestamp>-<safe_name>.
drop policy if exists "att_user_insert" on storage.objects;
create policy "att_user_insert" on storage.objects for insert to authenticated
with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "att_user_update" on storage.objects;
create policy "att_user_update" on storage.objects for update to authenticated
using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "att_user_delete" on storage.objects;
create policy "att_user_delete" on storage.objects for delete to authenticated
using (
    bucket_id = 'attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or pro_gestion.is_admin())
);

-- CN-003 · Revocar GRANTs a anon. Solo authenticated.
revoke all on all tables in schema pro_gestion from anon;
revoke all on all sequences in schema pro_gestion from anon;
alter default privileges in schema pro_gestion revoke all on tables from anon;
alter default privileges in schema pro_gestion revoke all on sequences from anon;
revoke usage on schema pro_gestion from anon;

-- CN-004 · activity_write: profile_id obligatorio = auth.uid().
drop policy if exists "activity_write" on pro_gestion.activity;
create policy "activity_write" on pro_gestion.activity for insert to authenticated
with check (profile_id = auth.uid());

-- CN-005 · comments_write_self: validar acceso al project_id.
drop policy if exists "comments_write_self" on pro_gestion.comments;
create policy "comments_write_self" on pro_gestion.comments for insert to authenticated
with check (
    profile_id = auth.uid()
    and exists (
        select 1 from pro_gestion.projects p
        where p.id = comments.project_id
        and (
            pro_gestion.is_admin_or_gerente()
            or p.owner_id = auth.uid()
            or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
        )
    )
);

notify pgrst, 'reload config';
