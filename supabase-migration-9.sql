-- ===========================================================
-- Migration #9: índices + updated_at + RPC reorder transaccional
-- Resuelve CN-012, CN-013, CN-021.
-- ===========================================================

-- CN-012 · índices en FK frecuentes
create index if not exists idx_tasks_assignee on pro_gestion.tasks(assignee_id);
create index if not exists idx_projects_category on pro_gestion.projects(category_id);
create index if not exists idx_project_members_profile on pro_gestion.project_members(profile_id);

-- CN-013 · updated_at en tasks y phases
alter table pro_gestion.tasks add column if not exists updated_at timestamptz not null default now();
alter table pro_gestion.phases add column if not exists updated_at timestamptz not null default now();

drop trigger if exists tasks_touch on pro_gestion.tasks;
create trigger tasks_touch before update on pro_gestion.tasks
for each row execute function pro_gestion.touch_updated_at();

drop trigger if exists phases_touch on pro_gestion.phases;
create trigger phases_touch before update on pro_gestion.phases
for each row execute function pro_gestion.touch_updated_at();

-- CN-021 · reorder transaccional. Acepta jsonb [{id, position}].
create or replace function pro_gestion.reorder_phases(items jsonb)
returns void
language plpgsql security invoker
set search_path = pro_gestion
as $$
declare
    rec record;
begin
    for rec in select (e->>'id')::uuid as id, (e->>'position')::int as position
               from jsonb_array_elements(items) e
    loop
        update pro_gestion.phases set position = rec.position where id = rec.id;
    end loop;
end; $$;

grant execute on function pro_gestion.reorder_phases(jsonb) to authenticated;

notify pgrst, 'reload config';
