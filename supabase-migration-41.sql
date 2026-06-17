-- ===========================================================
-- migration-41: BACKFILL de actividad inicial.
--
-- Tras el incidente mig-39 (actividades que no se registraban) hay proyectos
-- sin NINGUNA fila en pro_gestion.activity → la bitácora sale vacía (ej. Medicake).
-- Este script crea un único evento 'project_create' por cada proyecto que hoy
-- no tiene actividad, para que el feed no quede en blanco.
--
-- Seguro:
--   - Solo inserta donde NO existe actividad previa (idempotente; correr 2 veces
--     no duplica).
--   - profile_id = autor real si se conoce (created_by → owner_id), si no NULL
--     (se muestra como "Sistema").
--   - created_at = fecha de creación del proyecto cuando existe; si no, now().
--   - Desactiva temporalmente trg_activity_notify_admins durante el insert para
--     NO spamear a los admins con una notificación por cada proyecto backfilleado.
--
-- No es retroactivo respecto a cambios perdidos: solo siembra el evento base.
-- ===========================================================

do $$
declare
  v_has_created_at boolean;
  v_has_created_by boolean;
begin
  -- Detecta columnas opcionales para armar el insert sin romper si faltan.
  select count(*) > 0 into v_has_created_at
    from information_schema.columns
    where table_schema = 'pro_gestion' and table_name = 'projects' and column_name = 'created_at';
  select count(*) > 0 into v_has_created_by
    from information_schema.columns
    where table_schema = 'pro_gestion' and table_name = 'projects' and column_name = 'created_by';

  -- Evita la lluvia de notificaciones del trigger de mig-39/40 durante el backfill.
  alter table pro_gestion.activity disable trigger trg_activity_notify_admins;

  execute format($f$
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta, created_at)
    select
      p.id,
      coalesce(%s p.owner_id),
      'project_create',
      p.title,
      'sistema',
      jsonb_build_object('backfill', true),
      coalesce(%s now())
    from pro_gestion.projects p
    where not exists (
      select 1 from pro_gestion.activity a where a.project_id = p.id
    )
  $f$,
    case when v_has_created_by then 'p.created_by,' else '' end,
    case when v_has_created_at then 'p.created_at,' else '' end
  );

  alter table pro_gestion.activity enable trigger trg_activity_notify_admins;
exception when others then
  -- Reasegura que el trigger quede habilitado aunque algo falle.
  begin
    alter table pro_gestion.activity enable trigger trg_activity_notify_admins;
  exception when others then null;
  end;
  raise;
end $$;
