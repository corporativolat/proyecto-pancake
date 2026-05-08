-- ===========================================================
-- PRO-GESTIÓN · Migración 11
-- Fix RLS: "infinite recursion detected in policy for relation projects"
--
-- Causa: policies *_write sobre project_members, phases, tasks y milestones
-- usaban "for all" → eso instala 4 policies (SELECT/INSERT/UPDATE/DELETE).
-- La variante SELECT de members_write consulta projects; projects_read
-- consulta project_members; que dispara members_write SELECT otra vez.
-- Ciclo.
--
-- Fix: dejar el SELECT cubierto SOLO por la policy *_read y dividir *_write
-- en INSERT/UPDATE/DELETE separados con la misma lógica de antes.
-- ===========================================================

-- 1) project_members ---------------------------------------------------------
drop policy if exists "members_write" on pro_gestion.project_members;

create policy "members_insert" on pro_gestion.project_members for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = project_id and p.owner_id = auth.uid())
);

create policy "members_update" on pro_gestion.project_members for update to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = project_id and p.owner_id = auth.uid())
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = project_id and p.owner_id = auth.uid())
);

create policy "members_delete" on pro_gestion.project_members for delete to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = project_id and p.owner_id = auth.uid())
);

-- 2) phases -----------------------------------------------------------------
drop policy if exists "phases_write" on pro_gestion.phases;

create policy "phases_insert" on pro_gestion.phases for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id and p.owner_id = auth.uid())
);

create policy "phases_update" on pro_gestion.phases for update to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id and p.owner_id = auth.uid())
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id and p.owner_id = auth.uid())
);

create policy "phases_delete" on pro_gestion.phases for delete to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id and p.owner_id = auth.uid())
);

-- 3) tasks ------------------------------------------------------------------
drop policy if exists "tasks_write" on pro_gestion.tasks;

create policy "tasks_insert" on pro_gestion.tasks for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or tasks.assignee_id = auth.uid())
    )
);

create policy "tasks_update" on pro_gestion.tasks for update to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or tasks.assignee_id = auth.uid())
    )
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or tasks.assignee_id = auth.uid())
    )
);

create policy "tasks_delete" on pro_gestion.tasks for delete to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or tasks.assignee_id = auth.uid())
    )
);

-- 4) milestones -------------------------------------------------------------
drop policy if exists "milestones_write" on pro_gestion.milestones;

create policy "milestones_insert" on pro_gestion.milestones for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id and p.owner_id = auth.uid())
);

create policy "milestones_update" on pro_gestion.milestones for update to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id and p.owner_id = auth.uid())
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id and p.owner_id = auth.uid())
);

create policy "milestones_delete" on pro_gestion.milestones for delete to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id and p.owner_id = auth.uid())
);

-- 5) categories -------------------------------------------------------------
-- categories_admin_write usa "for all" pero su condición no consulta tablas
-- con RLS recursiva. Aún así lo dividimos para mantener consistencia y dejar
-- el SELECT cubierto solo por categories_read_all.
drop policy if exists "categories_admin_write" on pro_gestion.categories;

create policy "categories_admin_insert" on pro_gestion.categories for insert to authenticated
with check (pro_gestion.is_admin());

create policy "categories_admin_update" on pro_gestion.categories for update to authenticated
using (pro_gestion.is_admin())
with check (pro_gestion.is_admin());

create policy "categories_admin_delete" on pro_gestion.categories for delete to authenticated
using (pro_gestion.is_admin());

notify pgrst, 'reload config';
