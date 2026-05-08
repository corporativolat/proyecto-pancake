-- ===========================================================
-- Migration #3: comments + activity log
-- https://supabase.com/dashboard/project/ajtikvqfhylhafuwemnq/sql/new
-- ===========================================================

-- COMMENTS
create table if not exists pro_gestion.comments (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references pro_gestion.projects(id) on delete cascade,
    profile_id uuid not null references pro_gestion.profiles(id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now()
);
create index if not exists idx_comments_project on pro_gestion.comments(project_id, created_at desc);

alter table pro_gestion.comments enable row level security;

drop policy if exists "comments_read" on pro_gestion.comments;
create policy "comments_read" on pro_gestion.comments for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or exists (
        select 1 from pro_gestion.projects p
        where p.id = comments.project_id
        and (p.owner_id = auth.uid()
             or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
    )
);

drop policy if exists "comments_write_self" on pro_gestion.comments;
create policy "comments_write_self" on pro_gestion.comments for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists "comments_delete_self_or_admin" on pro_gestion.comments;
create policy "comments_delete_self_or_admin" on pro_gestion.comments for delete to authenticated
using (profile_id = auth.uid() or pro_gestion.is_admin());

-- ACTIVITY (audit ligero)
create table if not exists pro_gestion.activity (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references pro_gestion.projects(id) on delete cascade,
    profile_id uuid references pro_gestion.profiles(id) on delete set null,
    kind text not null,
    detail text,
    created_at timestamptz not null default now()
);
create index if not exists idx_activity_project on pro_gestion.activity(project_id, created_at desc);
create index if not exists idx_activity_global on pro_gestion.activity(created_at desc);

alter table pro_gestion.activity enable row level security;

drop policy if exists "activity_read" on pro_gestion.activity;
create policy "activity_read" on pro_gestion.activity for select to authenticated
using (
    pro_gestion.is_admin_or_gerente()
    or project_id is null
    or exists (
        select 1 from pro_gestion.projects p
        where p.id = activity.project_id
        and (p.owner_id = auth.uid()
             or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
    )
);

drop policy if exists "activity_write" on pro_gestion.activity;
create policy "activity_write" on pro_gestion.activity for insert to authenticated
with check (profile_id = auth.uid() or profile_id is null);

grant all on pro_gestion.comments, pro_gestion.activity to anon, authenticated;

notify pgrst, 'reload config';
