-- ===========================================================
-- migration-18: bitácora auto + salud override + landing route
-- + notificaciones opt-out.
-- Cubre Bloques 1, 2, 6 y 7 del plan audit-refactor.
--
-- Idempotente: usa `if not exists`, `do $$ ... $$` con guardas
-- por nombre de constraint/trigger, `create or replace function`.
-- ===========================================================

-- =============================================================
-- 1. activity: añadir `tag` + `meta` + relajar policy `activity_write`.
--    Los triggers SECURITY DEFINER pueden grabar `profile_id = null`
--    cuando se ejecutan sin sesión (cron, jobs internos).
-- =============================================================
alter table pro_gestion.activity
  add column if not exists tag text not null default 'sistema',
  add column if not exists meta jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activity_tag_valid'
  ) then
    alter table pro_gestion.activity
      add constraint activity_tag_valid
      check (tag in ('sistema','avance','riesgo','decision','bloqueo','manual'));
  end if;
end $$;

create index if not exists activity_tag_idx on pro_gestion.activity (tag);

drop policy if exists "activity_write" on pro_gestion.activity;
create policy "activity_write" on pro_gestion.activity
  for insert to authenticated
  with check (profile_id is null or profile_id = auth.uid());

-- =============================================================
-- 2. projects.health_override (smallint 1=green | 2=amber | 3=red).
--    Null = usar healthSignal() computed en cliente.
-- =============================================================
alter table pro_gestion.projects
  add column if not exists health_override smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_health_override_valid'
  ) then
    alter table pro_gestion.projects
      add constraint projects_health_override_valid
      check (health_override is null or health_override in (1, 2, 3));
  end if;
end $$;

comment on column pro_gestion.projects.health_override
  is 'Override manual del semáforo de salud. 1=verde, 2=ámbar, 3=rojo. Null = computed.';

-- =============================================================
-- 3. profiles: landing_route + notif flags.
-- =============================================================
alter table pro_gestion.profiles
  add column if not exists landing_route text not null default '/dashboard',
  add column if not exists notif_email_enabled boolean not null default true,
  add column if not exists notif_inapp_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_landing_route_valid'
  ) then
    alter table pro_gestion.profiles
      add constraint profiles_landing_route_valid
      check (landing_route in ('/dashboard','/projects','/team'));
  end if;
end $$;

-- =============================================================
-- 4. Trigger function: cambios en `projects`.
-- =============================================================
create or replace function pro_gestion.log_project_change()
returns trigger
language plpgsql
security definer
set search_path = pro_gestion, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if (new.status is distinct from old.status) then
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (new.id, v_uid, 'project_status_change',
            concat('Estado: ', coalesce(old.status,'—'), ' → ', coalesce(new.status,'—')),
            'sistema',
            jsonb_build_object('field','status','old',old.status,'new',new.status));
  end if;
  if (new.owner_id is distinct from old.owner_id) then
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (new.id, v_uid, 'project_owner_change', 'Cambio de responsable', 'sistema',
            jsonb_build_object('field','owner_id','old',old.owner_id,'new',new.owner_id));
  end if;
  if (new.projected_end_date is distinct from old.projected_end_date) then
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (new.id, v_uid, 'project_date_change',
            concat('Fin proyectada: ', coalesce(old.projected_end_date::text,'—'), ' → ', coalesce(new.projected_end_date::text,'—')),
            'sistema',
            jsonb_build_object('field','projected_end_date','old',old.projected_end_date,'new',new.projected_end_date));
  end if;
  if (new.delivery_date is distinct from old.delivery_date) then
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (new.id, v_uid, 'project_delivery_change',
            concat('Entrega: ', coalesce(old.delivery_date::text,'—'), ' → ', coalesce(new.delivery_date::text,'—')),
            'sistema',
            jsonb_build_object('field','delivery_date','old',old.delivery_date,'new',new.delivery_date));
  end if;
  if (coalesce(new.contract_url,'') is distinct from coalesce(old.contract_url,'')) and coalesce(new.contract_url,'') <> '' then
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (new.id, v_uid, 'project_contract_update', 'Contrato actualizado', 'sistema',
            jsonb_build_object('field','contract_url'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_project_change on pro_gestion.projects;
create trigger trg_log_project_change
  after update on pro_gestion.projects
  for each row execute function pro_gestion.log_project_change();

-- =============================================================
-- 5. Trigger function: nuevo proyecto.
-- =============================================================
create or replace function pro_gestion.log_project_create()
returns trigger
language plpgsql
security definer
set search_path = pro_gestion, public
as $$
begin
  insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
  values (new.id, auth.uid(), 'project_create',
          concat('Proyecto creado: ', new.title), 'sistema',
          jsonb_build_object('title', new.title));
  return new;
end;
$$;

drop trigger if exists trg_log_project_create on pro_gestion.projects;
create trigger trg_log_project_create
  after insert on pro_gestion.projects
  for each row execute function pro_gestion.log_project_create();

-- =============================================================
-- 6. Trigger function: milestones (insert + complete toggle).
-- =============================================================
create or replace function pro_gestion.log_milestone_change()
returns trigger
language plpgsql
security definer
set search_path = pro_gestion, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if (TG_OP = 'INSERT') then
    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (new.project_id, v_uid, 'milestone_create',
            concat('Hito creado: ', new.name), 'sistema',
            jsonb_build_object('milestone_id', new.id, 'name', new.name));
    return new;
  elsif (TG_OP = 'UPDATE') then
    if (new.completed is distinct from old.completed) then
      insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
      values (new.project_id, v_uid,
              case when new.completed then 'milestone_complete' else 'milestone_uncomplete' end,
              concat(case when new.completed then '✓ ' else '↺ ' end, new.name),
              'avance',
              jsonb_build_object('milestone_id', new.id, 'name', new.name, 'completed', new.completed));
    end if;
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_log_milestone_insert on pro_gestion.milestones;
create trigger trg_log_milestone_insert
  after insert on pro_gestion.milestones
  for each row execute function pro_gestion.log_milestone_change();

drop trigger if exists trg_log_milestone_update on pro_gestion.milestones;
create trigger trg_log_milestone_update
  after update on pro_gestion.milestones
  for each row execute function pro_gestion.log_milestone_change();

-- =============================================================
-- 7b. comments: añadir tag opcional para clasificar comentarios
--     manuales (avance | riesgo | decisión | bloqueo).
-- =============================================================
alter table pro_gestion.comments
  add column if not exists tag text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comments_tag_valid'
  ) then
    alter table pro_gestion.comments
      add constraint comments_tag_valid
      check (tag is null or tag in ('avance','riesgo','decision','bloqueo'));
  end if;
end $$;

-- =============================================================
-- 8. Trigger function: task completion (joinea con phases para
-- obtener project_id).
-- =============================================================
create or replace function pro_gestion.log_task_complete()
returns trigger
language plpgsql
security definer
set search_path = pro_gestion, public
as $$
declare
  v_project_id uuid;
begin
  if (new.completed is distinct from old.completed) then
    select ph.project_id into v_project_id
    from pro_gestion.phases ph where ph.id = new.phase_id;

    insert into pro_gestion.activity (project_id, profile_id, kind, detail, tag, meta)
    values (v_project_id, auth.uid(),
            case when new.completed then 'task_complete' else 'task_uncomplete' end,
            concat(case when new.completed then '✓ ' else '↺ ' end, new.name),
            'avance',
            jsonb_build_object('task_id', new.id, 'task_name', new.name, 'completed', new.completed));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_task_complete on pro_gestion.tasks;
create trigger trg_log_task_complete
  after update on pro_gestion.tasks
  for each row execute function pro_gestion.log_task_complete();
