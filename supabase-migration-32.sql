-- ===========================================================
-- migration-32: notificaciones automáticas por canal preferido.
--
-- Cada usuario elige cómo recibir notificaciones:
--   * 'email'     → llega a su correo
--   * 'whatsapp'  → (pendiente proveedor; por ahora cae a email
--                    si tiene email, si no se queda en in-app)
--   * 'both'      → email y WhatsApp
--   * 'none'      → solo in-app (campana)
--
-- Cambios:
--   1. profiles.notif_channel text default 'email'.
--   2. notifications.email_sent_at + wa_sent_at (audit).
--   3. Índices parciales para procesar pendientes rápido.
--   4. Cron pg_cron cada 5 min que invoca la edge function
--      `process-notifications` (a crear).
--   5. Helper SQL `notif_recipient_info(profile_id)` que devuelve
--      email, whatsapp y canal del destinatario.
--
-- IMPORTANTE: antes de correr el cron schedule (final), reemplaza
--   * <SERVICE_ROLE_JWT> → tu service_role key (Settings → API → service_role)
-- El PROJECT_REF ya está sustituido (ajtikvqfhylhafuwemnq).
--
-- Idempotente.
-- ===========================================================

-- 1. Canal preferido por usuario.
alter table pro_gestion.profiles
  add column if not exists notif_channel text not null default 'email';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_notif_channel_check'
  ) then
    alter table pro_gestion.profiles
      add constraint profiles_notif_channel_check
      check (notif_channel in ('email','whatsapp','both','none'));
  end if;
end $$;

comment on column pro_gestion.profiles.notif_channel
  is 'Canal preferido del usuario para notificaciones automáticas: email | whatsapp | both | none. Default email.';

-- 2. Audit columns en notifications para no reenviar.
alter table pro_gestion.notifications
  add column if not exists email_sent_at timestamptz;
alter table pro_gestion.notifications
  add column if not exists wa_sent_at timestamptz;
alter table pro_gestion.notifications
  add column if not exists send_error text;

-- 3. Índices parciales para que el cron procese pendientes en O(log n).
create index if not exists notifications_pending_email_idx
  on pro_gestion.notifications (created_at)
  where email_sent_at is null;

create index if not exists notifications_pending_wa_idx
  on pro_gestion.notifications (created_at)
  where wa_sent_at is null;

-- 4. Helper que la edge function consulta para resolver destinatario.
-- Devuelve email + whatsapp + canal del profile. Usa contact_email (mig-25)
-- como override sobre el email del auth (caso cliente con correo distinto).
create or replace function pro_gestion.notif_recipient_info(p_profile_id uuid)
returns table (
  profile_id  uuid,
  email       text,
  whatsapp    text,
  channel     text,
  name        text
)
language sql
stable
security definer
set search_path = pro_gestion
as $$
  select
    p.id                                            as profile_id,
    coalesce(nullif(p.contact_email,''), p.email)   as email,
    coalesce(nullif(p.whatsapp,''), p.phone)        as whatsapp,
    p.notif_channel                                 as channel,
    p.name                                          as name
  from pro_gestion.profiles p
  where p.id = p_profile_id;
$$;

grant execute on function pro_gestion.notif_recipient_info(uuid) to authenticated;

-- 5. Extensiones (idempotente).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 6. Schedule del job cada 5 min.
-- ⚠️ REEMPLAZA <PROJECT_REF> y <SERVICE_ROLE_JWT> antes de correr.
do $$
begin
  perform cron.unschedule('process-notifications-5min')
  where exists (select 1 from cron.job where jobname = 'process-notifications-5min');
exception when undefined_table then null;
end $$;

select cron.schedule(
  'process-notifications-5min',
  '*/5 * * * *',
  $cmd$
    select net.http_post(
      url := 'https://ajtikvqfhylhafuwemnq.supabase.co/functions/v1/process-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_JWT>'
      ),
      body := '{}'::jsonb
    );
  $cmd$
);
