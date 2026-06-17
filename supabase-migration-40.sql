-- ===========================================================
-- migration-40: HOTFIX de mig-39. El trigger de notificación a admins NO debe
-- poder romper el registro de actividad.
--
-- Causa raíz del incidente "no se montan las actividades del proyecto":
--   mig-39 creó un trigger AFTER INSERT sobre pro_gestion.activity que hace
--   fan-out a notifications. La función referencia columnas que pueden NO existir
--   en una BD donde no se corrieron mig-18 (activity.tag, profiles.notif_inapp_enabled)
--   y mig-20 (profiles.suspended). En PL/pgSQL el cuerpo se valida en RUNTIME:
--   `create function` no falla, pero CADA ejecución lanza excepción. Como el
--   trigger es AFTER INSERT en la MISMA transacción, la excepción ABORTA el
--   insert de la fila de activity → los triggers de auditoría (mig-6/18/34) que
--   escriben activity fallan → la operación original (cambio de proyecto/tarea/
--   hito/comentario) se revierte y NO queda actividad.
--
-- Solución (doble blindaje):
--   1) Toda la lógica de notificación va dentro de un bloque BEGIN/EXCEPTION.
--      Cualquier error (columna faltante, RLS, constraint) se captura y se
--      ignora con un WARNING; el trigger SIEMPRE hace `return new`, por lo que
--      el insert de activity nunca se ve afectado.
--   2) Se detecta dinámicamente si existen las columnas opcionales
--      (profiles.suspended / profiles.notif_inapp_enabled) y se arma el WHERE
--      en consecuencia, así el fan-out funciona aunque esas migraciones falten.
--
-- Idempotente (create or replace).
-- ===========================================================

create or replace function pro_gestion.notify_admins_on_activity() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_title       text;
  v_proj_title  text;
  v_actor       text;
  v_link        text;
  v_has_susp    boolean;
  v_has_inapp   boolean;
begin
  -- Todo dentro de un bloque protegido: la notificación es un EFECTO SECUNDARIO
  -- y jamás debe abortar el insert de la actividad.
  begin
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

    if new.project_id is not null then
      select title into v_proj_title from pro_gestion.projects where id = new.project_id;
      v_link := '/projects/' || new.project_id::text;
    else
      v_link := '/projects';
    end if;

    if new.profile_id is not null then
      select name into v_actor from pro_gestion.profiles where id = new.profile_id;
    end if;

    -- Columnas opcionales (mig-18 / mig-20). Si faltan, no filtramos por ellas.
    select count(*) > 0 into v_has_susp
      from information_schema.columns
      where table_schema = 'pro_gestion' and table_name = 'profiles' and column_name = 'suspended';
    select count(*) > 0 into v_has_inapp
      from information_schema.columns
      where table_schema = 'pro_gestion' and table_name = 'profiles' and column_name = 'notif_inapp_enabled';

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
      jsonb_build_object('activity_id', new.id, 'activity_kind', new.kind)
    from pro_gestion.profiles p
    where p.role in ('super_admin', 'admin', 'gerente')
      and p.id is distinct from new.profile_id
      and (not v_has_susp  or coalesce(p.suspended, false) = false)
      and (not v_has_inapp or coalesce(p.notif_inapp_enabled, true) = true);

  exception when others then
    -- Nunca propagar: la actividad debe quedar registrada sí o sí.
    raise warning 'notify_admins_on_activity fallo (ignorado): %', sqlerrm;
  end;

  return new;
end; $$;

-- Reasegura el trigger (no-op si ya existe igual).
drop trigger if exists trg_activity_notify_admins on pro_gestion.activity;
create trigger trg_activity_notify_admins after insert on pro_gestion.activity
for each row execute function pro_gestion.notify_admins_on_activity();
