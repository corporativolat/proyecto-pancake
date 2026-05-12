-- ===========================================================
-- migration-16: campos de cálculo de costo en proyectos.
-- Permite registrar el valor total del proyecto + las horas
-- estimadas. La tarifa horaria se calcula en cliente como
-- project_value / project_hours, no se almacena.
--
-- Idempotente: usa "if not exists".
-- ===========================================================

alter table pro_gestion.projects
  add column if not exists project_value numeric(12, 2),
  add column if not exists project_hours numeric(8, 2);

-- Constraints suaves: solo valores positivos cuando se rellenan.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_project_value_positive'
  ) then
    alter table pro_gestion.projects
      add constraint projects_project_value_positive
      check (project_value is null or project_value >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_project_hours_positive'
  ) then
    alter table pro_gestion.projects
      add constraint projects_project_hours_positive
      check (project_hours is null or project_hours > 0);
  end if;
end $$;

comment on column pro_gestion.projects.project_value is 'Valor total facturable del proyecto en la moneda local. Nullable.';
comment on column pro_gestion.projects.project_hours is 'Horas estimadas para completar el proyecto. Nullable.';
