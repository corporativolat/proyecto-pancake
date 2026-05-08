-- Migration #6: attachments, audit triggers automáticos, realtime publication

-- ATTACHMENTS en tasks (lista de URLs storage)
alter table pro_gestion.tasks add column if not exists attachments jsonb not null default '[]'::jsonb;

-- BUCKET attachments
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do update set public = true;

drop policy if exists "att_public_read" on storage.objects;
create policy "att_public_read" on storage.objects for select to public using (bucket_id = 'attachments');

drop policy if exists "att_user_insert" on storage.objects;
create policy "att_user_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'attachments');

drop policy if exists "att_user_update" on storage.objects;
create policy "att_user_update" on storage.objects for update to authenticated using (bucket_id = 'attachments');

drop policy if exists "att_user_delete" on storage.objects;
create policy "att_user_delete" on storage.objects for delete to authenticated using (bucket_id = 'attachments');

-- AUDIT TRIGGERS automáticos
create or replace function pro_gestion.audit_project() returns trigger
language plpgsql security definer set search_path = pro_gestion as $$
begin
    if TG_OP = 'INSERT' then
        insert into pro_gestion.activity (project_id, profile_id, kind, detail) values (new.id, auth.uid(), 'project_create', new.title);
    elsif TG_OP = 'DELETE' then
        insert into pro_gestion.activity (project_id, profile_id, kind, detail) values (null, auth.uid(), 'project_delete', old.title);
    elsif TG_OP = 'UPDATE' and old.status is distinct from new.status then
        insert into pro_gestion.activity (project_id, profile_id, kind, detail) values (new.id, auth.uid(), 'project_status', old.status || ' → ' || new.status);
    end if;
    return coalesce(new, old);
end; $$;

drop trigger if exists trg_audit_project on pro_gestion.projects;
create trigger trg_audit_project after insert or update or delete on pro_gestion.projects
for each row execute function pro_gestion.audit_project();

create or replace function pro_gestion.audit_task() returns trigger
language plpgsql security definer set search_path = pro_gestion as $$
declare
    pid uuid;
begin
    if TG_OP = 'INSERT' then
        select project_id into pid from pro_gestion.phases where id = new.phase_id;
        insert into pro_gestion.activity (project_id, profile_id, kind, detail) values (pid, auth.uid(), 'task_create', new.name);
    elsif TG_OP = 'UPDATE' and old.completed is distinct from new.completed and new.completed = true then
        select project_id into pid from pro_gestion.phases where id = new.phase_id;
        insert into pro_gestion.activity (project_id, profile_id, kind, detail) values (pid, auth.uid(), 'task_complete', new.name);
    end if;
    return coalesce(new, old);
end; $$;

drop trigger if exists trg_audit_task on pro_gestion.tasks;
create trigger trg_audit_task after insert or update on pro_gestion.tasks
for each row execute function pro_gestion.audit_task();

create or replace function pro_gestion.audit_phase() returns trigger
language plpgsql security definer set search_path = pro_gestion as $$
begin
    if TG_OP = 'INSERT' then
        insert into pro_gestion.activity (project_id, profile_id, kind, detail) values (new.project_id, auth.uid(), 'phase_create', new.name);
    end if;
    return new;
end; $$;

drop trigger if exists trg_audit_phase on pro_gestion.phases;
create trigger trg_audit_phase after insert on pro_gestion.phases
for each row execute function pro_gestion.audit_phase();

create or replace function pro_gestion.audit_comment() returns trigger
language plpgsql security definer set search_path = pro_gestion as $$
begin
    if TG_OP = 'INSERT' then
        insert into pro_gestion.activity (project_id, profile_id, kind, detail) values (new.project_id, new.profile_id, 'comment_add', left(new.body, 80));
    end if;
    return new;
end; $$;

drop trigger if exists trg_audit_comment on pro_gestion.comments;
create trigger trg_audit_comment after insert on pro_gestion.comments
for each row execute function pro_gestion.audit_comment();

-- REALTIME: agregar tablas a publication (idempotente).
-- alter publication ... add table NO soporta IF NOT EXISTS, por eso atrapamos
-- duplicate_object para que reintentar la migración no falle.
do $$ begin alter publication supabase_realtime add table pro_gestion.projects;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table pro_gestion.phases;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table pro_gestion.tasks;      exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table pro_gestion.comments;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table pro_gestion.activity;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table pro_gestion.milestones; exception when duplicate_object then null; end $$;

notify pgrst, 'reload config';
