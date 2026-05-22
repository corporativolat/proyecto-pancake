-- ===========================================================
-- migration-34: alinear projects con el Excel operativo "Resumen".
--
-- Añade lo que el equipo gestiona en su sheet hoy pero falta en la BD:
--
--   1. priority text  (null | 'estrella' | 'atencion')
--      → equivalente a la columna ATENCIÓN del Excel (⭐ / ⚠️ / vacío).
--      → notificación automática a owner + miembros al cambiar.
--
--   2. extra_category_ids uuid[]
--      → multi-categoría. El Excel acepta combos como
--        "Alianza comercial, Parametrizaciones". Mantenemos category_id
--        como primaria (back-compat con queries y dashboards existentes)
--        y este array para las secundarias. Índice GIN para filtrar.
--
--   3. status check: añade 'Cancelado'
--      → el Excel tiene "7. Cancelado"; la BD no lo aceptaba.
--      → NO se reemplaza ningún estado existente.
--
--   4. blocker_note text + blocker_since timestamptz
--      → registro estructurado de bloqueo activo. Cuando blocker_note
--        pasa de vacío a algo, se sella blocker_since = now() y se
--        notifica al owner + miembros + admins (kind='project_blocked').
--      → cuando se limpia el blocker (vuelve a '' o NULL) también se
--        limpia blocker_since automáticamente.
--
--   5. Trigger de cambio de prioridad → notif kind='project_priority_change'.
--
--   6. Seed idempotente de los 25 proyectos del Excel actual (mayo 2026).
--      Solo INSERT WHERE NOT EXISTS por title — no toca proyectos editados.
--
-- Idempotente. No requiere ajustes RLS (los campos nuevos viajan bajo
-- las policies *_read/*_write ya definidas).
-- ===========================================================

-- =============================================================
-- 1. Prioridad (columna ATENCIÓN del Excel)
-- =============================================================
alter table pro_gestion.projects
  add column if not exists priority text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_priority_check'
  ) then
    alter table pro_gestion.projects
      add constraint projects_priority_check
      check (priority is null or priority in ('estrella','atencion'));
  end if;
end $$;

comment on column pro_gestion.projects.priority
  is 'Marcador de atención del Excel "Resumen": estrella (⭐) | atencion (⚠️) | NULL (normal).';

create index if not exists idx_projects_priority
  on pro_gestion.projects (priority)
  where priority is not null;

-- =============================================================
-- 2. Multi-categoría (TIPO con coma en Excel)
-- =============================================================
alter table pro_gestion.projects
  add column if not exists extra_category_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_projects_extra_categories
  on pro_gestion.projects using gin (extra_category_ids);

comment on column pro_gestion.projects.extra_category_ids
  is 'Categorías adicionales del proyecto (multi-TIPO del Excel). La primaria sigue siendo projects.category_id.';

-- =============================================================
-- 3. Status: añadir "Cancelado" si la columna tenía CHECK previo.
--    En BDs sin CHECK explícito (default text libre) no rompe nada.
-- =============================================================
do $$
declare
  v_check_name text;
begin
  select conname into v_check_name
  from pg_constraint
  where conrelid = 'pro_gestion.projects'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if v_check_name is not null then
    execute format('alter table pro_gestion.projects drop constraint %I', v_check_name);
  end if;
end $$;

alter table pro_gestion.projects
  add constraint projects_status_check
  check (status in (
    'No iniciado',
    'Planeación',
    'En Desarrollo',
    'En Pausa',
    'Pendiente de información',
    'Validación de viabilidad',
    'Finalizado',
    'Entregado',
    'Cancelado'
  ));

-- =============================================================
-- 4. Bloqueo activo (riesgo / impedimento estructurado)
-- =============================================================
alter table pro_gestion.projects
  add column if not exists blocker_note text not null default '',
  add column if not exists blocker_since timestamptz;

comment on column pro_gestion.projects.blocker_note
  is 'Descripción libre del bloqueo activo. Cadena vacía = sin bloqueo.';
comment on column pro_gestion.projects.blocker_since
  is 'Timestamp en que se registró el bloqueo activo. Se sella/limpia vía trigger.';

-- =============================================================
-- 5. Trigger: cambios de priority → notif a owner + miembros
-- =============================================================
create or replace function pro_gestion.notify_project_priority_change() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_title text;
  v_label text;
begin
  if tg_op = 'UPDATE' and new.priority is not distinct from old.priority then
    return new;
  end if;

  v_title := coalesce(new.title, 'Proyecto');
  v_label := case new.priority
    when 'estrella' then 'Marcado como ⭐ Estrella'
    when 'atencion' then 'Marcado como ⚠️ Atención'
    else 'Prioridad reseteada'
  end;

  -- Owner
  if new.owner_id is not null then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      new.owner_id,
      'project_priority_change',
      v_label,
      v_title,
      '/projects/' || new.id::text,
      new.id,
      jsonb_build_object('priority_old', old.priority, 'priority_new', new.priority)
    );
  end if;

  -- Miembros del proyecto (excluyendo al owner para no duplicar)
  insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
  select pm.profile_id,
         'project_priority_change',
         v_label,
         v_title,
         '/projects/' || new.id::text,
         new.id,
         jsonb_build_object('priority_old', old.priority, 'priority_new', new.priority)
  from pro_gestion.project_members pm
  where pm.project_id = new.id
    and pm.profile_id is distinct from new.owner_id;

  return new;
end; $$;

drop trigger if exists trg_projects_priority_change on pro_gestion.projects;
create trigger trg_projects_priority_change
  after update of priority on pro_gestion.projects
  for each row execute function pro_gestion.notify_project_priority_change();

-- =============================================================
-- 6. Trigger: bloqueo (sella blocker_since + notif al equipo)
-- =============================================================
create or replace function pro_gestion.handle_project_blocker() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_was_blocked boolean;
  v_is_blocked  boolean;
  v_title text;
begin
  v_was_blocked := coalesce(nullif(trim(coalesce(old.blocker_note,'')),''), null) is not null;
  v_is_blocked  := coalesce(nullif(trim(coalesce(new.blocker_note,'')),''), null) is not null;

  -- Auto-sellar blocker_since cuando aparece el bloqueo
  if v_is_blocked and not v_was_blocked then
    new.blocker_since := coalesce(new.blocker_since, now());
  end if;
  -- Auto-limpiar blocker_since cuando se quita
  if not v_is_blocked and v_was_blocked then
    new.blocker_since := null;
  end if;

  return new;
end; $$;

drop trigger if exists trg_projects_blocker_seal on pro_gestion.projects;
create trigger trg_projects_blocker_seal
  before update of blocker_note on pro_gestion.projects
  for each row execute function pro_gestion.handle_project_blocker();

-- Notif AFTER (separamos para que pueda usar new.* finales)
create or replace function pro_gestion.notify_project_blocker() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_was_blocked boolean := coalesce(nullif(trim(coalesce(old.blocker_note,'')),''), null) is not null;
  v_is_blocked  boolean := coalesce(nullif(trim(coalesce(new.blocker_note,'')),''), null) is not null;
  v_title text := coalesce(new.title, 'Proyecto');
begin
  if v_is_blocked and not v_was_blocked then
    -- Notif al owner
    if new.owner_id is not null then
      insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
      values (
        new.owner_id, 'project_blocked',
        '🚧 Bloqueo en ' || v_title,
        left(new.blocker_note, 240),
        '/projects/' || new.id::text,
        new.id,
        jsonb_build_object('blocker', new.blocker_note)
      );
    end if;
    -- Miembros del proyecto
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    select pm.profile_id, 'project_blocked',
           '🚧 Bloqueo en ' || v_title,
           left(new.blocker_note, 240),
           '/projects/' || new.id::text,
           new.id,
           jsonb_build_object('blocker', new.blocker_note)
    from pro_gestion.project_members pm
    where pm.project_id = new.id
      and pm.profile_id is distinct from new.owner_id;

    -- Activity log
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (
      new.id, auth.uid(), 'project_blocked',
      'Bloqueo registrado: ' || left(new.blocker_note, 200),
      'bloqueo',
      jsonb_build_object('blocker', new.blocker_note)
    );
  elsif not v_is_blocked and v_was_blocked then
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (
      new.id, auth.uid(), 'project_unblocked',
      'Bloqueo resuelto',
      'avance',
      jsonb_build_object('previous', old.blocker_note)
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_projects_blocker_notify on pro_gestion.projects;
create trigger trg_projects_blocker_notify
  after update of blocker_note on pro_gestion.projects
  for each row execute function pro_gestion.notify_project_blocker();

-- =============================================================
-- 7. Seed idempotente: los 25 proyectos del Excel "Resumen" (mayo 2026)
--    UPSERT NO: solo añadimos los que no existen por title (case-insensitive).
--    owner_id resuelve por name; si no hay match, queda NULL y owner_label se
--    rellena con el nombre crudo del Excel.
--    category_id resuelve por la primera categoría nombrada; las adicionales
--    van a extra_category_ids.
-- =============================================================
do $$
declare
  v_admin uuid;
  rec record;
  v_cat_primary uuid;
  v_cat_extra uuid[];
  v_owner_id uuid;
  v_cat_names text[];
  v_cn text;
  v_cat_id uuid;
begin
  select id into v_admin from pro_gestion.profiles
   where role in ('super_admin','admin') order by created_at limit 1;

  for rec in
    with seed(title, type_names, owner_name, status, progress, start, proj_end, priority, observation) as (
      values
        ('Camilo Hotmart',                       array['Alianza comercial','Parametrizaciones'], 'Steven Machado',  'No iniciado',                0,   null::date, null::date, 'estrella'::text,
         'Cierre alianza 15/05/2026; Mauricio sin respuesta'),
        ('Cake Barber',                          array['Productos específicos'],                 'Steven Machado',  'No iniciado',                0,   null,       null,       null,
         'Alianza debe finalizarse; Mauricio retrasado'),
        ('Gaston Argentina',                     array['Alianza comercial','Parametrizaciones'], 'Michell Ocampo',  'Planeación',                 10,  '2026-05-04'::date, '2026-06-04'::date, null,
         'Planeando migración (parcial)'),
        ('Ruta Infoproductos',                   array['Curso | Lanzamientos'],                  'Steban Cataño',   'Planeación',                 15,  null,       null,       null,
         'Inicia ~18/05 post-certificación'),
        ('Ruta Tiktok',                          array['Curso | Lanzamientos'],                  'Steban Cataño',   'Planeación',                 20,  null,       null,       null,
         'Inicia ~18/05 post-certificación'),
        ('Cristian Effix',                       array['Parametrizaciones'],                     'Andrés Bucheli',  'En Desarrollo',              95,  '2025-10-01'::date, '2026-04-15'::date, null,
         'Problemas con IA/bidireccionalidad; cierre 30/04'),
        ('Randolph Rodas Guatemala',             array['Parametrizaciones'],                     'Steven Machado',  'En Desarrollo',              85,  '2026-02-12'::date, '2026-04-15'::date, null,
         'Pendiente LiveCake; cliente sin info; entrega hasta 08/05'),
        ('Organic Ecom',                         array['Parametrizaciones'],                     'Steven Machado',  'En Desarrollo',              20,  '2026-04-24'::date, '2026-06-25'::date, null,
         'Inicio 24/04; error TikTok corregido; debe entregar 30/05'),
        ('Gintracom: Transportadora (Dominica)', array['Integraciones'],                         'Steban Cataño',   'En Desarrollo',              65,  '2026-02-25'::date, '2026-05-30'::date, null,
         'República Dominicana pendiente; Asia 35% desarrollo'),
        ('Integración ALICLICK',                 array['Integraciones'],                         'Steban Cataño',   'En Desarrollo',              80,  '2025-08-26'::date, '2026-06-05'::date, null,
         'API cancelación pendiente; entrega ~5/06'),
        ('Integración Mercado Libre',            array['Integraciones'],                         'Steban Cataño',   'En Desarrollo',              90,  '2026-04-24'::date, '2026-05-30'::date, null,
         'Asia desarrollando; entrega 30/05'),
        ('Sincronización Envíos (POS/Webcake)',  array['Integraciones'],                         'Steven Machado',  'En Desarrollo',              10,  null,               '2026-05-30'::date, null,
         'Sin inicio; Asia desarrollo; 30/05 entrega'),
        ('Agencia Livecake (Alex Effix)',        array['Alianza comercial'],                     'Steven Machado',  'En Desarrollo',              70,  null,       null,       null,
         'LP ajuste enviado; aguardando retorno'),
        ('Gintracom (Ecuador-Guatemala)',        array['Integraciones'],                         'Steban Cataño',   'Validación de viabilidad',   99,  '2026-02-25'::date, '2026-05-30'::date, null,
         'Desarrollo completado; buscar tester real'),
        ('Tienda Nube',                          array['Integraciones'],                         'Steban Cataño',   'Validación de viabilidad',  100,  '2025-01-10'::date, null,       'atencion',
         'Todo listo; FALTA: lanzamiento Marketing/Ventas'),
        ('CakeMedic',                            array['Productos específicos'],                 'Steven Machado',  'Validación de viabilidad',   99,  null,               '2026-05-07'::date, 'atencion',
         'Ajustes Michell; desacuerdo Steven-tester gratuito'),
        ('Antonia Villa',                        array['Parametrizaciones','Alianza comercial'], 'Michell Ocampo',  'Entregado',                 100,  '2025-12-11'::date, '2026-01-13'::date, null,
         'Entregado 16/04; testeo bidireccionalidad; requiere cierre Mauro'),
        ('Jesús Gómez',                          array['Alianza comercial'],                     'Steven Machado',  'Cancelado',                  0,   '2026-04-13'::date, '2026-05-12'::date, null,
         'Cliente sin activos Meta; paralizado'),
        ('Integración EFFI',                     array['Integraciones'],                         'Steban Cataño',   'Cancelado',                  50,  '2025-08-28'::date, null,       null,
         'API limitada; fase 1 solo; sugerir cancelar relación'),
        ('Santiago (Legacy)',                    array['Alianza comercial'],                     null,              'Cancelado',                  0,   null,       null,       null,
         'Cancelado sin detalle'),
        ('Producto Restaurantes',                array['Productos específicos'],                 'Michell Ocampo',  'En Pausa',                   99,  '2025-08-10'::date, null,       null,
         'Terminado; pendiente tester; búsqueda calle'),
        ('Waguard Software',                     array['Innovación y Desarrollo'],               'Steven Machado',  'Pendiente de información',   99,  null,       null,       'atencion',
         'Plataforma terminada; falta responsable mantenimiento'),
        ('Karen Mora',                           array['Parametrizaciones'],                     null,              'No iniciado',                0,   null,       null,       null,
         '~30/05 diagnóstico parametrización'),
        ('Nicolas Argentina',                    array['Alianza comercial'],                     null,              'No iniciado',                0,   null,       null,       null,
         'Alianza no realizada; Mauricio retrasado'),
        ('Integración PayPal en POS',            array['Integraciones'],                         'Steven Machado',  'Validación de viabilidad',   99,  null,       null,       null,
         'Implementada; testeo con Leonardo')
    )
    select s.* from seed s
    where not exists (
      select 1 from pro_gestion.projects p
      where lower(p.title) = lower(s.title)
    )
  loop
    v_cat_names := rec.type_names;
    v_cat_primary := null;
    v_cat_extra := '{}'::uuid[];
    v_owner_id := null;

    -- Resolver owner por name
    if rec.owner_name is not null then
      select id into v_owner_id
      from pro_gestion.profiles
      where lower(name) = lower(rec.owner_name)
      limit 1;
    end if;

    -- Resolver categorías: primera = primaria, resto = extras
    foreach v_cn in array v_cat_names loop
      select id into v_cat_id from pro_gestion.categories where name = v_cn limit 1;
      if v_cat_id is not null then
        if v_cat_primary is null then
          v_cat_primary := v_cat_id;
        else
          v_cat_extra := array_append(v_cat_extra, v_cat_id);
        end if;
      end if;
    end loop;

    insert into pro_gestion.projects (
      title, category_id, extra_category_ids,
      owner_id, owner_label,
      status, manual_progress,
      start_date, projected_end_date,
      priority, observation,
      created_by
    ) values (
      rec.title, v_cat_primary, v_cat_extra,
      v_owner_id, case when v_owner_id is null then coalesce(rec.owner_name,'') else '' end,
      rec.status, rec.progress,
      rec.start, rec.proj_end,
      rec.priority, rec.observation,
      v_admin
    );
  end loop;
end $$;

-- =============================================================
-- 8. Reload PostgREST schema cache (campos nuevos visibles en API)
-- =============================================================
notify pgrst, 'reload config';
