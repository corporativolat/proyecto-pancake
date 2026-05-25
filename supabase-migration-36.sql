-- ===========================================================
-- migration-36: dedup + sync proyectos con Excel "Resumen" operativo
--
-- Causa raíz:
--   - mig-14 seedeó 16 proyectos con títulos LARGOS (ej. "Gintracom: integración
--     con una transportadora (Dominica)").
--   - mig-34 seedeó 25 proyectos con títulos CORTOS (ej. "Gintracom:
--     Transportadora (Dominica)") creyendo que `WHERE NOT EXISTS lower(title)`
--     detectaría los previos. NO los detectó porque los textos diferían →
--     creó FILAS DUPLICADAS para 4 proyectos.
--   - mig-35 corrigió los títulos al canónico aplicando UPDATE WHERE
--     lower(title) IN (...). Resultado: dos filas con el MISMO título final.
--   - Además, mig-34 hizo INSERT WHERE NOT EXISTS → los 11 proyectos de mig-14
--     NO recibieron los campos nuevos del Excel: priority, extra_category_ids,
--     status actualizado, manual_progress, fechas, owner.
--
-- Este migration:
--
--   PARTE 1 — DEDUP de los 4 clusters duplicados:
--     Conserva la fila más antigua (created_at ASC) por título canónico.
--     Reasigna todos los hijos al kept row (phases, milestones, project_members,
--     comments, activity, documents, notifications, project_questionnaires).
--     Copia al kept row los campos del Excel que sólo trae el row más nuevo
--     (priority, extra_category_ids, status, manual_progress, dates, owner).
--     DELETE de los rows duplicados.
--
--   PARTE 2 — SYNC de las 11 filas mig-14 con los datos del Excel:
--     UPDATE puro de priority, extra_category_ids, status, manual_progress,
--     start_date, projected_end_date, owner_id, owner_label.
--     Dates usan COALESCE para no pisar ediciones manuales si hay valor.
--     priority / status / manual_progress se sobreescriben (el reclamo del
--     equipo es que estos campos siguen con valores viejos).
--
-- Idempotente: la dedup detecta clusters con >1 fila y los procesa; la sync
-- aplica valores deterministas. Correr varias veces produce el mismo estado.
-- ===========================================================

-- =============================================================
-- PARTE 1: DEDUP de los 4 clusters
-- =============================================================
do $$
declare
  v_keep uuid;
  v_drop uuid[];
  v_d uuid;
  v_title text;
  v_canonical_titles text[] := array[
    'Gintracom: integración con una transportadora (Dominica)',
    'Gintracom: integración con una transportadora (Ecuador - Guatemala)',
    'Integracion con EFFI',
    'Producto para Restaurantes'
  ];
begin
  foreach v_title in array v_canonical_titles loop
    -- Conservamos la fila más antigua (la de mig-14, que tiene goal/observation
    -- canónicos vía mig-35).
    select id into v_keep
      from pro_gestion.projects
     where lower(title) = lower(v_title)
     order by created_at asc
     limit 1;

    if v_keep is null then
      continue;
    end if;

    -- Resto = a borrar. Antes copiamos los campos Excel-only del más nuevo.
    select array_agg(id) into v_drop
      from pro_gestion.projects
     where lower(title) = lower(v_title)
       and id <> v_keep;

    if v_drop is null or array_length(v_drop, 1) = 0 then
      continue;
    end if;

    -- Merge Excel fields del row más nuevo (el primero del array de drops, que
    -- tendrá priority/extra_category_ids seteados por mig-34) hacia el keep.
    update pro_gestion.projects k
       set priority           = coalesce(k.priority, n.priority),
           extra_category_ids = case when array_length(k.extra_category_ids, 1) is null
                                     then n.extra_category_ids
                                     else k.extra_category_ids end,
           status             = case when n.priority is not null then n.status else k.status end,
           manual_progress    = coalesce(n.manual_progress, k.manual_progress),
           start_date         = coalesce(k.start_date, n.start_date),
           projected_end_date = coalesce(k.projected_end_date, n.projected_end_date),
           owner_id           = coalesce(k.owner_id, n.owner_id),
           owner_label        = case when (k.owner_id is null and (k.owner_label is null or k.owner_label = ''))
                                     then n.owner_label else k.owner_label end,
           observation        = case when (k.observation is null or k.observation = '')
                                     then n.observation else k.observation end
      from pro_gestion.projects n
     where k.id = v_keep
       and n.id = v_drop[1];

    -- Reasignar hijos al keep antes de borrar
    foreach v_d in array v_drop loop
      update pro_gestion.phases               set project_id = v_keep where project_id = v_d;
      update pro_gestion.milestones           set project_id = v_keep where project_id = v_d;
      update pro_gestion.comments             set project_id = v_keep where project_id = v_d;
      update pro_gestion.activity             set project_id = v_keep where project_id = v_d;

      -- project_members: PK (project_id, profile_id) → evitar colisión
      insert into pro_gestion.project_members (project_id, profile_id)
      select v_keep, pm.profile_id
        from pro_gestion.project_members pm
       where pm.project_id = v_d
      on conflict do nothing;
      delete from pro_gestion.project_members where project_id = v_d;

      -- Tablas opcionales (existen tras mig-20/21/29). Guard con to_regclass.
      if to_regclass('pro_gestion.documents') is not null then
        execute format('update pro_gestion.documents set project_id = %L where project_id = %L', v_keep, v_d);
      end if;
      if to_regclass('pro_gestion.notifications') is not null then
        execute format('update pro_gestion.notifications set project_id = %L where project_id = %L', v_keep, v_d);
      end if;
      if to_regclass('pro_gestion.project_questionnaires') is not null then
        execute format('update pro_gestion.project_questionnaires set project_id = %L where project_id = %L', v_keep, v_d);
      end if;

      delete from pro_gestion.projects where id = v_d;
    end loop;
  end loop;
end $$;

-- =============================================================
-- PARTE 2: SYNC de las 11 filas mig-14 con los datos del Excel
-- =============================================================

-- Helpers locales: lookups por nombre.
do $$
declare
  v_cat_param          uuid;
  v_cat_alianza        uuid;
  v_cat_integrac       uuid;
  v_cat_prod_esp       uuid;
  v_cat_innov          uuid;
  v_cat_curso          uuid;
  v_steven uuid; v_michell uuid; v_steban uuid; v_andres uuid;
begin
  select id into v_cat_param      from pro_gestion.categories where name = 'Parametrizaciones'        limit 1;
  select id into v_cat_alianza    from pro_gestion.categories where name = 'Alianza comercial'        limit 1;
  select id into v_cat_integrac   from pro_gestion.categories where name = 'Integraciones'            limit 1;
  select id into v_cat_prod_esp   from pro_gestion.categories where name = 'Productos específicos'    limit 1;
  select id into v_cat_innov      from pro_gestion.categories where name = 'Innovación y Desarrollo'  limit 1;
  select id into v_cat_curso      from pro_gestion.categories where name = 'Curso | Lanzamientos'     limit 1;

  select id into v_steven  from pro_gestion.profiles where lower(name) = lower('Steven Machado')  limit 1;
  select id into v_michell from pro_gestion.profiles where lower(name) = lower('Michell Ocampo')  limit 1;
  select id into v_steban  from pro_gestion.profiles where lower(name) = lower('Steban Cataño')   limit 1;
  select id into v_andres  from pro_gestion.profiles where lower(name) = lower('Andrés Bucheli')  limit 1;

  -- 1. Antonia Villa: Entregado 100%, fechas, Michell, multi-cat (Param + Alianza)
  update pro_gestion.projects set
    status             = 'Entregado',
    manual_progress    = 100,
    category_id        = coalesce(category_id, v_cat_param),
    extra_category_ids = case when array_length(extra_category_ids,1) is null and v_cat_alianza is not null
                              then array[v_cat_alianza]::uuid[] else extra_category_ids end,
    owner_id           = coalesce(owner_id, v_michell),
    start_date         = coalesce(start_date, '2025-12-11'::date),
    projected_end_date = coalesce(projected_end_date, '2026-01-13'::date)
  where lower(title) = lower('Antonia Villa');

  -- 2. Cristian Effix: En Desarrollo 95%, Andrés, dates
  --    NOTA: projected_end_date se sobreescribe (mig-14 dejó '2026-04-30',
  --    el Excel dice '2026-04-15').
  update pro_gestion.projects set
    status             = 'En Desarrollo',
    manual_progress    = 95,
    category_id        = coalesce(category_id, v_cat_param),
    owner_id           = coalesce(owner_id, v_andres),
    start_date         = coalesce(start_date, '2025-10-01'::date),
    projected_end_date = '2026-04-15'::date
  where lower(title) = lower('Cristian Effix');

  -- 3. Randolph Rodas Guatemala: En Desarrollo 85%, Steven, dates
  --    NOTA: projected_end_date se sobreescribe (mig-14 dejó '2026-04-30',
  --    el Excel dice '2026-04-15').
  update pro_gestion.projects set
    status             = 'En Desarrollo',
    manual_progress    = 85,
    category_id        = coalesce(category_id, v_cat_param),
    owner_id           = coalesce(owner_id, v_steven),
    start_date         = coalesce(start_date, '2026-02-12'::date),
    projected_end_date = '2026-04-15'::date
  where lower(title) = lower('Randolph Rodas Guatemala');

  -- 4. Organic Ecom: En Desarrollo 20%, Steven, dates
  update pro_gestion.projects set
    status             = 'En Desarrollo',
    manual_progress    = 20,
    category_id        = coalesce(category_id, v_cat_param),
    owner_id           = coalesce(owner_id, v_steven),
    start_date         = coalesce(start_date, '2026-04-24'::date),
    projected_end_date = coalesce(projected_end_date, '2026-06-25'::date)
  where lower(title) = lower('Organic Ecom');

  -- 5. Jesús Gómez: Cancelado 0%, Steven, dates
  update pro_gestion.projects set
    status             = 'Cancelado',
    manual_progress    = 0,
    category_id        = coalesce(category_id, v_cat_alianza),
    owner_id           = coalesce(owner_id, v_steven),
    start_date         = coalesce(start_date, '2026-04-13'::date),
    projected_end_date = coalesce(projected_end_date, '2026-05-12'::date)
  where lower(title) = lower('Jesús Gómez');

  -- 6. Tienda Nube: Validación de viabilidad 100%, atencion ⚠️, Steban, dates
  update pro_gestion.projects set
    status             = 'Validación de viabilidad',
    manual_progress    = 100,
    priority           = coalesce(priority, 'atencion'),
    category_id        = coalesce(category_id, v_cat_integrac),
    owner_id           = coalesce(owner_id, v_steban),
    start_date         = coalesce(start_date, '2025-01-10'::date)
  where lower(title) = lower('Tienda Nube');

  -- 7. Integración ALICLICK: En Desarrollo 80%, Steban, dates
  update pro_gestion.projects set
    status             = 'En Desarrollo',
    manual_progress    = 80,
    category_id        = coalesce(category_id, v_cat_integrac),
    owner_id           = coalesce(owner_id, v_steban),
    start_date         = coalesce(start_date, '2025-08-26'::date),
    projected_end_date = coalesce(projected_end_date, '2026-06-05'::date)
  where lower(title) = lower('Integración ALICLICK');

  -- 8. Waguard software: Pendiente de información 99%, atencion ⚠️, Steven
  update pro_gestion.projects set
    status             = 'Pendiente de información',
    manual_progress    = 99,
    priority           = coalesce(priority, 'atencion'),
    category_id        = coalesce(category_id, v_cat_innov),
    owner_id           = coalesce(owner_id, v_steven)
  where lower(title) = lower('Waguard software');

  -- 9. Producto para Restaurantes: En Pausa 99%, Michell, dates
  update pro_gestion.projects set
    status             = 'En Pausa',
    manual_progress    = 99,
    category_id        = coalesce(category_id, v_cat_prod_esp),
    owner_id           = coalesce(owner_id, v_michell),
    start_date         = coalesce(start_date, '2025-08-10'::date)
  where lower(title) = lower('Producto para Restaurantes');

  -- 10. CakeMedic: Validación de viabilidad 99%, atencion ⚠️, Steven, fin 2026-05-07
  update pro_gestion.projects set
    status             = 'Validación de viabilidad',
    manual_progress    = 99,
    priority           = coalesce(priority, 'atencion'),
    category_id        = coalesce(category_id, v_cat_prod_esp),
    owner_id           = coalesce(owner_id, v_steven),
    projected_end_date = coalesce(projected_end_date, '2026-05-07'::date)
  where lower(title) = lower('CakeMedic');

  -- 11. Gaston Argentina: Planeación 10%, Michell, dates, multi-cat (Alianza + Param)
  update pro_gestion.projects set
    status             = 'Planeación',
    manual_progress    = 10,
    category_id        = coalesce(category_id, v_cat_alianza),
    extra_category_ids = case when array_length(extra_category_ids,1) is null and v_cat_param is not null
                              then array[v_cat_param]::uuid[] else extra_category_ids end,
    owner_id           = coalesce(owner_id, v_michell),
    owner_label        = case when owner_id is null and v_michell is null then 'Michell Ocampo' else owner_label end,
    start_date         = coalesce(start_date, '2026-05-04'::date),
    projected_end_date = coalesce(projected_end_date, '2026-06-04'::date)
  where lower(title) = lower('Gaston Argentina');

  -- 12. Santiago (Legacy): Cancelado
  update pro_gestion.projects set
    status             = 'Cancelado',
    manual_progress    = 0,
    category_id        = coalesce(category_id, v_cat_alianza)
  where lower(title) = lower('Santiago (Legacy)');

  -- 13. Integración Mercado Libre: En Desarrollo 90%, Steban, dates
  update pro_gestion.projects set
    status             = 'En Desarrollo',
    manual_progress    = 90,
    category_id        = coalesce(category_id, v_cat_integrac),
    owner_id           = coalesce(owner_id, v_steban),
    start_date         = coalesce(start_date, '2026-04-24'::date),
    projected_end_date = coalesce(projected_end_date, '2026-05-30'::date)
  where lower(title) = lower('Integración Mercado Libre');

  -- =========================================================
  -- Bonus: refrescar también las dedup-survivors con los datos
  -- canónicos del Excel (priority/dates/status) por si la merge
  -- de PARTE 1 dejó priority null (cluster donde no había row mig-34).
  -- =========================================================

  -- Gintracom Dominica: En Desarrollo 65%, Steban
  update pro_gestion.projects set
    status             = 'En Desarrollo',
    manual_progress    = coalesce(manual_progress, 65),
    category_id        = coalesce(category_id, v_cat_integrac),
    owner_id           = coalesce(owner_id, v_steban),
    start_date         = coalesce(start_date, '2026-02-25'::date),
    projected_end_date = coalesce(projected_end_date, '2026-05-30'::date)
  where lower(title) = lower('Gintracom: integración con una transportadora (Dominica)');

  -- Gintracom Ecuador-Guatemala: Validación de viabilidad 99%, Steban
  update pro_gestion.projects set
    status             = 'Validación de viabilidad',
    manual_progress    = 99,
    category_id        = coalesce(category_id, v_cat_integrac),
    owner_id           = coalesce(owner_id, v_steban),
    start_date         = coalesce(start_date, '2026-02-25'::date),
    projected_end_date = coalesce(projected_end_date, '2026-05-30'::date)
  where lower(title) = lower('Gintracom: integración con una transportadora (Ecuador - Guatemala)');

  -- Integracion con EFFI: Cancelado 50%, Steban
  update pro_gestion.projects set
    status             = 'Cancelado',
    manual_progress    = 50,
    category_id        = coalesce(category_id, v_cat_integrac),
    owner_id           = coalesce(owner_id, v_steban),
    start_date         = coalesce(start_date, '2025-08-28'::date)
  where lower(title) = lower('Integracion con EFFI');
end $$;

-- =============================================================
-- PARTE 3: Backfill de bloqueos (columna BLOQUEO del Excel)
--
-- Solo se rellena `blocker_note` donde está vacío para no pisar bloqueos
-- editados manualmente en producción. Suspende triggers durante el bloque
-- para evitar spam de notif/activity (no es un bloqueo nuevo, es backfill).
-- =============================================================
do $$
begin
  set local session_replication_role = 'replica';

  with seed(title, note) as (values
    ('Camilo Hotmart',                                                 'Mauricio sin respuesta'),
    ('Cake Barber',                                                    'Alianza debe finalizarse'),
    ('Ruta infoproductos',                                             'Alta carga laboral'),
    ('Ruta Tiktok',                                                    'Alta carga laboral'),
    ('Cristian Effix',                                                 'Problemas IA / bidireccionalidad'),
    ('Randolph Rodas Guatemala',                                       'Entrega de info hasta 8/5'),
    ('Organic Ecom',                                                   'Recibir info lunes 11'),
    ('Gintracom: integración con una transportadora (Dominica)',       'Asia 35% desarrollo'),
    ('Integración ALICLICK',                                           'API modificada, Asia actualiza'),
    ('Integración Mercado Libre',                                      'Asia entrega 30/mayo'),
    ('Sincronización Envios (Pos | Webcake)',                          'Asia desarrollando'),
    ('Agencia Livecake (Alex effix)',                                  'Aguardando respuesta del cliente'),
    ('Gintracom: integración con una transportadora (Ecuador - Guatemala)', 'Necesita testers reales'),
    ('Tienda Nube',                                                    'Marketing/Ventas deben lanzar'),
    ('CakeMedic',                                                      'Desacuerdo tester gratuito'),
    ('Antonia Villa',                                                  'Necesita cierre Mauro'),
    ('Jesús Gómez',                                                    'Paralizado: cliente sin activos Meta'),
    ('Integracion con EFFI',                                           'Sugerir cancelación de la relación'),
    ('Producto para Restaurantes',                                     'Aguardando tester'),
    ('Waguard software',                                               'Falta responsable de mantenimiento'),
    ('Nicolas Argentina',                                              'Alianza pendiente')
  )
  update pro_gestion.projects p
     set blocker_note  = s.note,
         blocker_since = coalesce(p.blocker_since, now())
    from seed s
   where lower(p.title) = lower(s.title)
     and (p.blocker_note is null or btrim(p.blocker_note) = '');
end $$;

-- =============================================================
-- Reload PostgREST cache
-- =============================================================
notify pgrst, 'reload config';
