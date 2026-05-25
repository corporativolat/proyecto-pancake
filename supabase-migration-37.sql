-- ===========================================================
-- migration-37: hitos automáticos por completitud de fase / proyecto
--
-- Pedido del equipo: además de los hitos manuales, deben crearse hitos
-- automáticos a medida que se cumplen fases (todas sus actividades al 100%)
-- y cuando el proyecto se entrega/finaliza.
--
-- Cambios:
--   1. Añade `milestones.auto_kind` y `milestones.source_id` para identificar
--      hitos auto-generados sin chocar con los manuales.
--   2. Índice UNIQUE PARTIAL sobre (project_id, auto_kind, source_id) cuando
--      auto_kind no es null → garantiza idempotencia (no duplica el mismo hito
--      si la fase se completa/descompleta varias veces).
--   3. Trigger AFTER INSERT/UPDATE en `tasks`: si tras el cambio TODAS las
--      tareas de la fase están en progress=100, inserta un hito
--      "Fase completada: <nombre>" con color verde. Si ya existe, no hace nada.
--   4. Trigger AFTER INSERT/UPDATE en `projects` (status): cuando el proyecto
--      pasa a 'Entregado' o 'Finalizado', crea un hito de cierre de proyecto.
--
-- No interfiere con hitos manuales (siempre tienen auto_kind=null).
-- Idempotente: las columnas usan IF NOT EXISTS, los triggers se reemplazan.
-- ===========================================================

-- 1. Columnas nuevas en milestones
alter table pro_gestion.milestones
  add column if not exists auto_kind text,
  add column if not exists source_id uuid;

comment on column pro_gestion.milestones.auto_kind is
  'Tipo de hito automático: phase_complete | project_entregado | project_finalizado. NULL = hito manual.';
comment on column pro_gestion.milestones.source_id is
  'Para auto_kind=phase_complete: id de la fase. Para project_*: id del proyecto. NULL en manuales.';

-- 2. Índice unique parcial para idempotencia
create unique index if not exists ux_milestones_auto
  on pro_gestion.milestones (project_id, auto_kind, source_id)
  where auto_kind is not null;

-- 3. Trigger: hito por completar fase
create or replace function pro_gestion.handle_task_progress_milestone()
  returns trigger
  language plpgsql
  security definer
  set search_path = pro_gestion, public
as $$
declare
  v_project_id uuid;
  v_phase_name text;
  v_phase_total int;
  v_phase_done int;
  v_phase_id uuid;
begin
  -- Solo nos interesa cuando la tarea queda en progress=100
  if tg_op = 'UPDATE' then
    if coalesce(new.progress, 0) <> 100 then return new; end if;
    if coalesce(old.progress, 0) = 100 then return new; end if;
  elsif tg_op = 'INSERT' then
    if coalesce(new.progress, 0) <> 100 then return new; end if;
  else
    return new;
  end if;

  v_phase_id := new.phase_id;

  select p.project_id, p.name
    into v_project_id, v_phase_name
    from pro_gestion.phases p
   where p.id = v_phase_id;

  if v_project_id is null then return new; end if;

  -- ¿Están TODAS las tareas de la fase al 100?
  select count(*), count(*) filter (where coalesce(progress, 0) = 100)
    into v_phase_total, v_phase_done
    from pro_gestion.tasks
   where phase_id = v_phase_id;

  if v_phase_total > 0 and v_phase_done = v_phase_total then
    insert into pro_gestion.milestones
      (project_id, name, target_date, completed, color, auto_kind, source_id)
    values
      (v_project_id,
       'Fase completada: ' || coalesce(v_phase_name, 'Fase'),
       current_date,
       true,
       '#10b981',
       'phase_complete',
       v_phase_id)
    on conflict (project_id, auto_kind, source_id) where auto_kind is not null
    do nothing;
  end if;

  return new;
end; $$;

drop trigger if exists trg_task_progress_milestone on pro_gestion.tasks;
create trigger trg_task_progress_milestone
  after insert or update of progress, completed on pro_gestion.tasks
  for each row execute function pro_gestion.handle_task_progress_milestone();

-- 4. Trigger: hito al cerrar el proyecto (Entregado / Finalizado)
create or replace function pro_gestion.handle_project_status_milestone()
  returns trigger
  language plpgsql
  security definer
  set search_path = pro_gestion, public
as $$
declare
  v_kind text;
  v_name text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'Entregado' then
    v_kind := 'project_entregado';
    v_name := '🎉 Proyecto entregado';
  elsif new.status = 'Finalizado' then
    v_kind := 'project_finalizado';
    v_name := '✓ Proyecto finalizado';
  else
    return new;
  end if;

  insert into pro_gestion.milestones
    (project_id, name, target_date, completed, color, auto_kind, source_id)
  values
    (new.id, v_name, current_date, true, '#059669', v_kind, new.id)
  on conflict (project_id, auto_kind, source_id) where auto_kind is not null
  do nothing;

  return new;
end; $$;

drop trigger if exists trg_project_status_milestone on pro_gestion.projects;
create trigger trg_project_status_milestone
  after insert or update of status on pro_gestion.projects
  for each row execute function pro_gestion.handle_project_status_milestone();

-- 5. Backfill: para proyectos con fases ya completadas hoy, generar el hito
--    histórico (silenciando triggers para no spam de notif/activity).
do $$
begin
  set local session_replication_role = 'replica';

  insert into pro_gestion.milestones
    (project_id, name, target_date, completed, color, auto_kind, source_id)
  select ph.project_id,
         'Fase completada: ' || ph.name,
         current_date,
         true,
         '#10b981',
         'phase_complete',
         ph.id
    from pro_gestion.phases ph
   where exists (
     select 1 from pro_gestion.tasks t where t.phase_id = ph.id
   )
     and not exists (
     select 1 from pro_gestion.tasks t
      where t.phase_id = ph.id
        and coalesce(t.progress, 0) < 100
   )
  on conflict (project_id, auto_kind, source_id) where auto_kind is not null
  do nothing;

  insert into pro_gestion.milestones
    (project_id, name, target_date, completed, color, auto_kind, source_id)
  select p.id,
         case p.status when 'Entregado' then '🎉 Proyecto entregado' else '✓ Proyecto finalizado' end,
         coalesce(p.delivery_date, current_date),
         true,
         '#059669',
         'project_' || lower(p.status),
         p.id
    from pro_gestion.projects p
   where p.status in ('Entregado','Finalizado')
  on conflict (project_id, auto_kind, source_id) where auto_kind is not null
  do nothing;
end $$;

notify pgrst, 'reload config';
