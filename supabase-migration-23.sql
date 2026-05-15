-- ===========================================================
-- PRO-GESTIÓN · Migración 23
--
-- A) Fix RLS al crear proyectos. Antes: un usuario no admin/gerente
--    solo podía insertar en `projects` si owner_id = auth.uid(). Con el
--    toggle "el responsable tiene cuenta" en OFF el cliente manda
--    owner_id = NULL → la policy projects_insert rechazaba el insert
--    ("new row violates row-level security policy"). Aunque pasara, el
--    creador no quedaba como owner ni en project_members, así que
--    projects_read tampoco le mostraría el proyecto (huérfano).
--    Fix: nueva columna projects.created_by (default auth.uid()) e
--    inclusión de "created_by = auth.uid()" en las policies de projects
--    y en insert/update de phases/tasks/milestones (createProject inserta
--    la primera fase automáticamente, así que el creador necesita poder
--    escribir dentro de su propio proyecto huérfano).
--
-- B) projects.currency (COP|USD|BRL, default COP) para el selector de
--    moneda de la sección Costo del proyecto.
--
-- Idempotente: se puede re-ejecutar sin efectos secundarios.
-- ===========================================================

-- ---------- A) created_by + RLS ----------

alter table pro_gestion.projects
  add column if not exists created_by uuid references pro_gestion.profiles(id) on delete set null;

alter table pro_gestion.projects
  alter column created_by set default auth.uid();

-- Backfill: filas existentes quedan con created_by = owner_id (cuando lo hay).
update pro_gestion.projects
  set created_by = owner_id
  where created_by is null and owner_id is not null;

create index if not exists idx_projects_created_by on pro_gestion.projects(created_by);

-- projects_insert: base mig-12 + created_by.
drop policy if exists "projects_insert" on pro_gestion.projects;
create policy "projects_insert" on pro_gestion.projects for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or owner_id = auth.uid()
    or created_by = auth.uid()
);

-- projects_read: base mig-20 (incluye client_id) + created_by.
drop policy if exists "projects_read" on pro_gestion.projects;
create policy "projects_read" on pro_gestion.projects for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or owner_id = auth.uid()
    or created_by = auth.uid()
    or client_id = auth.uid()
    or exists (select 1 from pro_gestion.project_members m where m.project_id = projects.id and m.profile_id = auth.uid())
);

-- projects_update: base supabase-setup.sql + created_by.
drop policy if exists "projects_update" on pro_gestion.projects;
create policy "projects_update" on pro_gestion.projects for update to authenticated
using (
    pro_gestion.is_admin_or_gerente() or owner_id = auth.uid() or created_by = auth.uid()
)
with check (
    pro_gestion.is_admin_or_gerente() or owner_id = auth.uid() or created_by = auth.uid()
);

-- phases: el creador del proyecto puede gestionar fases (base mig-11 + created_by).
drop policy if exists "phases_insert" on pro_gestion.phases;
create policy "phases_insert" on pro_gestion.phases for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id
               and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
);

drop policy if exists "phases_update" on pro_gestion.phases;
create policy "phases_update" on pro_gestion.phases for update to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id
               and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id
               and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
);

-- tasks: base mig-11 + created_by (conserva assignee_id).
drop policy if exists "tasks_insert" on pro_gestion.tasks;
create policy "tasks_insert" on pro_gestion.tasks for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or p.created_by = auth.uid() or tasks.assignee_id = auth.uid())
    )
);

drop policy if exists "tasks_update" on pro_gestion.tasks;
create policy "tasks_update" on pro_gestion.tasks for update to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or p.created_by = auth.uid() or tasks.assignee_id = auth.uid())
    )
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or p.created_by = auth.uid() or tasks.assignee_id = auth.uid())
    )
);

-- milestones: base mig-11 + created_by.
drop policy if exists "milestones_insert" on pro_gestion.milestones;
create policy "milestones_insert" on pro_gestion.milestones for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id
               and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
);

drop policy if exists "milestones_update" on pro_gestion.milestones;
create policy "milestones_update" on pro_gestion.milestones for update to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id
               and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id
               and (p.owner_id = auth.uid() or p.created_by = auth.uid()))
);

-- ---------- B) currency ----------

alter table pro_gestion.projects
  add column if not exists currency text not null default 'COP';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_currency_check'
      and conrelid = 'pro_gestion.projects'::regclass
  ) then
    alter table pro_gestion.projects
      add constraint projects_currency_check check (currency in ('COP','USD','BRL'));
  end if;
end $$;

-- ---------- reload PostgREST ----------
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
