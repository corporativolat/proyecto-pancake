-- ===========================================================
-- PRO-GESTIÓN · Schema completo
-- Pegar TODO en: SQL Editor del proyecto ajtikvqfhylhafuwemnq
-- https://supabase.com/dashboard/project/ajtikvqfhylhafuwemnq/sql/new
-- ===========================================================

create schema if not exists pro_gestion;

-- PROFILES
create table if not exists pro_gestion.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null default '',
    email text not null,
    role text not null default 'miembro' check (role in ('admin','gerente','miembro')),
    avatar smallint not null default 1 check (avatar between 1 and 5),
    created_at timestamptz not null default now()
);

-- CATEGORIES
create table if not exists pro_gestion.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    color text not null default '#7c3aed',
    created_at timestamptz not null default now()
);

-- PROJECTS
create table if not exists pro_gestion.projects (
    id uuid primary key default gen_random_uuid(),
    title text not null default 'Nueva Iniciativa',
    company text default '',
    category_id uuid references pro_gestion.categories(id) on delete set null,
    owner_id uuid references pro_gestion.profiles(id) on delete set null,
    start_date date,
    status text not null default 'No iniciado',
    goal text default '',
    observation text default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- MEMBERS
create table if not exists pro_gestion.project_members (
    project_id uuid references pro_gestion.projects(id) on delete cascade,
    profile_id uuid references pro_gestion.profiles(id) on delete cascade,
    primary key (project_id, profile_id)
);

-- PHASES
create table if not exists pro_gestion.phases (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references pro_gestion.projects(id) on delete cascade,
    name text not null default 'Nueva Fase',
    start_week smallint not null default 1 check (start_week between 1 and 8),
    duration_weeks smallint not null default 2 check (duration_weeks between 1 and 8),
    position int not null default 0,
    created_at timestamptz not null default now()
);

-- TASKS
create table if not exists pro_gestion.tasks (
    id uuid primary key default gen_random_uuid(),
    phase_id uuid not null references pro_gestion.phases(id) on delete cascade,
    name text not null default 'Nueva Actividad',
    completed boolean not null default false,
    assignee_id uuid references pro_gestion.profiles(id) on delete set null,
    duration smallint not null default 2 check (duration between 1 and 56),
    start_week smallint not null default 1 check (start_week between 1 and 8),
    start_day smallint not null default 1 check (start_day between 1 and 7),
    obs text default '',
    position int not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists idx_phases_project on pro_gestion.phases(project_id);
create index if not exists idx_tasks_phase on pro_gestion.tasks(phase_id);
create index if not exists idx_projects_owner on pro_gestion.projects(owner_id);

-- TRIGGERS
create or replace function pro_gestion.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists projects_touch on pro_gestion.projects;
create trigger projects_touch before update on pro_gestion.projects
for each row execute function pro_gestion.touch_updated_at();

create or replace function pro_gestion.handle_new_user() returns trigger
language plpgsql security definer set search_path = pro_gestion, auth
as $$
declare
    has_admin boolean;
    chosen_role text;
begin
    select exists(select 1 from pro_gestion.profiles where role = 'admin') into has_admin;
    chosen_role := coalesce(new.raw_user_meta_data->>'role', case when has_admin then 'miembro' else 'admin' end);

    insert into pro_gestion.profiles (id, name, email, role, avatar)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email,
        chosen_role,
        coalesce((new.raw_user_meta_data->>'avatar')::smallint, 1 + floor(random()*5)::smallint)
    )
    on conflict (id) do nothing;
    return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function pro_gestion.handle_new_user();

-- HELPERS
create or replace function pro_gestion.is_admin() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role = 'admin'); $$;

create or replace function pro_gestion.is_admin_or_gerente() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role in ('admin','gerente')); $$;

-- RLS
alter table pro_gestion.profiles enable row level security;
alter table pro_gestion.categories enable row level security;
alter table pro_gestion.projects enable row level security;
alter table pro_gestion.project_members enable row level security;
alter table pro_gestion.phases enable row level security;
alter table pro_gestion.tasks enable row level security;

-- POLICIES profiles
drop policy if exists "profiles_read_all" on pro_gestion.profiles;
create policy "profiles_read_all" on pro_gestion.profiles for select to authenticated using (true);
drop policy if exists "profiles_self_update" on pro_gestion.profiles;
create policy "profiles_self_update" on pro_gestion.profiles for update to authenticated
using (id = auth.uid() or pro_gestion.is_admin())
with check (id = auth.uid() or pro_gestion.is_admin());
drop policy if exists "profiles_admin_insert" on pro_gestion.profiles;
create policy "profiles_admin_insert" on pro_gestion.profiles for insert to authenticated
with check (pro_gestion.is_admin());
drop policy if exists "profiles_admin_delete" on pro_gestion.profiles;
create policy "profiles_admin_delete" on pro_gestion.profiles for delete to authenticated
using (pro_gestion.is_admin());

-- POLICIES categories
drop policy if exists "categories_read_all" on pro_gestion.categories;
create policy "categories_read_all" on pro_gestion.categories for select to authenticated using (true);
drop policy if exists "categories_admin_write" on pro_gestion.categories;
create policy "categories_admin_write" on pro_gestion.categories for all to authenticated
using (pro_gestion.is_admin()) with check (pro_gestion.is_admin());

-- POLICIES projects
drop policy if exists "projects_read" on pro_gestion.projects;
create policy "projects_read" on pro_gestion.projects for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or owner_id = auth.uid()
    or exists (select 1 from pro_gestion.project_members m where m.project_id = projects.id and m.profile_id = auth.uid())
);
drop policy if exists "projects_insert" on pro_gestion.projects;
create policy "projects_insert" on pro_gestion.projects for insert to authenticated
with check (pro_gestion.is_admin_or_gerente());
drop policy if exists "projects_update" on pro_gestion.projects;
create policy "projects_update" on pro_gestion.projects for update to authenticated
using (pro_gestion.is_admin_or_gerente() or owner_id = auth.uid())
with check (pro_gestion.is_admin_or_gerente() or owner_id = auth.uid());
drop policy if exists "projects_delete" on pro_gestion.projects;
create policy "projects_delete" on pro_gestion.projects for delete to authenticated
using (pro_gestion.is_admin());

-- POLICIES members
drop policy if exists "members_read" on pro_gestion.project_members;
create policy "members_read" on pro_gestion.project_members for select to authenticated using (true);
drop policy if exists "members_write" on pro_gestion.project_members;
create policy "members_write" on pro_gestion.project_members for all to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = project_id and p.owner_id = auth.uid())
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = project_id and p.owner_id = auth.uid())
);

-- POLICIES phases
drop policy if exists "phases_read" on pro_gestion.phases;
create policy "phases_read" on pro_gestion.phases for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.projects p
        where p.id = phases.project_id
        and (p.owner_id = auth.uid()
             or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
    )
);
drop policy if exists "phases_write" on pro_gestion.phases;
create policy "phases_write" on pro_gestion.phases for all to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id and p.owner_id = auth.uid())
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id and p.owner_id = auth.uid())
);

-- POLICIES tasks
drop policy if exists "tasks_read" on pro_gestion.tasks;
create policy "tasks_read" on pro_gestion.tasks for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid()
             or tasks.assignee_id = auth.uid()
             or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
    )
);
drop policy if exists "tasks_write" on pro_gestion.tasks;
create policy "tasks_write" on pro_gestion.tasks for all to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or tasks.assignee_id = auth.uid())
    )
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.phases ph
        join pro_gestion.projects p on p.id = ph.project_id
        where ph.id = tasks.phase_id
        and (p.owner_id = auth.uid() or tasks.assignee_id = auth.uid())
    )
);

-- GRANTS
grant usage on schema pro_gestion to anon, authenticated;
grant all on all tables in schema pro_gestion to anon, authenticated;
grant all on all sequences in schema pro_gestion to anon, authenticated;
alter default privileges in schema pro_gestion grant all on tables to anon, authenticated;
alter default privileges in schema pro_gestion grant all on sequences to anon, authenticated;

-- EXPONER schema en PostgREST
alter role authenticator set pgrst.db_schemas = 'public, pro_gestion';
notify pgrst, 'reload config';

-- SEED categorías
insert into pro_gestion.categories (name, color) values
    ('Estrategia',  '#7c3aed'),
    ('Operaciones', '#10b981'),
    ('Tecnología',  '#f59e0b'),
    ('Comercial',   '#ef4444')
on conflict do nothing;
