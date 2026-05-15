-- ===========================================================
-- migration-22: progreso por actividad + sync con `completed`.
--
-- `tasks.progress` smallint 0-100. La actividad ya no es solo
-- hecho/no-hecho: lleva un porcentaje. El checkbox de la UI es
-- un atajo (0 o 100). El trigger deriva `completed` del progreso
-- para mantener ambas columnas consistentes — el cliente solo
-- necesita escribir `progress`.
--
-- Idempotente.
-- ===========================================================

-- 1. Columna progress (0-100).
alter table pro_gestion.tasks
  add column if not exists progress smallint not null default 0
  check (progress between 0 and 100);

-- 2. Backfill: las tareas ya completadas pasan a 100%.
update pro_gestion.tasks set progress = 100 where completed = true and progress = 0;

-- 3. Trigger: `completed` siempre se deriva de `progress`.
--    Una tarea está completa <=> progress = 100.
create or replace function pro_gestion.sync_task_completed()
returns trigger
language plpgsql
as $$
begin
  new.completed := (new.progress = 100);
  return new;
end;
$$;

drop trigger if exists trg_sync_task_completed on pro_gestion.tasks;
create trigger trg_sync_task_completed
  before insert or update on pro_gestion.tasks
  for each row execute function pro_gestion.sync_task_completed();
