-- ===========================================================
-- migration-27: equipos + roles lider_equipos / lider_equipo + invitaciones.
--
-- Hasta ahora Pancake operaba como un solo equipo. Esta migración introduce
-- la noción de "equipo" (varios) y dos roles nuevos:
--   - lider_equipos: gestiona varios equipos (los suyos). Por encima del
--     líder de cada equipo, por debajo de gerente. Crea equipos y asigna
--     líderes y miembros.
--   - lider_equipo: gestiona un único equipo (el que le asigna su
--     lider_equipos). Por encima de miembro. Puede ver/editar todos los
--     proyectos asociados al team_id de su equipo.
--
-- Modelo:
--   - profiles.team_id  → el equipo al que pertenece el usuario (un solo
--     equipo a la vez). NULL para super_admin/admin/gerente/lider_equipos/cliente.
--   - teams              → catálogo de equipos.
--       manager_id: el lider_equipos dueño (quien lo gestiona).
--       leader_id:  el lider_equipo a cargo (1:1, UNIQUE).
--   - projects.team_id   → el equipo dueño del proyecto (opcional).
--   - invitations        → invitaciones pendientes a un equipo, por email
--                          o WhatsApp (canal pancake, integración pendiente).
--
-- Idempotente.
-- ===========================================================

-- ============================================
-- 1) PROFILES: extender CHECK de role + team_id
-- ============================================
alter table pro_gestion.profiles drop constraint if exists profiles_role_check;
alter table pro_gestion.profiles
  add constraint profiles_role_check
  check (role in ('super_admin','admin','gerente','lider_equipos','lider_equipo','miembro','cliente'));

-- team_id se rellena más abajo (después de crear `teams`).
alter table pro_gestion.profiles
  add column if not exists team_id uuid;

-- ============================================
-- 2) TEAMS
-- ============================================
create table if not exists pro_gestion.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#7c3aed',
  manager_id uuid references pro_gestion.profiles(id) on delete set null,
  leader_id uuid references pro_gestion.profiles(id) on delete set null,
  created_by uuid references pro_gestion.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_leader_unique unique (leader_id)
);

create index if not exists idx_teams_manager on pro_gestion.teams(manager_id);
create index if not exists idx_teams_leader on pro_gestion.teams(leader_id);

drop trigger if exists teams_touch on pro_gestion.teams;
create trigger teams_touch before update on pro_gestion.teams
for each row execute function pro_gestion.touch_updated_at();

-- FK profiles.team_id → teams (la añadimos ahora que teams existe).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_team_id_fkey'
  ) then
    alter table pro_gestion.profiles
      add constraint profiles_team_id_fkey
      foreign key (team_id) references pro_gestion.teams(id) on delete set null;
  end if;
end $$;

create index if not exists idx_profiles_team on pro_gestion.profiles(team_id);

-- ============================================
-- 3) PROJECTS.team_id
-- ============================================
alter table pro_gestion.projects
  add column if not exists team_id uuid references pro_gestion.teams(id) on delete set null;

create index if not exists idx_projects_team on pro_gestion.projects(team_id);

-- ============================================
-- 4) HELPERS de rol/equipo
-- ============================================
create or replace function pro_gestion.is_lider_equipos() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role = 'lider_equipos'); $$;

create or replace function pro_gestion.is_lider_equipo() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$ select exists(select 1 from pro_gestion.profiles where id = auth.uid() and role = 'lider_equipo'); $$;

-- ¿auth.uid() administra este equipo? (manager directo o líder asignado)
create or replace function pro_gestion.manages_team(p_team_id uuid) returns boolean
language sql stable security definer set search_path = pro_gestion
as $$
  select exists(
    select 1 from pro_gestion.teams t
    where t.id = p_team_id
    and (t.manager_id = auth.uid() or t.leader_id = auth.uid())
  );
$$;

-- ¿auth.uid() pertenece a este equipo? (incluye lider_equipo y miembros)
create or replace function pro_gestion.is_team_member(p_team_id uuid) returns boolean
language sql stable security definer set search_path = pro_gestion
as $$
  select exists(
    select 1 from pro_gestion.profiles p
    where p.id = auth.uid() and p.team_id = p_team_id
  );
$$;

-- staff = roles internos (incluye los nuevos).
create or replace function pro_gestion.is_staff() returns boolean
language sql stable security definer set search_path = pro_gestion
as $$
  select exists(select 1 from pro_gestion.profiles where id = auth.uid()
    and role in ('super_admin','admin','gerente','lider_equipos','lider_equipo','miembro'));
$$;

-- ============================================
-- 5) TEAMS RLS
-- ============================================
alter table pro_gestion.teams enable row level security;

-- Lectura: cualquier staff puede ver el catálogo de equipos.
drop policy if exists "teams_read" on pro_gestion.teams;
create policy "teams_read" on pro_gestion.teams for select to authenticated
using (pro_gestion.is_staff());

-- Insert: admin/gerente, o lider_equipos (será el manager del equipo).
drop policy if exists "teams_insert" on pro_gestion.teams;
create policy "teams_insert" on pro_gestion.teams for insert to authenticated
with check (
  pro_gestion.is_admin_or_gerente()
  or (pro_gestion.is_lider_equipos() and manager_id = auth.uid())
);

-- Update: admin/gerente, o el manager del equipo. El lider_equipo no
-- puede modificar el equipo (solo gestionar miembros vía invitations).
drop policy if exists "teams_update" on pro_gestion.teams;
create policy "teams_update" on pro_gestion.teams for update to authenticated
using (pro_gestion.is_admin_or_gerente() or manager_id = auth.uid())
with check (pro_gestion.is_admin_or_gerente() or manager_id = auth.uid());

-- Delete: admin/gerente o el manager.
drop policy if exists "teams_delete" on pro_gestion.teams;
create policy "teams_delete" on pro_gestion.teams for delete to authenticated
using (pro_gestion.is_admin_or_gerente() or manager_id = auth.uid());

grant select, insert, update, delete on pro_gestion.teams to authenticated;

-- ============================================
-- 6) PROFILES update: permitir a admin/manager mover gente entre equipos.
--    La policy profiles_self_update ya permitía a admin actualizar; la
--    extendemos para que lider_equipos pueda asignar team_id a miembros
--    pero NO cambiar role.
-- ============================================
-- Reglas:
--   - admin / super_admin: cualquier campo de cualquier perfil.
--   - usuario: solo su propio perfil (NO role — vía trigger).
--   - lider_equipos: puede setear team_id de cualquier miembro a uno de
--     sus equipos (o a NULL). NO puede cambiar role.
-- Implementación: dejamos profiles_self_update (admin/self) y añadimos
-- una policy `profiles_lider_equipos_team` que permita el update por
-- WITH CHECK acotado.
drop policy if exists "profiles_lider_equipos_team" on pro_gestion.profiles;
create policy "profiles_lider_equipos_team" on pro_gestion.profiles for update to authenticated
using (
  pro_gestion.is_lider_equipos()
)
with check (
  pro_gestion.is_lider_equipos()
  and (team_id is null or pro_gestion.manages_team(team_id))
);

-- Trigger anti-escalada: cuando un lider_equipos actualiza un profile,
-- NO puede tocar el campo role. (Para admin sí.)
create or replace function pro_gestion.protect_role_change() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_actor_role text;
begin
  select role into v_actor_role from pro_gestion.profiles where id = auth.uid();
  if v_actor_role in ('admin','super_admin') then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'No autorizado: solo admin puede cambiar el rol';
  end if;
  return new;
end; $$;

drop trigger if exists trg_profiles_protect_role on pro_gestion.profiles;
create trigger trg_profiles_protect_role before update on pro_gestion.profiles
for each row execute function pro_gestion.protect_role_change();

-- ============================================
-- 7) PROJECTS RLS: extender lectura/escritura por equipo.
--    Reglas nuevas (suman a las existentes):
--      - manages_team(projects.team_id): manager o líder del equipo dueño
--        ve y edita el proyecto.
--      - is_team_member(projects.team_id): cualquier miembro del equipo
--        ve los proyectos del equipo (lectura). La escritura sigue
--        gobernada por owner_id / created_by / project_members.
-- ============================================
drop policy if exists "projects_read" on pro_gestion.projects;
create policy "projects_read" on pro_gestion.projects for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or owner_id = auth.uid()
  or created_by = auth.uid()
  or client_id = auth.uid()
  or (team_id is not null and pro_gestion.manages_team(team_id))
  or (team_id is not null and pro_gestion.is_team_member(team_id))
  or exists (select 1 from pro_gestion.project_members m where m.project_id = projects.id and m.profile_id = auth.uid())
);

drop policy if exists "projects_update" on pro_gestion.projects;
create policy "projects_update" on pro_gestion.projects for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or owner_id = auth.uid()
  or created_by = auth.uid()
  or (team_id is not null and pro_gestion.manages_team(team_id))
)
with check (
  pro_gestion.is_admin_or_gerente()
  or owner_id = auth.uid()
  or created_by = auth.uid()
  or (team_id is not null and pro_gestion.manages_team(team_id))
);

-- Insert: dejamos la policy de mig-23 intacta (admin/gerente, owner=self,
-- created_by=self). Si un lider_equipos crea un proyecto sin team_id
-- queda como created_by; puede asignarle team_id después.

-- Phases / tasks / milestones: extender insert/update para que el manager
-- o líder del equipo puedan operar sobre proyectos del equipo aunque no
-- sean owner ni created_by.
drop policy if exists "phases_insert" on pro_gestion.phases;
create policy "phases_insert" on pro_gestion.phases for insert to authenticated
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id
             and (p.owner_id = auth.uid()
                  or p.created_by = auth.uid()
                  or (p.team_id is not null and pro_gestion.manages_team(p.team_id))))
);

drop policy if exists "phases_update" on pro_gestion.phases;
create policy "phases_update" on pro_gestion.phases for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id
             and (p.owner_id = auth.uid()
                  or p.created_by = auth.uid()
                  or (p.team_id is not null and pro_gestion.manages_team(p.team_id))))
)
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (select 1 from pro_gestion.projects p where p.id = phases.project_id
             and (p.owner_id = auth.uid()
                  or p.created_by = auth.uid()
                  or (p.team_id is not null and pro_gestion.manages_team(p.team_id))))
);

drop policy if exists "phases_read" on pro_gestion.phases;
create policy "phases_read" on pro_gestion.phases for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = phases.project_id
    and (p.owner_id = auth.uid()
         or p.client_id = auth.uid()
         or (p.team_id is not null and pro_gestion.manages_team(p.team_id))
         or (p.team_id is not null and pro_gestion.is_team_member(p.team_id))
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  )
);

drop policy if exists "tasks_insert" on pro_gestion.tasks;
create policy "tasks_insert" on pro_gestion.tasks for insert to authenticated
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.phases ph
    join pro_gestion.projects p on p.id = ph.project_id
    where ph.id = tasks.phase_id
    and (p.owner_id = auth.uid()
         or p.created_by = auth.uid()
         or tasks.assignee_id = auth.uid()
         or (p.team_id is not null and pro_gestion.manages_team(p.team_id)))
  )
);

drop policy if exists "tasks_update" on pro_gestion.tasks;
create policy "tasks_update" on pro_gestion.tasks for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.phases ph
    join pro_gestion.projects p on p.id = ph.project_id
    where ph.id = tasks.phase_id
    and (p.owner_id = auth.uid()
         or p.created_by = auth.uid()
         or tasks.assignee_id = auth.uid()
         or (p.team_id is not null and pro_gestion.manages_team(p.team_id)))
  )
)
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.phases ph
    join pro_gestion.projects p on p.id = ph.project_id
    where ph.id = tasks.phase_id
    and (p.owner_id = auth.uid()
         or p.created_by = auth.uid()
         or tasks.assignee_id = auth.uid()
         or (p.team_id is not null and pro_gestion.manages_team(p.team_id)))
  )
);

drop policy if exists "tasks_read" on pro_gestion.tasks;
create policy "tasks_read" on pro_gestion.tasks for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.phases ph
    join pro_gestion.projects p on p.id = ph.project_id
    where ph.id = tasks.phase_id
    and (p.owner_id = auth.uid()
         or p.client_id = auth.uid()
         or tasks.assignee_id = auth.uid()
         or (p.team_id is not null and pro_gestion.manages_team(p.team_id))
         or (p.team_id is not null and pro_gestion.is_team_member(p.team_id))
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  )
);

-- Milestones (la tabla existe desde mig-6).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='pro_gestion' and table_name='milestones') then

    drop policy if exists "milestones_insert" on pro_gestion.milestones;
    create policy "milestones_insert" on pro_gestion.milestones for insert to authenticated
    with check (
      pro_gestion.is_admin_or_gerente()
      or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id
                 and (p.owner_id = auth.uid()
                      or p.created_by = auth.uid()
                      or (p.team_id is not null and pro_gestion.manages_team(p.team_id))))
    );

    drop policy if exists "milestones_update" on pro_gestion.milestones;
    create policy "milestones_update" on pro_gestion.milestones for update to authenticated
    using (
      pro_gestion.is_admin_or_gerente()
      or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id
                 and (p.owner_id = auth.uid()
                      or p.created_by = auth.uid()
                      or (p.team_id is not null and pro_gestion.manages_team(p.team_id))))
    )
    with check (
      pro_gestion.is_admin_or_gerente()
      or exists (select 1 from pro_gestion.projects p where p.id = milestones.project_id
                 and (p.owner_id = auth.uid()
                      or p.created_by = auth.uid()
                      or (p.team_id is not null and pro_gestion.manages_team(p.team_id))))
    );

  end if;
end $$;

-- ============================================
-- 8) INVITATIONS
-- ============================================
create table if not exists pro_gestion.invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references pro_gestion.teams(id) on delete cascade,
  email text,
  phone text,
  role text not null default 'miembro' check (role in ('miembro','lider_equipo')),
  channel text not null check (channel in ('email','whatsapp')),
  status text not null default 'pendiente'
    check (status in ('pendiente','enviada','aceptada','expirada','cancelada')),
  token text not null default encode(gen_random_bytes(18), 'hex'),
  invited_by uuid references pro_gestion.profiles(id) on delete set null,
  accepted_by uuid references pro_gestion.profiles(id) on delete set null,
  sent_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_token_unique unique (token),
  constraint invitations_channel_target_chk check (
    (channel = 'email'    and email is not null and email <> '')
    or (channel = 'whatsapp' and phone is not null and phone <> '')
  )
);

create index if not exists idx_invitations_team on pro_gestion.invitations(team_id);
create index if not exists idx_invitations_email on pro_gestion.invitations(email);
create index if not exists idx_invitations_status on pro_gestion.invitations(status);

drop trigger if exists invitations_touch on pro_gestion.invitations;
create trigger invitations_touch before update on pro_gestion.invitations
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.invitations enable row level security;

-- Lectura: admin/gerente ve todo. Quien gestiona el equipo (manager o
-- líder) ve sus invitaciones. El invitado por email puede mirar las suyas
-- vía un endpoint público con token, no por RLS.
drop policy if exists "invitations_read" on pro_gestion.invitations;
create policy "invitations_read" on pro_gestion.invitations for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or pro_gestion.manages_team(team_id)
  or invited_by = auth.uid()
);

-- Insert: admin/gerente o quien gestiona el equipo (manager o líder).
-- Forzamos invited_by = auth.uid() para auditoría.
drop policy if exists "invitations_insert" on pro_gestion.invitations;
create policy "invitations_insert" on pro_gestion.invitations for insert to authenticated
with check (
  (
    pro_gestion.is_admin_or_gerente()
    or pro_gestion.manages_team(team_id)
  )
  and invited_by = auth.uid()
);

-- Update: solo para cambiar status/sent_at (la edge function lo hace con
-- service_role, así que ahí la RLS no aplica). Aquí dejamos que el
-- gestor del equipo cancele o reenvíe.
drop policy if exists "invitations_update" on pro_gestion.invitations;
create policy "invitations_update" on pro_gestion.invitations for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or pro_gestion.manages_team(team_id)
)
with check (
  pro_gestion.is_admin_or_gerente()
  or pro_gestion.manages_team(team_id)
);

drop policy if exists "invitations_delete" on pro_gestion.invitations;
create policy "invitations_delete" on pro_gestion.invitations for delete to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or pro_gestion.manages_team(team_id)
);

grant select, insert, update, delete on pro_gestion.invitations to authenticated;

-- ============================================
-- 9) handle_new_user actualizado: si el signup trae raw_user_meta_data
-- con `invitation_token`, lo resolvemos y se asigna el role + team_id de
-- la invitación. Evita escalada porque solo aceptamos los roles que la
-- invitación ya autorizó (miembro | lider_equipo).
-- ============================================
create or replace function pro_gestion.handle_new_user() returns trigger
language plpgsql security definer set search_path = pro_gestion, auth
as $$
declare
  has_admin boolean;
  chosen_role text;
  chosen_team uuid;
  inv pro_gestion.invitations%rowtype;
  v_token text;
begin
  v_token := nullif(new.raw_user_meta_data->>'invitation_token', '');

  if v_token is not null then
    select * into inv from pro_gestion.invitations
      where token = v_token and status in ('pendiente','enviada')
      and (expires_at is null or expires_at > now())
      limit 1;
    if found then
      -- Validamos rol permitido por la invitación.
      if inv.role in ('miembro','lider_equipo') then
        chosen_role := inv.role;
        chosen_team := inv.team_id;
        -- Marcamos la invitación como aceptada.
        update pro_gestion.invitations
          set status = 'aceptada', accepted_by = new.id, updated_at = now()
          where id = inv.id;
      end if;
    end if;
  end if;

  if chosen_role is null then
    select exists(select 1 from pro_gestion.profiles where role = 'admin') into has_admin;
    -- Conservamos compat con mig-7: ya NO leemos `role` desde
    -- raw_user_meta_data (cierra privilege escalation). Solo se asigna
    -- role vía invitación o el fallback estándar.
    chosen_role := case when has_admin then 'miembro' else 'admin' end;
  end if;

  insert into pro_gestion.profiles (id, name, email, role, team_id, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    chosen_role,
    chosen_team,
    coalesce((new.raw_user_meta_data->>'avatar')::smallint, 1 + floor(random()*5)::smallint)
  )
  on conflict (id) do update set
    role = excluded.role,
    team_id = excluded.team_id
    where pro_gestion.profiles.role = 'miembro' and excluded.role in ('miembro','lider_equipo');

  -- Si el lider_equipo aceptó la invitación, lo asignamos a teams.leader_id.
  if chosen_role = 'lider_equipo' and chosen_team is not null then
    update pro_gestion.teams set leader_id = new.id
      where id = chosen_team and leader_id is null;
  end if;

  return new;
end; $$;

-- ============================================
-- 10) Trigger: cuando la invitación pasa a 'aceptada' por un usuario que
-- YA existía en la plataforma (no llegó por signup), enlazamos su perfil
-- al equipo. Lo dispara la API de aceptación.
-- ============================================
create or replace function pro_gestion.apply_accepted_invitation() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'aceptada'
     and old.status is distinct from 'aceptada'
     and new.accepted_by is not null then
    -- Asigna team_id al perfil que aceptó, sin tocar su role si ya tiene
    -- uno staff superior a 'miembro'.
    update pro_gestion.profiles p
      set team_id = new.team_id
      where p.id = new.accepted_by
      and (p.team_id is null or p.team_id is distinct from new.team_id);

    -- Si la invitación era para lider_equipo y el equipo no tiene líder, lo asigna.
    if new.role = 'lider_equipo' then
      update pro_gestion.teams t
        set leader_id = new.accepted_by
        where t.id = new.team_id and t.leader_id is null;
      update pro_gestion.profiles
        set role = 'lider_equipo'
        where id = new.accepted_by and role = 'miembro';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_invitations_apply on pro_gestion.invitations;
create trigger trg_invitations_apply after update on pro_gestion.invitations
for each row execute function pro_gestion.apply_accepted_invitation();

-- ============================================
-- 11) REALTIME publication
-- ============================================
do $$
begin
  begin alter publication supabase_realtime add table pro_gestion.teams;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table pro_gestion.invitations;
  exception when duplicate_object then null; end;
end $$;

-- ============================================
-- 12) Reload PostgREST schema cache
-- ============================================
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
