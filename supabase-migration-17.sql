-- ===========================================================
-- migration-17: notificaciones de vencimiento por email.
--   * Añade `projects.notification_email` (override opcional
--     cuando el responsable no tiene cuenta o quieren usar
--     otro destinatario).
--   * Crea `pro_gestion.notification_log` para idempotencia
--     (un proyecto recibe a lo sumo 1 email por "kind").
--   * Activa pg_cron + pg_net y programa un job diario que
--     invoca la edge function `notify-deadlines`.
--
-- IMPORTANTE: antes de ejecutar el cron schedule (al final),
-- reemplaza:
--   * <PROJECT_REF>       → ref del proyecto Supabase
--   * <SERVICE_ROLE_JWT>  → service_role key (NO el anon)
--     OJO: idealmente guardarla en supabase Vault y leerla
--     con `vault.decrypted_secrets` en lugar de hardcodear.
-- ===========================================================

-- 1. Columna opcional en projects.
alter table pro_gestion.projects
  add column if not exists notification_email text;
comment on column pro_gestion.projects.notification_email
  is 'Email destinatario de notificaciones de vencimiento. Override sobre profiles.email del owner. Nullable.';

-- 2. Audit / lock para no reenviar.
create table if not exists pro_gestion.notification_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pro_gestion.projects(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  recipient text not null,
  error text,
  unique (project_id, kind)
);

create index if not exists notification_log_project_idx
  on pro_gestion.notification_log (project_id);
create index if not exists notification_log_kind_idx
  on pro_gestion.notification_log (kind);

-- RLS: solo admin lee/escribe directamente; la edge function usa service_role
-- (bypasses RLS), así que policies estrictas para humanos están bien.
alter table pro_gestion.notification_log enable row level security;
drop policy if exists "notif_log_admin_read" on pro_gestion.notification_log;
create policy "notif_log_admin_read" on pro_gestion.notification_log
  for select to authenticated
  using (pro_gestion.is_admin_or_gerente());
drop policy if exists "notif_log_admin_all" on pro_gestion.notification_log;
create policy "notif_log_admin_all" on pro_gestion.notification_log
  for all to authenticated
  using (pro_gestion.is_admin())
  with check (pro_gestion.is_admin());

grant select, insert, update, delete on pro_gestion.notification_log to authenticated;

-- 3. Extensiones para cron + HTTP outbound.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 4. Schedule del job diario.
-- Cron 0 9 * * *  = 09:00 UTC todos los días (04:00 hora Colombia).
-- Si el job ya existe, no falla: pg_cron permite duplicar el nombre? No:
-- cron.schedule devuelve error si ya existe. Usamos unschedule defensivo.
-- ⚠️ REEMPLAZA <PROJECT_REF> y <SERVICE_ROLE_JWT> antes de correr.
do $$
begin
  -- Limpiar si ya estaba.
  perform cron.unschedule('notify-deadlines-daily')
  where exists (select 1 from cron.job where jobname = 'notify-deadlines-daily');
exception when undefined_table then null;
end $$;

select cron.schedule(
  'notify-deadlines-daily',
  '0 9 * * *',
  $cmd$
    select net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-deadlines',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_JWT>'
      ),
      body := '{}'::jsonb
    );
  $cmd$
);
