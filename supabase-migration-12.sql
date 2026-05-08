-- ===========================================================
-- PRO-GESTIÓN · Migración 12
-- Permitir que cualquier usuario autenticado cree proyectos.
--
-- Antes: solo admin/gerente podían insertar en projects.
-- Ahora: cualquier authenticated puede insertar siempre que se asigne
-- como owner (owner_id = auth.uid()). Admin/gerente conservan permiso
-- amplio (pueden crear poniendo a otro como owner).
--
-- Update / delete no cambian:
--   - projects_update ya permite a admin/gerente y al owner.
--   - projects_delete sigue siendo admin-only.
--   - phases/tasks/milestones_insert ya permiten al owner del proyecto,
--     así que el miembro que crea el proyecto puede meter fases/tareas
--     dentro de él sin más cambios.
--
-- Idempotente.
-- ===========================================================

drop policy if exists "projects_insert" on pro_gestion.projects;

create policy "projects_insert" on pro_gestion.projects for insert to authenticated
with check (
    pro_gestion.is_admin_or_gerente()
    or owner_id = auth.uid()
);

notify pgrst, 'reload config';
