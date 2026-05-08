-- ===========================================================
-- Migration #8: feature "reportar errores"
-- Tabla error_reports + RLS + realtime + grants.
-- Pegar en: SQL Editor del proyecto Supabase.
-- ===========================================================

create table if not exists pro_gestion.error_reports (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid references pro_gestion.profiles(id) on delete set null,
    title text not null,
    description text not null,
    severity text not null default 'normal' check (severity in ('low','normal','high','urgent')),
    page_url text,
    user_agent text,
    status text not null default 'open' check (status in ('open','in_progress','resolved','wontfix')),
    resolution text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_error_reports_status on pro_gestion.error_reports(status, created_at desc);
create index if not exists idx_error_reports_author on pro_gestion.error_reports(profile_id, created_at desc);

drop trigger if exists error_reports_touch on pro_gestion.error_reports;
create trigger error_reports_touch before update on pro_gestion.error_reports
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.error_reports enable row level security;

-- LECTURA: admin/gerente leen todo. Usuario lee los suyos.
drop policy if exists "error_reports_read" on pro_gestion.error_reports;
create policy "error_reports_read" on pro_gestion.error_reports for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or profile_id = auth.uid()
);

-- INSERCIÓN: cualquier autenticado puede crear, profile_id obligatorio = self.
drop policy if exists "error_reports_insert" on pro_gestion.error_reports;
create policy "error_reports_insert" on pro_gestion.error_reports for insert to authenticated
with check (profile_id = auth.uid());

-- UPDATE: solo admin (cambiar status/resolution).
drop policy if exists "error_reports_update" on pro_gestion.error_reports;
create policy "error_reports_update" on pro_gestion.error_reports for update to authenticated
using (pro_gestion.is_admin())
with check (pro_gestion.is_admin());

-- DELETE: solo admin.
drop policy if exists "error_reports_delete" on pro_gestion.error_reports;
create policy "error_reports_delete" on pro_gestion.error_reports for delete to authenticated
using (pro_gestion.is_admin());

-- GRANTS solo authenticated (CN-003 ya revocó anon).
grant select, insert, update, delete on pro_gestion.error_reports to authenticated;

-- Realtime opcional para que admin vea reportes en vivo (idempotente).
do $$ begin alter publication supabase_realtime add table pro_gestion.error_reports; exception when duplicate_object then null; end $$;

notify pgrst, 'reload config';
