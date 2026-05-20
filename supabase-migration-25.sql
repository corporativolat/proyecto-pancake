-- ===========================================================
-- migration-25: datos obligatorios del cliente al primer login.
--
-- Cuando el staff le crea la cuenta a un cliente, no sabemos:
--   1. su WhatsApp de contacto
--   2. su país
--   3. su NIT/CC (o cualquier identificación tributaria/personal)
--   4. su correo personal (el de login puede ser un alias que le pasó staff)
--
-- Este parche añade los campos a `profiles` y un flag
-- `client_data_completed` que el portal usa para bloquear la UI hasta que
-- el cliente complete el formulario obligatorio.
--
-- Idempotente.
-- ===========================================================

alter table pro_gestion.profiles add column if not exists whatsapp text;
alter table pro_gestion.profiles add column if not exists country text;
alter table pro_gestion.profiles add column if not exists id_type text;
alter table pro_gestion.profiles add column if not exists id_number text;
alter table pro_gestion.profiles add column if not exists contact_email text;
alter table pro_gestion.profiles add column if not exists client_data_completed boolean not null default false;

-- CHECK suave sobre id_type (acepta NULL para perfiles staff que no aplica).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_id_type_check'
  ) then
    alter table pro_gestion.profiles
      add constraint profiles_id_type_check
      check (id_type is null or id_type in ('NIT','CC','CE','PP','OTRO'));
  end if;
end $$;

-- Reload PostgREST schema cache.
notify pgrst, 'reload config';
