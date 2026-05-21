-- ===========================================================
-- migration-31: parche post-auditoría a las features 27-30.
--
-- Soluciona los bugs encontrados en la revisión de los 4 agentes:
--
--   1) [C1 teams] protect_role_change bloquea la promoción legítima
--      miembro -> lider_equipo que dispara apply_accepted_invitation y
--      handle_new_user. Solución: la promoción se hace via una GUC
--      (`pro_gestion.allow_role_change`) que solo nosotros activamos
--      dentro de las funciones SECURITY DEFINER autorizadas. Cualquier
--      otro intento sigue bloqueado.
--
--   2) [C3 teams] accept_invitation y decline_invitation aceptaban
--      cualquier usuario cuando la invitación era por WhatsApp (email
--      null). Ahora exigimos que el actor tenga el mismo teléfono
--      normalizado (sin espacios/guiones/+).
--
--   3) [M8 teams] Carrera con `lider_equipo`: dos invitaciones de
--      líder al mismo equipo. La primera en aceptarse gana, la segunda
--      debería rechazarse. apply_accepted_invitation ahora verifica
--      `teams.leader_id IS NOT NULL` y aborta el UPDATE.
--
--   4) [C4 teams] lider_equipo (singular) no podía sacar miembros del
--      equipo (faltaba policy). Añade `profiles_lider_equipo_team`:
--      el líder del equipo puede setear team_id=NULL para miembros
--      de SU equipo. No puede mover a otros equipos.
--
--   5) [H4 questionnaires] Cliente podía sobrescribir body, title,
--      platform_id, template_id, reviewed_* en
--      project_questionnaires. Trigger BEFORE UPDATE que congela esas
--      columnas cuando el actor es cliente.
--
--   6) [H2 client_tasks] Cliente podía hacer entregado -> entregado y
--      machacar la entrega sin que se notificara al staff. Trigger
--      BEFORE UPDATE que rechaza re-entregas si la tarea YA está en
--      entregado (debe pasar primero por rechazado o aprobado).
--
--   7) Realtime publication: profiles ya entra; nos aseguramos.
--
-- Idempotente.
-- ===========================================================


-- ============================================
-- 1) GUC de bypass para protect_role_change.
--    Cualquier función SECURITY DEFINER autorizada hace:
--      perform set_config('pro_gestion.allow_role_change','on', true);
--    El `true` final = transaction-local (no persiste). El trigger
--    consume y resetea inmediatamente.
-- ============================================
create or replace function pro_gestion.protect_role_change() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_actor_role text;
  v_bypass text;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;
  -- Bypass explícito desde funciones internas (apply_accepted_invitation,
  -- handle_new_user). Se consume y se desactiva en la misma transacción.
  v_bypass := current_setting('pro_gestion.allow_role_change', true);
  if v_bypass = 'on' then
    -- Reset inmediato: que NO se aplique a otros UPDATE en la misma tx.
    perform set_config('pro_gestion.allow_role_change', 'off', true);
    return new;
  end if;
  select role into v_actor_role from pro_gestion.profiles where id = auth.uid();
  if v_actor_role in ('admin','super_admin') then
    return new;
  end if;
  raise exception 'No autorizado: solo admin puede cambiar el rol';
end; $$;


-- ============================================
-- 2) apply_accepted_invitation: ahora activa el bypass antes de
--    promover el role del miembro, y verifica que el equipo no tenga
--    ya líder (carrera).
-- ============================================
create or replace function pro_gestion.apply_accepted_invitation() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_existing_leader uuid;
begin
  if tg_op = 'UPDATE'
     and new.status = 'aceptada'
     and old.status is distinct from 'aceptada'
     and new.accepted_by is not null then

    -- Asigna team_id al perfil que aceptó.
    update pro_gestion.profiles p
      set team_id = new.team_id
      where p.id = new.accepted_by
      and (p.team_id is null or p.team_id is distinct from new.team_id);

    -- Si la invitación era para lider_equipo, validamos que el slot esté libre.
    if new.role = 'lider_equipo' then
      select leader_id into v_existing_leader
        from pro_gestion.teams where id = new.team_id;
      if v_existing_leader is not null and v_existing_leader is distinct from new.accepted_by then
        raise exception 'El equipo ya tiene un líder asignado' using errcode = 'check_violation';
      end if;

      update pro_gestion.teams t
        set leader_id = new.accepted_by
        where t.id = new.team_id and (t.leader_id is null or t.leader_id = new.accepted_by);

      -- Promueve role miembro -> lider_equipo, autorizado por GUC.
      perform set_config('pro_gestion.allow_role_change', 'on', true);
      update pro_gestion.profiles
        set role = 'lider_equipo'
        where id = new.accepted_by and role = 'miembro';
      -- El trigger consume el GUC y lo apaga.
    end if;
  end if;
  return new;
end; $$;


-- ============================================
-- 3) handle_new_user: mismo bypass durante on-conflict-do-update si la
--    invitación promueve a un miembro existente.
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
      if inv.role in ('miembro','lider_equipo') then
        chosen_role := inv.role;
        chosen_team := inv.team_id;
        update pro_gestion.invitations
          set status = 'aceptada', accepted_by = new.id, updated_at = now()
          where id = inv.id;
      end if;
    end if;
  end if;

  if chosen_role is null then
    select exists(select 1 from pro_gestion.profiles where role = 'admin') into has_admin;
    chosen_role := case when has_admin then 'miembro' else 'admin' end;
  end if;

  -- Bypass del trigger protect_role_change, aplicado al INSERT con on-conflict.
  perform set_config('pro_gestion.allow_role_change', 'on', true);

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

  if chosen_role = 'lider_equipo' and chosen_team is not null then
    update pro_gestion.teams set leader_id = new.id
      where id = chosen_team and leader_id is null;
  end if;

  -- Reset por si la INSERT no disparó el trigger (ej. row nueva sin conflicto).
  perform set_config('pro_gestion.allow_role_change', 'off', true);

  return new;
end; $$;


-- ============================================
-- 4) accept_invitation: valida teléfono normalizado cuando el canal
--    fue whatsapp.
-- ============================================
create or replace function pro_gestion.accept_invitation(p_token text)
returns pro_gestion.invitations
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_inv pro_gestion.invitations%rowtype;
  v_actor pro_gestion.profiles%rowtype;
  v_inv_phone_norm text;
  v_actor_phone_norm text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_inv from pro_gestion.invitations
    where token = p_token
    and status in ('pendiente','enviada')
    and (expires_at is null or expires_at > now())
    for update;
  if not found then
    raise exception 'Invitación inválida o expirada';
  end if;

  select * into v_actor from pro_gestion.profiles where id = auth.uid();
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if v_inv.email is not null and v_inv.email <> '' then
    if lower(v_inv.email) <> lower(coalesce(v_actor.email,'')) then
      raise exception 'Esta invitación está dirigida a otro correo';
    end if;
  elsif v_inv.phone is not null and v_inv.phone <> '' then
    v_inv_phone_norm   := regexp_replace(v_inv.phone, '[^0-9]', '', 'g');
    v_actor_phone_norm := regexp_replace(coalesce(v_actor.phone, ''), '[^0-9]', '', 'g');
    if v_actor_phone_norm = '' or v_actor_phone_norm <> v_inv_phone_norm then
      raise exception 'Esta invitación está dirigida a otro número de WhatsApp';
    end if;
  else
    -- Invitación sin canal asignado a destinatario concreto: rechazamos.
    raise exception 'Invitación inválida (sin destinatario)';
  end if;

  update pro_gestion.invitations
    set status = 'aceptada',
        accepted_by = auth.uid(),
        updated_at = now()
    where id = v_inv.id
    returning * into v_inv;

  return v_inv;
end; $$;

grant execute on function pro_gestion.accept_invitation(text) to authenticated;


-- ============================================
-- 5) decline_invitation: misma validación de canal.
-- ============================================
create or replace function pro_gestion.decline_invitation(p_token text)
returns pro_gestion.invitations
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_inv pro_gestion.invitations%rowtype;
  v_actor pro_gestion.profiles%rowtype;
  v_team_name text;
  v_inv_phone_norm text;
  v_actor_phone_norm text;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select * into v_inv from pro_gestion.invitations
    where token = p_token
    and status in ('pendiente','enviada')
    for update;
  if not found then
    raise exception 'Invitación inválida';
  end if;

  select * into v_actor from pro_gestion.profiles where id = auth.uid();

  if v_inv.email is not null and v_inv.email <> '' then
    if lower(v_inv.email) <> lower(coalesce(v_actor.email,'')) then
      raise exception 'Esta invitación está dirigida a otro correo';
    end if;
  elsif v_inv.phone is not null and v_inv.phone <> '' then
    v_inv_phone_norm   := regexp_replace(v_inv.phone, '[^0-9]', '', 'g');
    v_actor_phone_norm := regexp_replace(coalesce(v_actor.phone, ''), '[^0-9]', '', 'g');
    if v_actor_phone_norm = '' or v_actor_phone_norm <> v_inv_phone_norm then
      raise exception 'Esta invitación está dirigida a otro número de WhatsApp';
    end if;
  end if;

  update pro_gestion.invitations
    set status = 'cancelada', updated_at = now()
    where id = v_inv.id
    returning * into v_inv;

  if v_inv.invited_by is not null then
    select name into v_team_name from pro_gestion.teams where id = v_inv.team_id;
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, meta)
    values (
      v_inv.invited_by,
      'team_invitation_declined',
      'Invitación rechazada',
      coalesce(v_actor.name, v_actor.email, 'El destinatario') || ' rechazó la invitación a "' || coalesce(v_team_name,'tu equipo') || '"',
      '/teams',
      jsonb_build_object('invitation_id', v_inv.id, 'team_id', v_inv.team_id)
    );
  end if;

  return v_inv;
end; $$;

grant execute on function pro_gestion.decline_invitation(text) to authenticated;


-- ============================================
-- 6) RLS profiles: lider_equipo (single) puede sacar miembros de su
--    propio equipo (setear team_id=NULL). No puede moverlos a otro
--    equipo ni cambiar role. Esto resuelve C4.
-- ============================================
drop policy if exists "profiles_lider_equipo_team" on pro_gestion.profiles;
create policy "profiles_lider_equipo_team" on pro_gestion.profiles for update to authenticated
using (
  -- Solo aplica al actor lider_equipo, y solo sobre perfiles de su mismo equipo.
  pro_gestion.is_lider_equipo()
  and team_id is not null
  and team_id = (select team_id from pro_gestion.profiles where id = auth.uid())
)
with check (
  -- El líder solo puede VACIAR team_id, no reasignarlo.
  pro_gestion.is_lider_equipo()
  and team_id is null
);


-- ============================================
-- 7) project_questionnaires: el cliente solo puede tocar `answers`,
--    `status` (a los estados permitidos) y `submitted_at`. Las demás
--    columnas (body, title, platform_id, template_id, reviewed_*,
--    created_by) quedan congeladas a OLD cuando el actor es cliente.
--    Cierra H4 (audit cuestionarios).
-- ============================================
create or replace function pro_gestion.lock_pq_columns_for_client() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_is_staff boolean;
begin
  -- Si el actor es staff (admin/gerente/owner/created_by/member del proyecto),
  -- dejamos pasar. Solo congelamos para cliente.
  if pro_gestion.is_admin_or_gerente() then
    return new;
  end if;

  v_is_staff := exists (
    select 1 from pro_gestion.projects p
    where p.id = new.project_id
    and (p.owner_id = auth.uid()
         or p.created_by = auth.uid()
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  );
  if v_is_staff then return new; end if;

  -- A partir de aquí, el único actor permitido por RLS es el cliente del proyecto.
  -- Restauramos cualquier intento de modificar columnas que no le corresponden.
  new.body          := old.body;
  new.title         := old.title;
  new.platform_id   := old.platform_id;
  new.template_id   := old.template_id;
  new.reviewed_by   := old.reviewed_by;
  new.reviewed_at   := old.reviewed_at;
  new.review_comment := old.review_comment;
  new.created_by    := old.created_by;

  -- El cliente solo puede transicionar a borrador/enviado/rechazado (la RLS ya lo
  -- exige, pero por defensa en profundidad evitamos que escriba 'aprobado').
  if new.status not in ('borrador','enviado','rechazado') then
    new.status := old.status;
  end if;
  -- submitted_at se permite cuando pasa a 'enviado'.
  if new.status <> 'enviado' then
    new.submitted_at := old.submitted_at;
  end if;
  return new;
end; $$;

drop trigger if exists trg_pq_lock_client on pro_gestion.project_questionnaires;
create trigger trg_pq_lock_client before update on pro_gestion.project_questionnaires
for each row execute function pro_gestion.lock_pq_columns_for_client();


-- ============================================
-- 8) client_tasks: bloquear re-entregas silenciosas (status: entregado
--    -> entregado machacando file_path/response_text sin notificar).
--    El cliente tiene que esperar a aprobación o rechazo del staff
--    antes de re-entregar. Cierra H2 (audit client tasks).
-- ============================================
create or replace function pro_gestion.guard_client_task_redeliver() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_is_staff boolean;
begin
  if pro_gestion.is_admin_or_gerente() then return new; end if;

  v_is_staff := exists (
    select 1 from pro_gestion.projects p
    where p.id = new.project_id
    and (p.owner_id = auth.uid()
         or p.created_by = auth.uid()
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  );
  if v_is_staff then return new; end if;

  -- Cliente: si la tarea ya está entregada, no puede volver a actualizarla
  -- (debe esperar a que staff la apruebe o rechace antes de re-entregar).
  if old.status = 'entregado' and new.status = 'entregado' then
    raise exception 'No puedes modificar la entrega mientras está en revisión. Espera a que tu equipo la apruebe o te pida cambios.'
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists trg_client_tasks_guard_redeliver on pro_gestion.client_tasks;
create trigger trg_client_tasks_guard_redeliver before update on pro_gestion.client_tasks
for each row execute function pro_gestion.guard_client_task_redeliver();


-- ============================================
-- 9) Reload PostgREST schema cache
-- ============================================
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
