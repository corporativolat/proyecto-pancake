-- Migration #5: subtareas, tags, milestones
alter table pro_gestion.tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
alter table pro_gestion.tasks add column if not exists tags text[] not null default '{}';
alter table pro_gestion.tasks add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','urgent'));

-- MILESTONES
create table if not exists pro_gestion.milestones (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references pro_gestion.projects(id) on delete cascade,
    name text not null,
    target_date date not null,
    completed boolean not null default false,
    color text default '#ef4444',
    created_at timestamptz not null default now()
);
create index if not exists idx_milestones_project on pro_gestion.milestones(project_id, target_date);

alter table pro_gestion.milestones enable row level security;

drop policy if exists "milestones_read" on pro_gestion.milestones;
create policy "milestones_read" on pro_gestion.milestones for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.projects p
        where p.id = milestones.project_id
        and (p.owner_id = auth.uid()
             or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
    )
);

drop policy if exists "milestones_write" on pro_gestion.milestones;
create policy "milestones_write" on pro_gestion.milestones for all to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id and p.owner_id = auth.uid())
)
with check (
    pro_gestion.is_admin_or_gerente()
    or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id and p.owner_id = auth.uid())
);

grant all on pro_gestion.milestones to anon, authenticated;

notify pgrst, 'reload config';
