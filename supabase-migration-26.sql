-- ===========================================================
-- migration-26: cuestionario obligatorio de intake por proyecto.
--
-- El cliente debe rellenar un cuestionario base antes de que Pancake
-- arranque la construcción del bot. Existen 3 variantes según el negocio
-- del cliente (infoproductor, ecommerce, servicios); el schema visual
-- vive en `src/lib/intakeSchemas.js` y se renderiza con IntakeForm.jsx.
--
-- Cambios:
-- 1) `projects.business_type` (text, nullable, CHECK suave).
-- 2) `pro_gestion.intake_forms` (una fila por proyecto, jsonb de answers).
-- 3) RLS: staff lee/escribe; cliente del proyecto lee/escribe sólo
--    mientras status in ('borrador','rechazado').
-- 4) Triggers SECURITY DEFINER:
--    - notify_intake_event: notifica al owner al enviar, al cliente al revisar.
--    - ensure_intake_form: crea fila vacía cuando projects.business_type
--      pasa a no-null y no existe intake_form.
-- 5) Realtime publication.
--
-- Idempotente.
-- ===========================================================

-- ============================================
-- 1) PROJECTS.business_type
-- ============================================
alter table pro_gestion.projects add column if not exists business_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_business_type_check'
  ) then
    alter table pro_gestion.projects
      add constraint projects_business_type_check
      check (business_type is null or business_type in ('infoproductor','ecommerce','servicios'));
  end if;
end $$;

-- ============================================
-- 2) INTAKE_FORMS
-- ============================================
create table if not exists pro_gestion.intake_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pro_gestion.projects(id) on delete cascade,
  business_type text not null check (business_type in ('infoproductor','ecommerce','servicios')),
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'borrador' check (status in ('borrador','enviado','aprobado','rechazado')),
  submitted_at timestamptz,
  reviewed_by uuid references pro_gestion.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_forms_project_unique unique (project_id)
);

create index if not exists idx_intake_forms_project on pro_gestion.intake_forms(project_id);
create index if not exists idx_intake_forms_status on pro_gestion.intake_forms(status);

drop trigger if exists intake_forms_touch on pro_gestion.intake_forms;
create trigger intake_forms_touch before update on pro_gestion.intake_forms
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.intake_forms enable row level security;

-- READ: staff (admin/gerente/owner/miembro) o cliente del proyecto.
drop policy if exists "intake_read" on pro_gestion.intake_forms;
create policy "intake_read" on pro_gestion.intake_forms for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = intake_forms.project_id
    and (
      p.owner_id = auth.uid()
      or p.client_id = auth.uid()
      or p.created_by = auth.uid()
      or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
    )
  )
);

-- INSERT: staff o cliente asignado. En la práctica lo crea el trigger
-- ensure_intake_form, esto es red de seguridad.
drop policy if exists "intake_insert" on pro_gestion.intake_forms;
create policy "intake_insert" on pro_gestion.intake_forms for insert to authenticated
with check (
  pro_gestion.is_admin_or_gerente()
  or pro_gestion.is_project_client(project_id)
  or exists (select 1 from pro_gestion.projects p where p.id = project_id and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
);

-- UPDATE:
--   staff: cualquier campo (incluida la revisión).
--   cliente del proyecto: solo si status in ('borrador','rechazado').
drop policy if exists "intake_update" on pro_gestion.intake_forms;
create policy "intake_update" on pro_gestion.intake_forms for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = intake_forms.project_id and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
  or (pro_gestion.is_project_client(project_id) and status in ('borrador','rechazado'))
)
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = intake_forms.project_id and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
  or (pro_gestion.is_project_client(project_id) and status in ('borrador','enviado','rechazado'))
);

-- DELETE: solo staff (owner del proyecto o admin/gerente).
drop policy if exists "intake_delete" on pro_gestion.intake_forms;
create policy "intake_delete" on pro_gestion.intake_forms for delete to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = intake_forms.project_id and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
);

grant select, insert, update, delete on pro_gestion.intake_forms to authenticated;

-- ============================================
-- 3) Trigger: notifica eventos del intake.
--   - al pasar a 'enviado'  -> notifica al owner del proyecto.
--   - al pasar a 'aprobado' o 'rechazado' -> notifica al cliente.
-- ============================================
create or replace function pro_gestion.notify_intake_event() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_project pro_gestion.projects%rowtype;
begin
  select * into v_project from pro_gestion.projects where id = new.project_id;
  if not found then return new; end if;

  -- Cliente envía para revisión
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status = 'enviado'
     and v_project.owner_id is not null
  then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_project.owner_id,
      'intake_submitted',
      'Cuestionario enviado',
      'El cliente envió el cuestionario inicial de "' || v_project.title || '" para tu revisión',
      '/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('intake_id', new.id)
    );
  end if;

  -- Staff aprueba o rechaza
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('aprobado','rechazado')
     and v_project.client_id is not null
  then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_project.client_id,
      'intake_reviewed',
      case when new.status = 'aprobado' then 'Cuestionario aprobado' else 'Cuestionario con observaciones' end,
      case when new.status = 'aprobado'
        then 'Tu cuestionario de "' || v_project.title || '" fue aprobado. ¡Avanzamos!'
        else 'Revisa los comentarios del equipo y reenvía el cuestionario de "' || v_project.title || '"'
      end,
      '/portal/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('intake_id', new.id, 'status', new.status)
    );
  end if;

  return new;
end; $$;

drop trigger if exists trg_intake_notify on pro_gestion.intake_forms;
create trigger trg_intake_notify after update on pro_gestion.intake_forms
for each row execute function pro_gestion.notify_intake_event();

-- ============================================
-- 4) Trigger: crea fila vacía de intake_forms cuando se asigna
-- business_type a un proyecto (insert con business_type o update que
-- lo cambia de null/x a y).
-- ============================================
create or replace function pro_gestion.ensure_intake_form() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
begin
  if new.business_type is null then
    return new;
  end if;

  -- Sólo creamos si no existe ya un intake para este proyecto.
  if exists (select 1 from pro_gestion.intake_forms where project_id = new.id) then
    -- Si cambia el business_type del proyecto, sincronizamos el de la fila
    -- (solo cuando aún está en borrador para no destruir respuestas enviadas).
    if tg_op = 'UPDATE' and new.business_type is distinct from old.business_type then
      update pro_gestion.intake_forms
        set business_type = new.business_type
        where project_id = new.id and status = 'borrador';
    end if;
    return new;
  end if;

  insert into pro_gestion.intake_forms (project_id, business_type, answers, status)
  values (new.id, new.business_type, '{}'::jsonb, 'borrador');
  return new;
end; $$;

drop trigger if exists trg_projects_ensure_intake_ins on pro_gestion.projects;
create trigger trg_projects_ensure_intake_ins after insert on pro_gestion.projects
for each row execute function pro_gestion.ensure_intake_form();

drop trigger if exists trg_projects_ensure_intake_upd on pro_gestion.projects;
create trigger trg_projects_ensure_intake_upd after update on pro_gestion.projects
for each row execute function pro_gestion.ensure_intake_form();

-- ============================================
-- 5) REALTIME publication
-- ============================================
do $$
begin
  begin
    alter publication supabase_realtime add table pro_gestion.intake_forms;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================
-- 6) Reload PostgREST schema cache
-- ============================================
notify pgrst, 'reload config';
