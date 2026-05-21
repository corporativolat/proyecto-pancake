-- ===========================================================
-- migration-30: invitaciones in-app para usuarios existentes.
--
-- Hasta mig-27 el flujo era: crear `invitations` y mandar email (o
-- WhatsApp stub). Si el invitado ya tenía cuenta en la plataforma, igual
-- recibía email — no es lo más limpio. Esta migración:
--
--   1) Trigger AFTER INSERT en `invitations`: si el email/teléfono
--      corresponde a un profile existente, inserta una notificación
--      in-app del kind 'team_invitation'. La edge function `invite-user`
--      detecta el match y skipea el envío externo (ver index.ts).
--
--   2) RPC `accept_invitation(p_token text)` SECURITY DEFINER: permite a
--      un usuario autenticado aceptar una invitación pendiente. Setea
--      status='aceptada' + accepted_by=auth.uid(). El trigger
--      `apply_accepted_invitation` (de mig-27) hace el resto: asigna
--      team_id, promueve a lider_equipo si corresponde, ocupa el slot
--      leader_id del equipo.
--
--   3) RPC `decline_invitation(p_token text)`: marca como 'cancelada'.
--
-- Idempotente.
-- ===========================================================

-- ============================================
-- 1) Trigger: notif in-app a usuarios existentes
-- ============================================
create or replace function pro_gestion.notify_invitation_event() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_target_id uuid;
  v_team pro_gestion.teams%rowtype;
  v_inviter text;
  v_role_label text;
begin
  -- Match por email primero (más confiable). Si la invitación es por
  -- WhatsApp, intentamos por phone (mig-20 añadió profiles.phone).
  if new.email is not null and new.email <> '' then
    select id into v_target_id from pro_gestion.profiles
      where lower(email) = lower(new.email)
      limit 1;
  end if;

  if v_target_id is null and new.phone is not null and new.phone <> '' then
    select id into v_target_id from pro_gestion.profiles
      where phone is not null and replace(replace(replace(phone,' ',''),'-',''),'+','') =
                                    replace(replace(replace(new.phone,' ',''),'-',''),'+','')
      limit 1;
  end if;

  if v_target_id is null then
    return new; -- destinatario externo; no hay notif in-app, manda email/WA.
  end if;

  -- Datos de presentación.
  select * into v_team from pro_gestion.teams where id = new.team_id;
  if not found then return new; end if;

  select name into v_inviter from pro_gestion.profiles where id = new.invited_by;
  v_role_label := case when new.role = 'lider_equipo' then 'líder del equipo' else 'miembro' end;

  insert into pro_gestion.notifications (profile_id, kind, title, body, link, meta)
  values (
    v_target_id,
    'team_invitation',
    'Invitación a equipo',
    coalesce(v_inviter, 'Alguien') || ' te invita como ' || v_role_label || ' a "' || v_team.name || '"',
    '/?invite=' || new.token,
    jsonb_build_object(
      'invitation_id', new.id,
      'token', new.token,
      'team_id', new.team_id,
      'team_name', v_team.name,
      'role', new.role
    )
  );

  return new;
end; $$;

drop trigger if exists trg_invitations_notify on pro_gestion.invitations;
create trigger trg_invitations_notify after insert on pro_gestion.invitations
for each row execute function pro_gestion.notify_invitation_event();

-- ============================================
-- 2) RPC accept_invitation: el cliente la dispara desde el bell.
-- ============================================
create or replace function pro_gestion.accept_invitation(p_token text)
returns pro_gestion.invitations
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_inv pro_gestion.invitations%rowtype;
  v_actor pro_gestion.profiles%rowtype;
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

  -- Si la invitación tiene email asignado, validamos que el actor sea ese
  -- usuario (case-insensitive). Esto evita que cualquiera con el token
  -- acepte por otra persona.
  if v_inv.email is not null and v_inv.email <> '' then
    if lower(v_inv.email) <> lower(v_actor.email) then
      raise exception 'Esta invitación está dirigida a otro correo';
    end if;
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
-- 3) RPC decline_invitation: marca cancelada y notifica al invitador.
-- ============================================
create or replace function pro_gestion.decline_invitation(p_token text)
returns pro_gestion.invitations
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_inv pro_gestion.invitations%rowtype;
  v_actor pro_gestion.profiles%rowtype;
  v_team_name text;
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

  if v_inv.email is not null and v_inv.email <> '' and v_actor.email is not null then
    if lower(v_inv.email) <> lower(v_actor.email) then
      raise exception 'Esta invitación está dirigida a otro correo';
    end if;
  end if;

  update pro_gestion.invitations
    set status = 'cancelada', updated_at = now()
    where id = v_inv.id
    returning * into v_inv;

  -- Notificar al invitador, si está en la plataforma.
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
-- 4) También notifica al invitador cuando la invitación pasa a 'aceptada'.
--    El trigger apply_accepted_invitation ya hace la parte de
--    profiles/teams; aquí solo añadimos la notif.
-- ============================================
create or replace function pro_gestion.notify_invitation_accepted() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_team_name text;
  v_actor_name text;
begin
  if tg_op = 'UPDATE'
     and new.status = 'aceptada'
     and old.status is distinct from 'aceptada'
     and new.invited_by is not null then
    select name into v_team_name from pro_gestion.teams where id = new.team_id;
    select name into v_actor_name from pro_gestion.profiles where id = new.accepted_by;
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, meta)
    values (
      new.invited_by,
      'team_invitation_accepted',
      'Invitación aceptada',
      coalesce(v_actor_name, 'El invitado') || ' se unió a "' || coalesce(v_team_name,'tu equipo') || '"',
      '/teams',
      jsonb_build_object('invitation_id', new.id, 'team_id', new.team_id)
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_invitations_notify_accepted on pro_gestion.invitations;
create trigger trg_invitations_notify_accepted after update on pro_gestion.invitations
for each row execute function pro_gestion.notify_invitation_accepted();

-- ============================================
-- 5) Reload PostgREST schema cache
-- ============================================
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
