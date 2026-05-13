-- ===========================================================
-- migration-20: portal de clientes + roles extendidos.
-- - Roles 'cliente' y 'super_admin' en profiles (extiende CHECK).
-- - profiles: phone, company, suspended, onboarding_completed,
--   onboarding_step, onboarding_seen_at.
-- - projects.client_id (uuid -> profiles, ON DELETE SET NULL).
-- - pro_gestion.documents (con RLS).
-- - pro_gestion.notifications (con RLS + realtime).
-- - Helpers: is_super_admin(), is_staff(), is_cliente(),
--   is_project_client(uuid).
-- - Storage bucket "documents" (privado).
-- - Triggers: doc subido -> notif staff; status proyecto -> notif cliente.
--
-- Idempotente.
-- ===========================================================

-- ============================================
-- 1) PROFILES: extender CHECK de role + columnas nuevas
-- ============================================
alter table pro_gestion.profiles drop constraint if exists profiles_role_check;
alter table pro_gestion.profiles
  add constraint profiles_role_check
  check (role in ('super_admin','admin','gerente','miembro','cliente'));

alter table pro_gestion.profiles add column if not exists phone text;
alter table pro_gestion.profiles add column if not exists company text;
alter table pro_gestion.profiles add column if not exists suspended boolean not null default false;
alter table pro_gestion.profiles add column if not exists onboarding_completed boolean not null default false;
alter table pro_gestion.profiles add column if not exists onboarding_step smallint not null default 0;
alter table pro_gestion.profiles add column if not exists onboarding_seen_at timestamptz;

-- ============================================
-- 2) PROJECTS: añadir client_id (cliente externo asignado al proyecto)
-- ============================================
alter table pro_gestion.projects
  add column if not exists client_id uuid references pro_gestion.profiles(id) on delete set null;

create index if not exists idx_projects_client on pro_gestion.projects(client_id);

-- ============================================
-- 3) HELPERS de rol
-- ============================================
create or replace function pro_gestion.is_super_admin() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role = 'super_admin'); $$;

-- staff = cualquier rol interno (super_admin/admin/gerente/miembro)
create or replace function pro_gestion.is_staff() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role in ('super_admin','admin','gerente','miembro')); $$;

create or replace function pro_gestion.is_cliente() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role = 'cliente'); $$;

-- ¿auth.uid() es el cliente asignado a este proyecto?
create or replace function pro_gestion.is_project_client(p_project_id uuid) returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.projects where id = p_project_id and client_id = auth.uid()); $$;

-- ============================================
-- 4) Extender helpers existentes para incluir super_admin
-- ============================================
create or replace function pro_gestion.is_admin() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role in ('admin','super_admin')); $$;

create or replace function pro_gestion.is_admin_or_gerente() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role in ('admin','super_admin','gerente')); $$;

-- ============================================
-- 5) PROJECTS RLS: permitir lectura al cliente asignado
-- ============================================
drop policy if exists "projects_read" on pro_gestion.projects;
create policy "projects_read" on pro_gestion.projects for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or owner_id = auth.uid()
    or client_id = auth.uid()
    or exists (select 1 from pro_gestion.project_members m where m.project_id = projects.id and m.profile_id = auth.uid())
);

-- ============================================
-- 6) PHASES RLS: extender lectura para cliente del proyecto
-- ============================================
drop policy if exists "phases_read" on pro_gestion.phases;
create policy "phases_read" on pro_gestion.phases for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.projects p
        where p.id = phases.project_id
        and (p.owner_id = auth.uid()
             or p.client_id = auth.uid()
             or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
    )
);

-- ============================================
-- 7) TASKS RLS: extender lectura para cliente del proyecto
-- ============================================
drop policy if exists "tasks_read" on pro_gestion.tasks;
create policy "tasks_read" on pro_gestion.tasks for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid()
             or p.client_id = auth.uid()
             or tasks.assignee_id = auth.uid()
             or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
    )
);

-- Milestones RLS: lectura para cliente del proyecto (si la tabla existe)
do $$
begin
  if exists (select 1 from pg_tables where schemaname='pro_gestion' and tablename='milestones') then
    execute 'drop policy if exists "milestones_read" on pro_gestion.milestones';
    execute $POL$
      create policy "milestones_read" on pro_gestion.milestones for select to authenticated
      using (
          pro_gestion.is_admin_or_gerente()
          or exists (
              select 1 from pro_gestion.projects p
              where p.id = milestones.project_id
              and (p.owner_id = auth.uid()
                   or p.client_id = auth.uid()
                   or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
          )
      )
    $POL$;
  end if;
end $$;

-- ============================================
-- 8) DOCUMENTS
-- ============================================
create table if not exists pro_gestion.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pro_gestion.projects(id) on delete cascade,
  name text not null,
  kind text not null default 'generico', -- cedula | branding | accesos | logos | contrato | otro
  file_path text,                         -- path en bucket storage 'documents'
  file_url text,                          -- url firmada/pública opcional
  status text not null default 'pendiente' check (status in ('pendiente','enviado','aprobado','rechazado')),
  required boolean not null default false,
  uploaded_by uuid references pro_gestion.profiles(id) on delete set null,
  reviewed_by uuid references pro_gestion.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_project on pro_gestion.documents(project_id);
create index if not exists idx_documents_status on pro_gestion.documents(status);

drop trigger if exists documents_touch on pro_gestion.documents;
create trigger documents_touch before update on pro_gestion.documents
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.documents enable row level security;

-- staff lee todos los documentos de proyectos que ya puede ver via projects_read
-- cliente lee solo documentos de sus proyectos
drop policy if exists "documents_read" on pro_gestion.documents;
create policy "documents_read" on pro_gestion.documents for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = documents.project_id
    and (p.owner_id = auth.uid()
         or p.client_id = auth.uid()
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  )
);

-- insert: staff o cliente asignado al proyecto
drop policy if exists "documents_insert" on pro_gestion.documents;
create policy "documents_insert" on pro_gestion.documents for insert to authenticated
with check (
  pro_gestion.is_admin_or_gerente()
  or pro_gestion.is_project_client(project_id)
  or exists (select 1 from pro_gestion.projects p where p.id = project_id and p.owner_id = auth.uid())
);

-- update:
--   staff: cualquier campo (incluye revisión)
--   cliente: solo si es el uploader y el doc está pendiente/rechazado (puede re-subir)
drop policy if exists "documents_update" on pro_gestion.documents;
create policy "documents_update" on pro_gestion.documents for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = documents.project_id and p.owner_id = auth.uid())
  or (uploaded_by = auth.uid() and status in ('pendiente','rechazado'))
)
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = documents.project_id and p.owner_id = auth.uid())
  or (uploaded_by = auth.uid() and status in ('pendiente','rechazado','enviado'))
);

-- delete: solo staff
drop policy if exists "documents_delete" on pro_gestion.documents;
create policy "documents_delete" on pro_gestion.documents for delete to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = documents.project_id and p.owner_id = auth.uid())
);

grant select, insert, update, delete on pro_gestion.documents to authenticated;

-- ============================================
-- 9) NOTIFICATIONS
-- ============================================
create table if not exists pro_gestion.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references pro_gestion.profiles(id) on delete cascade,
  kind text not null,                  -- doc_uploaded | doc_reviewed | project_status | task_assigned | manual | ...
  title text not null,
  body text default '',
  link text,                           -- ruta interna (/portal/projects/:id, /admin/projects/:id, ...)
  project_id uuid references pro_gestion.projects(id) on delete cascade,
  meta jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_profile on pro_gestion.notifications(profile_id, read_at);
create index if not exists idx_notifications_created on pro_gestion.notifications(created_at desc);

alter table pro_gestion.notifications enable row level security;

-- cada usuario lee solo las suyas; admin lee todas
drop policy if exists "notifications_read" on pro_gestion.notifications;
create policy "notifications_read" on pro_gestion.notifications for select to authenticated
using (profile_id = auth.uid() or pro_gestion.is_admin());

-- insert: staff puede crear notif para cualquiera; cliente solo para sí mismo (raro pero por completitud)
drop policy if exists "notifications_insert" on pro_gestion.notifications;
create policy "notifications_insert" on pro_gestion.notifications for insert to authenticated
with check (pro_gestion.is_staff() or profile_id = auth.uid());

-- update: solo el destinatario (marcar leída)
drop policy if exists "notifications_update" on pro_gestion.notifications;
create policy "notifications_update" on pro_gestion.notifications for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "notifications_delete" on pro_gestion.notifications;
create policy "notifications_delete" on pro_gestion.notifications for delete to authenticated
using (profile_id = auth.uid() or pro_gestion.is_admin());

grant select, insert, update, delete on pro_gestion.notifications to authenticated;

-- ============================================
-- 10) TRIGGERS de notificación
-- ============================================

-- 10a) cuando se sube/actualiza un documento -> notifica staff (owner + admins relevantes)
create or replace function pro_gestion.notify_document_event() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_project pro_gestion.projects%rowtype;
  v_uploader_name text;
begin
  select * into v_project from pro_gestion.projects where id = new.project_id;
  if not found then return new; end if;

  select coalesce(name, email, 'Cliente') into v_uploader_name
    from pro_gestion.profiles where id = new.uploaded_by;

  -- INSERT: notif al owner si existe
  if tg_op = 'INSERT' and v_project.owner_id is not null then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_project.owner_id,
      'doc_uploaded',
      'Nuevo documento subido',
      coalesce(v_uploader_name,'Cliente') || ' subió "' || new.name || '"',
      '/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('document_id', new.id, 'document_kind', new.kind)
    );
  end if;

  -- UPDATE: si cambia status y hay cliente, notifica al cliente
  if tg_op = 'UPDATE' and new.status is distinct from old.status and v_project.client_id is not null then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_project.client_id,
      'doc_reviewed',
      'Documento ' || new.status,
      'Tu documento "' || new.name || '" fue marcado como ' || new.status,
      '/portal/projects/' || v_project.id::text || '/documents',
      v_project.id,
      jsonb_build_object('document_id', new.id, 'status', new.status)
    );
  end if;

  return new;
end; $$;

drop trigger if exists trg_documents_notify_ins on pro_gestion.documents;
create trigger trg_documents_notify_ins after insert on pro_gestion.documents
for each row execute function pro_gestion.notify_document_event();

drop trigger if exists trg_documents_notify_upd on pro_gestion.documents;
create trigger trg_documents_notify_upd after update on pro_gestion.documents
for each row execute function pro_gestion.notify_document_event();

-- 10b) cuando cambia el status del proyecto -> notif al cliente
create or replace function pro_gestion.notify_project_status_change() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.client_id is not null then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      new.client_id,
      'project_status',
      'Cambio de estado',
      'Tu proyecto "' || new.title || '" pasó a ' || new.status,
      '/portal/projects/' || new.id::text,
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_projects_notify_status on pro_gestion.projects;
create trigger trg_projects_notify_status after update on pro_gestion.projects
for each row execute function pro_gestion.notify_project_status_change();

-- ============================================
-- 11) STORAGE bucket 'documents'
-- ============================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Policies storage: paths con primer folder = project_id; staff puede todo, cliente solo su proyecto
drop policy if exists "documents_storage_read" on storage.objects;
create policy "documents_storage_read" on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1 from pro_gestion.projects p
    where p.id::text = (storage.foldername(name))[1]
    and (
      pro_gestion.is_admin_or_gerente()
      or p.owner_id = auth.uid()
      or p.client_id = auth.uid()
      or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
    )
  )
);

drop policy if exists "documents_storage_insert" on storage.objects;
create policy "documents_storage_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and exists (
    select 1 from pro_gestion.projects p
    where p.id::text = (storage.foldername(name))[1]
    and (
      pro_gestion.is_admin_or_gerente()
      or p.owner_id = auth.uid()
      or p.client_id = auth.uid()
    )
  )
);

drop policy if exists "documents_storage_delete" on storage.objects;
create policy "documents_storage_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (
    pro_gestion.is_admin()
    or owner = auth.uid()
  )
);

-- ============================================
-- 12) REALTIME publication: notifications + documents
-- ============================================
do $$
begin
  begin
    alter publication supabase_realtime add table pro_gestion.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table pro_gestion.documents;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================
-- 13) Reload PostgREST
-- ============================================
notify pgrst, 'reload config';
