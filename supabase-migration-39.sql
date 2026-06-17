-- ===========================================================
-- migration-39: notificación a admins/gerentes ante CUALQUIER actividad
-- en proyectos (creación, edición, status, fechas, hitos, tareas, comentarios…).
--
-- Pedido del equipo: cada vez que alguien hace un cambio en un proyecto,
-- a los administradores/gerentes les debe llegar una notificación in-app, sin
-- mantener una lista de personas a mano. Se resuelve por ROL: cualquier
-- super_admin / admin / gerente recibe la notif automáticamente.
--
-- Toda la actividad del sistema ya desemboca en pro_gestion.activity (triggers
-- de mig-6/18/34 + logs manuales del cliente), así que un único trigger AFTER
-- INSERT sobre activity cubre TODO de forma genérica.
--
-- Reglas:
--   - Destinatarios: profiles con role in (super_admin, admin, gerente).
--   - NO se notifica al autor del cambio (new.profile_id).
--   - Respeta profiles.notif_inapp_enabled (default true) y salta suspendidos.
--   - kind de la notif = 'project_activity'. meta guarda el kind real + tag.
--
-- Idempotente (create or replace + drop trigger if exists).
-- ===========================================================

create or replace function pro_gestion.notify_admins_on_activity() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_title       text;
  v_proj_title  text;
  v_actor       text;
  v_link        text;
begin
  -- Etiqueta legible del tipo de evento (cubre kinds de mig-6/18/34; fallback genérico).
  v_title := case new.kind
    when 'project_create'           then 'Proyecto creado'
    when 'project_delete'           then 'Proyecto eliminado'
    when 'project_status'           then 'Cambio de estado'
    when 'project_status_change'    then 'Cambio de estado'
    when 'project_owner_change'     then 'Cambio de responsable'
    when 'project_date_change'      then 'Cambio de fechas'
    when 'project_delivery_change'  then 'Cambio de entrega'
    when 'project_contract_update'  then 'Contrato actualizado'
    when 'project_priority_change'  then 'Cambio de prioridad'
    when 'project_blocked'          then 'Proyecto bloqueado'
    when 'project_unblocked'        then 'Proyecto desbloqueado'
    when 'task_create'              then 'Nueva actividad'
    when 'task_complete'            then 'Actividad completada'
    when 'task_uncomplete'          then 'Actividad reabierta'
    when 'phase_create'             then 'Nueva etapa'
    when 'comment_add'              then 'Nuevo comentario'
    when 'milestone_create'         then 'Nuevo hito'
    when 'milestone_complete'       then 'Hito completado'
    when 'milestone_uncomplete'     then 'Hito reabierto'
    else 'Actividad en proyecto'
  end;

  -- Título del proyecto (puede ser null si es un project_delete).
  if new.project_id is not null then
    select title into v_proj_title from pro_gestion.projects where id = new.project_id;
    v_link := '/projects/' || new.project_id::text;
  else
    v_link := '/projects';
  end if;

  -- Nombre del autor del cambio.
  if new.profile_id is not null then
    select name into v_actor from pro_gestion.profiles where id = new.profile_id;
  end if;

  -- Fan-out a admins/gerentes (excluye al autor; respeta flag in-app y suspensión).
  insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
  select
    p.id,
    'project_activity',
    v_title,
    coalesce(v_proj_title, 'Proyecto')
      || ' · ' || coalesce(v_actor, 'Alguien')
      || coalesce(' — ' || nullif(new.detail, ''), ''),
    v_link,
    new.project_id,
    jsonb_build_object('activity_id', new.id, 'activity_kind', new.kind, 'tag', new.tag)
  from pro_gestion.profiles p
  where p.role in ('super_admin', 'admin', 'gerente')
    and p.id is distinct from new.profile_id
    and coalesce(p.suspended, false) = false
    and coalesce(p.notif_inapp_enabled, true) = true;

  return new;
end; $$;

drop trigger if exists trg_activity_notify_admins on pro_gestion.activity;
create trigger trg_activity_notify_admins after insert on pro_gestion.activity
for each row execute function pro_gestion.notify_admins_on_activity();
