-- ===========================================================
-- migration-19: plantillas de hitos por categoría.
-- Crea `milestone_templates` + RPC `apply_milestone_template`
-- que copia los templates de la categoría del proyecto a la
-- tabla `milestones` ajustando `target_date = project.start_date
-- + days_after_start`.
--
-- Idempotente.
-- ===========================================================

create table if not exists pro_gestion.milestone_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references pro_gestion.categories(id) on delete cascade,
  name text not null,
  days_after_start int not null default 0,
  color text not null default '#7c3aed',
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists milestone_templates_category_idx
  on pro_gestion.milestone_templates (category_id, position);

-- RLS
alter table pro_gestion.milestone_templates enable row level security;

drop policy if exists "mtpl_read" on pro_gestion.milestone_templates;
create policy "mtpl_read" on pro_gestion.milestone_templates
  for select to authenticated using (true);

drop policy if exists "mtpl_admin_insert" on pro_gestion.milestone_templates;
create policy "mtpl_admin_insert" on pro_gestion.milestone_templates
  for insert to authenticated
  with check (pro_gestion.is_admin());

drop policy if exists "mtpl_admin_update" on pro_gestion.milestone_templates;
create policy "mtpl_admin_update" on pro_gestion.milestone_templates
  for update to authenticated
  using (pro_gestion.is_admin())
  with check (pro_gestion.is_admin());

drop policy if exists "mtpl_admin_delete" on pro_gestion.milestone_templates;
create policy "mtpl_admin_delete" on pro_gestion.milestone_templates
  for delete to authenticated
  using (pro_gestion.is_admin());

grant select, insert, update, delete on pro_gestion.milestone_templates to authenticated;

-- =============================================================
-- RPC: apply_milestone_template(p_project_id uuid)
-- Copia los templates de la categoría del proyecto. Idempotente:
-- skip si ya hay un milestone con el mismo nombre en ese proyecto.
-- Devuelve la cantidad de hitos creados.
-- =============================================================
create or replace function pro_gestion.apply_milestone_template(p_project_id uuid)
returns int
language plpgsql
security definer
set search_path = pro_gestion, public
as $$
declare
  v_category uuid;
  v_start    date;
  v_created  int := 0;
  v_row      record;
begin
  -- Resolver category + start del proyecto. Verifica acceso al proyecto.
  select category_id, start_date
    into v_category, v_start
  from pro_gestion.projects
  where id = p_project_id;

  if v_category is null then
    return 0;
  end if;

  for v_row in
    select name, days_after_start, color, position
    from pro_gestion.milestone_templates
    where category_id = v_category
    order by position, created_at
  loop
    -- Skip si ya existe un milestone con ese nombre en el proyecto.
    if not exists (
      select 1 from pro_gestion.milestones
      where project_id = p_project_id and name = v_row.name
    ) then
      insert into pro_gestion.milestones (project_id, name, target_date, color, completed)
      values (
        p_project_id,
        v_row.name,
        case when v_start is not null then v_start + (v_row.days_after_start || ' days')::interval else null end,
        v_row.color,
        false
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;

grant execute on function pro_gestion.apply_milestone_template(uuid) to authenticated;

comment on function pro_gestion.apply_milestone_template(uuid)
  is 'Aplica los milestone_templates de la categoría del proyecto. Idempotente. Devuelve count creados.';
