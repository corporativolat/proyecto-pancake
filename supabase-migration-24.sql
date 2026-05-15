-- ===========================================================
-- migration-24: sistema de tareas asignadas al cliente.
--
-- Staff (admin/gerente/owner/miembro) crea "tareas" en un proyecto
-- dirigidas al cliente (profiles con role='cliente' = project.client_id).
-- El cliente recibe notificación al asignarse, puede ver la tarea en
-- su calendario y entregarla subiendo un archivo. Staff revisa y
-- aprueba/rechaza.
--
-- Componentes:
--   1. tabla pro_gestion.client_tasks
--   2. RLS staff (CRUD), cliente (read suyas + entregar archivo)
--   3. Triggers SECURITY DEFINER:
--        - on insert  -> notif al cliente asignado
--        - on update status pendiente|en_progreso -> entregado -> notif al owner
--        - on update status entregado -> aprobado|rechazado -> notif al cliente
--   4. RPC pro_gestion.notify_client_task_due() SECURITY DEFINER:
--      recorre tareas y emite notifs idempotentes según vencimiento.
--   5. pg_cron job diario que llama al RPC.
--   6. Reúsa bucket "documents" con path <project_id>/client-tasks/<task_id>/<file>
--      (RLS storage de mig-20 ya valida primer folder = project_id).
--   7. Realtime publication.
--
-- Idempotente.
-- ===========================================================

-- ============================================
-- 0) GUARD: asegura projects.created_by (definido en mig-23).
-- Las policies de RLS abajo referencian p.created_by. Si la BD no
-- tiene mig-23 corrida, fallaría: "column p.created_by does not exist".
-- Re-aplicar mig-23 completa es preferible, pero este bloque permite
-- correr mig-24 stand-alone.
-- ============================================
alter table pro_gestion.projects
  add column if not exists created_by uuid references pro_gestion.profiles(id) on delete set null;
alter table pro_gestion.projects
  alter column created_by set default auth.uid();
update pro_gestion.projects
  set created_by = owner_id
  where created_by is null and owner_id is not null;
create index if not exists idx_projects_created_by on pro_gestion.projects(created_by);

-- ============================================
-- 1) TABLA pro_gestion.client_tasks
-- ============================================
create table if not exists pro_gestion.client_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pro_gestion.projects(id) on delete cascade,
  assigned_to uuid not null references pro_gestion.profiles(id) on delete cascade,
  created_by uuid references pro_gestion.profiles(id) on delete set null,
  title text not null,
  description text default '',
  priority text not null default 'media' check (priority in ('baja','media','urgente')),
  status text not null default 'pendiente' check (status in ('pendiente','en_progreso','entregado','aprobado','rechazado')),
  start_date date,
  due_date date,
  file_path text,
  file_name text,
  delivered_at timestamptz,
  reviewed_by uuid references pro_gestion.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_tasks_project on pro_gestion.client_tasks(project_id);
create index if not exists idx_client_tasks_assigned on pro_gestion.client_tasks(assigned_to, status);
create index if not exists idx_client_tasks_due on pro_gestion.client_tasks(due_date) where status in ('pendiente','en_progreso');

drop trigger if exists client_tasks_touch on pro_gestion.client_tasks;
create trigger client_tasks_touch before update on pro_gestion.client_tasks
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.client_tasks enable row level security;

-- ============================================
-- 2) RLS
-- ============================================
-- READ: staff con acceso al proyecto + cliente al que se le asignó.
drop policy if exists "client_tasks_read" on pro_gestion.client_tasks;
create policy "client_tasks_read" on pro_gestion.client_tasks for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or assigned_to = auth.uid()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = client_tasks.project_id
    and (
      p.owner_id = auth.uid()
      or p.created_by = auth.uid()
      or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
    )
  )
);

-- INSERT: solo staff con acceso al proyecto (admin/gerente/owner/created_by/member).
drop policy if exists "client_tasks_insert" on pro_gestion.client_tasks;
create policy "client_tasks_insert" on pro_gestion.client_tasks for insert to authenticated
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = project_id
    and (
      p.owner_id = auth.uid()
      or p.created_by = auth.uid()
      or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
    )
  )
);

-- UPDATE:
--   staff con acceso: cualquier campo (revisar, reasignar, cambiar fechas, etc.).
--   cliente asignado: solo si la tarea sigue pendiente/en_progreso/rechazado (puede re-entregar).
drop policy if exists "client_tasks_update" on pro_gestion.client_tasks;
create policy "client_tasks_update" on pro_gestion.client_tasks for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = client_tasks.project_id
    and (
      p.owner_id = auth.uid()
      or p.created_by = auth.uid()
      or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
    )
  )
  or (assigned_to = auth.uid() and status in ('pendiente','en_progreso','rechazado','entregado'))
)
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = client_tasks.project_id
    and (
      p.owner_id = auth.uid()
      or p.created_by = auth.uid()
      or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
    )
  )
  or (assigned_to = auth.uid() and status in ('pendiente','en_progreso','entregado'))
);

-- DELETE: solo staff con acceso (owner / admin / gerente).
drop policy if exists "client_tasks_delete" on pro_gestion.client_tasks;
create policy "client_tasks_delete" on pro_gestion.client_tasks for delete to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = client_tasks.project_id
    and (p.owner_id = auth.uid() or p.created_by = auth.uid())
  )
);

grant select, insert, update, delete on pro_gestion.client_tasks to authenticated;

-- ============================================
-- 3) NOTIF LOG (idempotencia para recordatorios de vencimiento)
-- ============================================
create table if not exists pro_gestion.client_task_notif_log (
  id uuid primary key default gen_random_uuid(),
  client_task_id uuid not null references pro_gestion.client_tasks(id) on delete cascade,
  kind text not null,             -- due_3d | due_1d | due_today | overdue+1 | overdue+3 | overdue+7 | paused
  sent_at timestamptz not null default now(),
  unique (client_task_id, kind)
);

create index if not exists idx_client_task_notif_log on pro_gestion.client_task_notif_log(client_task_id);

alter table pro_gestion.client_task_notif_log enable row level security;
drop policy if exists "client_task_notif_log_admin" on pro_gestion.client_task_notif_log;
create policy "client_task_notif_log_admin" on pro_gestion.client_task_notif_log
  for all to authenticated
  using (pro_gestion.is_admin())
  with check (pro_gestion.is_admin());
grant select, insert, update, delete on pro_gestion.client_task_notif_log to authenticated;

-- ============================================
-- 4) TRIGGERS de notificación in-app
-- ============================================
create or replace function pro_gestion.notify_client_task_event() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_project pro_gestion.projects%rowtype;
  v_creator_name text;
  v_pretty_priority text;
begin
  select * into v_project from pro_gestion.projects where id = new.project_id;
  if not found then return new; end if;

  -- 4a) INSERT -> notif al cliente
  if tg_op = 'INSERT' then
    select coalesce(name, email, 'tu equipo') into v_creator_name
      from pro_gestion.profiles where id = new.created_by;
    v_pretty_priority := case new.priority
      when 'urgente' then 'URGENTE'
      when 'baja'    then 'baja prioridad'
      else 'prioridad media'
    end;
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      new.assigned_to,
      'client_task_assigned',
      'Nueva tarea: ' || new.title,
      coalesce(v_creator_name,'Tu equipo') || ' te asignó una tarea (' || v_pretty_priority || ')'
        || case when new.due_date is not null then ' · entrega: ' || new.due_date::text else '' end,
      '/portal/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('client_task_id', new.id, 'priority', new.priority, 'due_date', new.due_date)
    );
    return new;
  end if;

  -- 4b) UPDATE -> según transición de status
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Cliente entrega: notif al owner (o admins si no hay owner)
    if new.status = 'entregado' and v_project.owner_id is not null then
      insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
      values (
        v_project.owner_id,
        'client_task_delivered',
        'Tarea entregada · ' || new.title,
        'El cliente entregó la tarea. Revísala.',
        '/projects/' || v_project.id::text,
        v_project.id,
        jsonb_build_object('client_task_id', new.id)
      );
    end if;

    -- Staff aprueba/rechaza: notif al cliente
    if new.status in ('aprobado','rechazado') then
      insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
      values (
        new.assigned_to,
        'client_task_reviewed',
        'Tarea ' || new.status || ' · ' || new.title,
        case
          when new.status = 'aprobado' then 'Tu entrega fue aprobada. ¡Gracias!'
          else coalesce('Rechazada: ' || new.review_comment, 'Tu entrega fue rechazada. Por favor re-envíala.')
        end,
        '/portal/projects/' || v_project.id::text,
        v_project.id,
        jsonb_build_object('client_task_id', new.id, 'status', new.status, 'comment', new.review_comment)
      );
    end if;
  end if;

  return new;
end; $$;

drop trigger if exists trg_client_tasks_notify_ins on pro_gestion.client_tasks;
create trigger trg_client_tasks_notify_ins after insert on pro_gestion.client_tasks
for each row execute function pro_gestion.notify_client_task_event();

drop trigger if exists trg_client_tasks_notify_upd on pro_gestion.client_tasks;
create trigger trg_client_tasks_notify_upd after update on pro_gestion.client_tasks
for each row execute function pro_gestion.notify_client_task_event();

-- ============================================
-- 5) RPC: recordatorios de vencimiento (idempotente)
-- ============================================
-- Emite notifs in-app a cliente y owner cuando la tarea está por vencer
-- o ya venció. No se repite el mismo kind para la misma tarea (UNIQUE constraint).
-- kinds:  due_3d | due_1d | due_today | overdue+1 | overdue+3 | overdue+7
create or replace function pro_gestion.notify_client_task_due() returns integer
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_task pro_gestion.client_tasks%rowtype;
  v_project pro_gestion.projects%rowtype;
  v_kind text;
  v_days int;
  v_count int := 0;
  v_recipient uuid;
  v_title text;
  v_body text;
begin
  for v_task in
    select * from pro_gestion.client_tasks
    where status in ('pendiente','en_progreso','rechazado')
      and due_date is not null
  loop
    v_days := (v_task.due_date - current_date);
    if v_days = 3 then v_kind := 'due_3d';
    elsif v_days = 1 then v_kind := 'due_1d';
    elsif v_days = 0 then v_kind := 'due_today';
    elsif v_days = -1 then v_kind := 'overdue+1';
    elsif v_days = -3 then v_kind := 'overdue+3';
    elsif v_days = -7 then v_kind := 'overdue+7';
    else continue;
    end if;

    -- skip si ya se emitió este kind para esta tarea
    if exists (select 1 from pro_gestion.client_task_notif_log
                where client_task_id = v_task.id and kind = v_kind) then
      continue;
    end if;

    select * into v_project from pro_gestion.projects where id = v_task.project_id;
    if not found then continue; end if;

    -- mensaje cliente
    if v_days > 0 then
      v_title := 'Vence en ' || v_days || ' día' || case when v_days=1 then '' else 's' end || ': ' || v_task.title;
      v_body  := 'Tu equipo necesita esta tarea para avanzar tu proyecto.';
    elsif v_days = 0 then
      v_title := 'Vence HOY: ' || v_task.title;
      v_body  := 'Esta tarea vence hoy. Por favor envíala lo antes posible.';
    else
      v_title := 'VENCIDA · ' || v_task.title;
      v_body  := 'Tu tarea está vencida. El avance de tu proyecto puede quedar en pausa hasta que la envíes.';
    end if;

    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_task.assigned_to,
      case when v_days < 0 then 'client_task_overdue' else 'client_task_due_soon' end,
      v_title, v_body,
      '/portal/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('client_task_id', v_task.id, 'days', v_days, 'kind', v_kind)
    );

    -- también notifica al owner staff cuando ya está vencida
    if v_days < 0 and v_project.owner_id is not null then
      insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
      values (
        v_project.owner_id,
        'client_task_overdue_staff',
        'Cliente sin entregar: ' || v_task.title,
        'La tarea asignada al cliente está vencida (' || abs(v_days) || ' día' || case when v_days=-1 then '' else 's' end || ').',
        '/projects/' || v_project.id::text,
        v_project.id,
        jsonb_build_object('client_task_id', v_task.id, 'days', v_days)
      );
    end if;

    insert into pro_gestion.client_task_notif_log (client_task_id, kind) values (v_task.id, v_kind);
    v_count := v_count + 1;
  end loop;

  return v_count;
end; $$;

grant execute on function pro_gestion.notify_client_task_due() to authenticated;

-- ============================================
-- 6) pg_cron: recordatorio diario 09:00 UTC (≈04:00 Colombia)
-- ============================================
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    -- limpia previo si existía
    begin
      perform cron.unschedule('client-tasks-due-daily')
      where exists (select 1 from cron.job where jobname = 'client-tasks-due-daily');
    exception when undefined_table then null;
    end;
    perform cron.schedule(
      'client-tasks-due-daily',
      '0 9 * * *',
      $cmd$ select pro_gestion.notify_client_task_due(); $cmd$
    );
  end if;
end $$;

-- ============================================
-- 7) Realtime publication
-- ============================================
do $$
begin
  begin
    alter publication supabase_realtime add table pro_gestion.client_tasks;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================
-- 8) Reload PostgREST
-- ============================================
notify pgrst, 'reload config';
