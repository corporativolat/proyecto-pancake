-- ===========================================================
-- migration-29: cuestionarios por plataforma (reemplaza intake_forms).
--
-- Reemplaza el sistema viejo (1 intake por proyecto anclado a
-- projects.business_type) por:
--   - pro_gestion.platforms              -> catálogo (Botcake, CRM, Pancake…)
--   - pro_gestion.questionnaire_templates-> plantillas ancladas a una plataforma
--   - pro_gestion.project_questionnaires -> instancias por proyecto (N por
--     proyecto, snapshot editable del body de la plantilla al momento de
--     enviarse).
--
-- Migra los datos existentes:
--   - intake_forms.business_type → mapeo a la plantilla Botcake correspondiente.
--   - intake_forms.answers       → project_questionnaires.answers
--   - intake_forms.status        → project_questionnaires.status
--
-- Tras migrar, dropea pro_gestion.intake_forms y projects.business_type.
--
-- Idempotente.
-- ===========================================================

-- ============================================
-- 0) GUARDS
-- ============================================
-- gen_random_uuid() vive en pgcrypto; ya está habilitada por setup.

-- ============================================
-- 1) PLATFORMS
-- ============================================
create table if not exists pro_gestion.platforms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  icon text not null default '',
  color text not null default '#6366f1',
  position smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platforms_active on pro_gestion.platforms(active);
create index if not exists idx_platforms_position on pro_gestion.platforms(position);

drop trigger if exists platforms_touch on pro_gestion.platforms;
create trigger platforms_touch before update on pro_gestion.platforms
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.platforms enable row level security;

drop policy if exists "platforms_read" on pro_gestion.platforms;
create policy "platforms_read" on pro_gestion.platforms for select to authenticated using (true);

drop policy if exists "platforms_insert" on pro_gestion.platforms;
create policy "platforms_insert" on pro_gestion.platforms for insert to authenticated
with check (pro_gestion.is_admin());

drop policy if exists "platforms_update" on pro_gestion.platforms;
create policy "platforms_update" on pro_gestion.platforms for update to authenticated
using (pro_gestion.is_admin()) with check (pro_gestion.is_admin());

drop policy if exists "platforms_delete" on pro_gestion.platforms;
create policy "platforms_delete" on pro_gestion.platforms for delete to authenticated
using (pro_gestion.is_admin());

grant select, insert, update, delete on pro_gestion.platforms to authenticated;

-- Seed inicial (idempotente).
insert into pro_gestion.platforms (slug, name, description, icon, color, position)
values
  ('botcake', 'Botcake', 'Bots de WhatsApp / Instagram para ventas y soporte', '🤖', '#22c55e', 1),
  ('crm',     'CRM',     'Plataforma CRM Pancake',                              '📊', '#3b82f6', 2),
  ('pancake', 'Pancake', 'Plataforma de gestión Pancake (este sistema)',        '🥞', '#f59e0b', 3)
on conflict (slug) do nothing;

-- ============================================
-- 2) QUESTIONNAIRE_TEMPLATES
-- ============================================
create table if not exists pro_gestion.questionnaire_templates (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references pro_gestion.platforms(id) on delete cascade,
  name text not null,
  description text not null default '',
  body jsonb not null default '{"sections":[]}'::jsonb,
  position smallint not null default 0,
  active boolean not null default true,
  created_by uuid references pro_gestion.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qtpl_platform on pro_gestion.questionnaire_templates(platform_id);
create index if not exists idx_qtpl_active on pro_gestion.questionnaire_templates(active);

drop trigger if exists qtpl_touch on pro_gestion.questionnaire_templates;
create trigger qtpl_touch before update on pro_gestion.questionnaire_templates
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.questionnaire_templates enable row level security;

drop policy if exists "qtpl_read" on pro_gestion.questionnaire_templates;
create policy "qtpl_read" on pro_gestion.questionnaire_templates for select to authenticated using (true);

drop policy if exists "qtpl_insert" on pro_gestion.questionnaire_templates;
create policy "qtpl_insert" on pro_gestion.questionnaire_templates for insert to authenticated
with check (pro_gestion.is_admin());

drop policy if exists "qtpl_update" on pro_gestion.questionnaire_templates;
create policy "qtpl_update" on pro_gestion.questionnaire_templates for update to authenticated
using (pro_gestion.is_admin()) with check (pro_gestion.is_admin());

drop policy if exists "qtpl_delete" on pro_gestion.questionnaire_templates;
create policy "qtpl_delete" on pro_gestion.questionnaire_templates for delete to authenticated
using (pro_gestion.is_admin());

grant select, insert, update, delete on pro_gestion.questionnaire_templates to authenticated;

-- ============================================
-- 3) PROJECT_QUESTIONNAIRES (instancias)
-- ============================================
create table if not exists pro_gestion.project_questionnaires (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references pro_gestion.projects(id) on delete cascade,
  template_id uuid references pro_gestion.questionnaire_templates(id) on delete set null,
  platform_id uuid references pro_gestion.platforms(id) on delete set null,
  title text not null,
  body jsonb not null default '{"sections":[]}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'borrador' check (status in ('borrador','enviado','aprobado','rechazado')),
  submitted_at timestamptz,
  reviewed_by uuid references pro_gestion.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text not null default '',
  created_by uuid references pro_gestion.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pq_project on pro_gestion.project_questionnaires(project_id);
create index if not exists idx_pq_template on pro_gestion.project_questionnaires(template_id);
create index if not exists idx_pq_status on pro_gestion.project_questionnaires(status);
create index if not exists idx_pq_platform on pro_gestion.project_questionnaires(platform_id);

drop trigger if exists pq_touch on pro_gestion.project_questionnaires;
create trigger pq_touch before update on pro_gestion.project_questionnaires
for each row execute function pro_gestion.touch_updated_at();

alter table pro_gestion.project_questionnaires enable row level security;

-- READ: staff (admin/gerente/owner/created_by/miembro) o cliente del proyecto.
drop policy if exists "pq_read" on pro_gestion.project_questionnaires;
create policy "pq_read" on pro_gestion.project_questionnaires for select to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = project_questionnaires.project_id
    and (
      p.owner_id = auth.uid()
      or p.client_id = auth.uid()
      or p.created_by = auth.uid()
      or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid())
    )
  )
);

-- INSERT: staff (la flow normal es desde "Enviar cuestionario" en la UI).
drop policy if exists "pq_insert" on pro_gestion.project_questionnaires;
create policy "pq_insert" on pro_gestion.project_questionnaires for insert to authenticated
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = project_id
    and (p.owner_id = auth.uid() or p.created_by = auth.uid()
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  )
);

-- UPDATE:
--   staff: cualquier campo (incluida revisión).
--   cliente del proyecto: sólo si status in ('borrador','rechazado').
drop policy if exists "pq_update" on pro_gestion.project_questionnaires;
create policy "pq_update" on pro_gestion.project_questionnaires for update to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = project_questionnaires.project_id
    and (p.owner_id = auth.uid() or p.created_by = auth.uid()
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  )
  or (pro_gestion.is_project_client(project_id) and status in ('borrador','rechazado'))
)
with check (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = project_questionnaires.project_id
    and (p.owner_id = auth.uid() or p.created_by = auth.uid()
         or exists (select 1 from pro_gestion.project_members m where m.project_id = p.id and m.profile_id = auth.uid()))
  )
  or (pro_gestion.is_project_client(project_id) and status in ('borrador','enviado','rechazado'))
);

-- DELETE: staff con acceso al proyecto.
drop policy if exists "pq_delete" on pro_gestion.project_questionnaires;
create policy "pq_delete" on pro_gestion.project_questionnaires for delete to authenticated
using (
  pro_gestion.is_admin_or_gerente()
  or exists (
    select 1 from pro_gestion.projects p
    where p.id = project_questionnaires.project_id
    and (p.owner_id = auth.uid() or p.created_by = auth.uid())
  )
);

grant select, insert, update, delete on pro_gestion.project_questionnaires to authenticated;

-- ============================================
-- 4) Trigger de notificaciones (igual que intake_forms).
-- ============================================
create or replace function pro_gestion.notify_questionnaire_event() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_project pro_gestion.projects%rowtype;
begin
  select * into v_project from pro_gestion.projects where id = new.project_id;
  if not found then return new; end if;

  -- Cliente envía para revisión
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status = 'enviado'
     and v_project.owner_id is not null
  then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_project.owner_id,
      'questionnaire_submitted',
      'Cuestionario enviado',
      'El cliente envió el cuestionario "' || new.title || '" en "' || v_project.title || '" para tu revisión',
      '/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('questionnaire_id', new.id, 'title', new.title)
    );
  end if;

  -- Staff aprueba o rechaza
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('aprobado','rechazado')
     and v_project.client_id is not null
  then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_project.client_id,
      'questionnaire_reviewed',
      case when new.status = 'aprobado' then 'Cuestionario aprobado' else 'Cuestionario con observaciones' end,
      case when new.status = 'aprobado'
        then 'Tu cuestionario "' || new.title || '" de "' || v_project.title || '" fue aprobado.'
        else 'Revisa los comentarios y reenvía el cuestionario "' || new.title || '" de "' || v_project.title || '"'
      end,
      '/portal/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('questionnaire_id', new.id, 'title', new.title, 'status', new.status)
    );
  end if;

  -- Staff envía cuestionario al cliente (INSERT con status borrador): notif al cliente.
  if tg_op = 'INSERT'
     and v_project.client_id is not null
     and new.status = 'borrador'
  then
    insert into pro_gestion.notifications (profile_id, kind, title, body, link, project_id, meta)
    values (
      v_project.client_id,
      'questionnaire_assigned',
      'Nuevo cuestionario',
      'Tienes un nuevo cuestionario pendiente: "' || new.title || '" en "' || v_project.title || '"',
      '/portal/projects/' || v_project.id::text,
      v_project.id,
      jsonb_build_object('questionnaire_id', new.id, 'title', new.title)
    );
  end if;

  return new;
end; $$;

drop trigger if exists trg_pq_notify_ins on pro_gestion.project_questionnaires;
create trigger trg_pq_notify_ins after insert on pro_gestion.project_questionnaires
for each row execute function pro_gestion.notify_questionnaire_event();

drop trigger if exists trg_pq_notify_upd on pro_gestion.project_questionnaires;
create trigger trg_pq_notify_upd after update on pro_gestion.project_questionnaires
for each row execute function pro_gestion.notify_questionnaire_event();

-- ============================================
-- 5) REALTIME publication
-- ============================================
do $$
begin
  begin alter publication supabase_realtime add table pro_gestion.platforms;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table pro_gestion.questionnaire_templates;
  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table pro_gestion.project_questionnaires;
  exception when duplicate_object then null; end;
end $$;

-- ============================================
-- 6) SEED: 3 plantillas Botcake migradas desde src/lib/intakeSchemas.js
--    (sólo si la plataforma 'botcake' no tiene plantillas todavía).
-- ============================================
do $$
declare
  v_botcake_id uuid;
  v_tpl_count int;
  v_infoproductor_id uuid;
  v_ecommerce_id uuid;
  v_servicios_id uuid;
begin
  select id into v_botcake_id from pro_gestion.platforms where slug = 'botcake';
  if v_botcake_id is null then return; end if;

  select count(*) into v_tpl_count
    from pro_gestion.questionnaire_templates where platform_id = v_botcake_id;
  if v_tpl_count > 0 then return; end if;

  -- ---------------- INFOPRODUCTOR ----------------
  insert into pro_gestion.questionnaire_templates (platform_id, name, description, position, body)
  values (
    v_botcake_id,
    'Infoproductor',
    'Cursos, mentorías, membresías, high ticket.',
    1,
    $json$
    {"sections":[
      {"title":"1. Información general y ecosistema digital","description_html":"","questions":[
        {"key":"brand_name","type":"text","label_html":"<p>Nombre de la marca personal o comercial</p>","help_html":"","required":true,"options":[]},
        {"key":"niches","type":"textarea","label_html":"<p>Nichos y sub-nichos que manejas</p>","help_html":"<p>Ej: Fitness para mujeres, Trading para principiantes</p>","required":false,"options":[]},
        {"key":"who_replies","type":"multiselect","label_html":"<p>¿Quién responde actualmente los mensajes?</p>","help_html":"","required":false,"options":["Tú","Closer de ventas","Setter","Asistente","Nadie aún"]},
        {"key":"lead_channels","type":"multiselect","label_html":"<p>¿Por qué canales llegan los leads?</p>","help_html":"","required":false,"options":["Instagram DM","Facebook Ads","TikTok","YouTube","WhatsApp","Web","Otro"]}
      ]},
      {"title":"2. Portafolio de infoproductos (escalera de valor)","description_html":"","questions":[
        {"key":"product_type","type":"multiselect","label_html":"<p>Tipo de producto digital</p>","help_html":"","required":false,"options":["Curso online","Membresía","Programa grupal","Mentoría 1 a 1","Plantilla","Software","Otro"]},
        {"key":"product_name","type":"text","label_html":"<p>Nombre específico del producto</p>","help_html":"","required":false,"options":[]},
        {"key":"product_pitch","type":"textarea","label_html":"<p>Explícalo en una sola frase (qué es y qué resultado promete)</p>","help_html":"","required":false,"options":[]},
        {"key":"product_format","type":"textarea","label_html":"<p>¿Es 100% digital o incluye componentes en vivo / físicos / comunidad?</p>","help_html":"","required":false,"options":[]},
        {"key":"upsells","type":"textarea","label_html":"<p>¿Manejas Order Bumps o Upsells (productos adicionales al pagar)?</p>","help_html":"","required":false,"options":[]},
        {"key":"closing_call_required","type":"textarea","label_html":"<p>¿Qué productos requieren llamada de cierre obligatoria?</p>","help_html":"","required":false,"options":[]},
        {"key":"main_problem","type":"textarea","label_html":"<p>¿Qué problema principal resuelve tu producto en la vida o negocio del cliente?</p>","help_html":"","required":false,"options":[]},
        {"key":"problem_consequences","type":"textarea","label_html":"<p>¿Qué consecuencias tiene ese problema si no lo resuelve?</p>","help_html":"<p>Emocionales, económicas, de tiempo, status…</p>","required":false,"options":[]},
        {"key":"failed_alternatives","type":"textarea","label_html":"<p>Antes de comprarte, ¿qué intentan tus clientes y por qué no les funciona?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"3. Cliente ideal","description_html":"","questions":[
        {"key":"icp_profile","type":"textarea","label_html":"<p>Perfil de tu cliente ideal (edad, profesión, nivel socioeconómico, país)</p>","help_html":"","required":false,"options":[]},
        {"key":"icp_starting_point","type":"textarea","label_html":"<p>¿En qué situación está el cliente cuando te busca?</p>","help_html":"","required":false,"options":[]},
        {"key":"icp_goal","type":"textarea","label_html":"<p>¿Qué meta o transformación quiere lograr?</p>","help_html":"","required":false,"options":[]},
        {"key":"sales_journey","type":"textarea","label_html":"<p>Paso a paso desde que un lead escribe hasta que compra</p>","help_html":"","required":false,"options":[]},
        {"key":"hot_lead_definition","type":"textarea","label_html":"<p>¿Cómo defines un lead \"caliente\" vs uno curioso?</p>","help_html":"","required":false,"options":[]},
        {"key":"qualifying_questions","type":"textarea","label_html":"<p>¿Qué preguntas clave debe hacer el bot para filtrar quien no puede pagar el High Ticket?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"4. Contenido y estructura del producto","description_html":"","questions":[
        {"key":"modules","type":"textarea","label_html":"<p>Módulos, lecciones o secciones (lista breve)</p>","help_html":"","required":false,"options":[]},
        {"key":"duration","type":"text","label_html":"<p>Duración aproximada (semanas, horas, sesiones)</p>","help_html":"","required":false,"options":[]},
        {"key":"downloadables","type":"textarea","label_html":"<p>Material descargable incluido (plantillas, PDF, checklists)</p>","help_html":"","required":false,"options":[]},
        {"key":"community","type":"textarea","label_html":"<p>¿Incluye comunidad o canal de soporte? ¿Qué tipo de acompañamiento?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"5. Propuesta de valor y diferenciación","description_html":"","questions":[
        {"key":"differentiation","type":"textarea","label_html":"<p>¿Qué te hace diferente de competidores similares?</p>","help_html":"","required":false,"options":[]},
        {"key":"main_promise","type":"textarea","label_html":"<p>Promesa principal (beneficio central concreto y medible)</p>","help_html":"","required":false,"options":[]},
        {"key":"common_objections","type":"textarea","label_html":"<p>Objeciones frecuentes antes de comprar</p>","help_html":"<p>Precio, tiempo, desconfianza, saturación…</p>","required":false,"options":[]}
      ]},
      {"title":"6. Precio, condiciones y garantías","description_html":"","questions":[
        {"key":"price","type":"text","label_html":"<p>Precio actual y moneda</p>","help_html":"","required":false,"options":[]},
        {"key":"plans","type":"textarea","label_html":"<p>¿Manejas planes o paquetes? ¿Qué incluye cada uno?</p>","help_html":"","required":false,"options":[]},
        {"key":"payment_facilities","type":"textarea","label_html":"<p>¿Facilidades de pago (cuotas, financiación, promos)?</p>","help_html":"","required":false,"options":[]},
        {"key":"guarantee","type":"textarea","label_html":"<p>¿Garantía? (devolución de X días, satisfacción, acceso extendido)</p>","help_html":"","required":false,"options":[]},
        {"key":"lead_qualification_data","type":"textarea","label_html":"<p>¿Qué datos necesitas para calificar un lead?</p>","help_html":"<p>Presupuesto, experiencia, país…</p>","required":false,"options":[]},
        {"key":"checkout_platform","type":"multiselect","label_html":"<p>¿Dónde realizas la venta final?</p>","help_html":"","required":false,"options":["Hotmart","Stripe","Web propia","Transferencia manual","PayU","Mercado Pago","Otro"]},
        {"key":"sale_closed_when","type":"select","label_html":"<p>¿Cuándo se considera una venta cerrada?</p>","help_html":"","required":false,"options":["Pago total","Pago de reserva","Inscripción","Otro"]}
      ]},
      {"title":"7. Pruebas sociales y resultados","description_html":"","questions":[
        {"key":"testimonials","type":"textarea","label_html":"<p>Testimonios o casos de éxito (describe 2-3 brevemente)</p>","help_html":"","required":false,"options":[]},
        {"key":"success_metrics","type":"textarea","label_html":"<p>Métricas o indicadores para validar que el producto funciona</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"8. Post-venta y fidelización","description_html":"","questions":[
        {"key":"delivery_method","type":"textarea","label_html":"<p>¿Cómo entregas el producto una vez pagado?</p>","help_html":"<p>Acceso automático por mail, grupo de WhatsApp…</p>","required":false,"options":[]},
        {"key":"affiliate_system","type":"textarea","label_html":"<p>¿Manejas sistema de afiliados o referidos?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"9. Gestión de crisis y soporte","description_html":"","questions":[
        {"key":"handoff_to_human","type":"textarea","label_html":"<p>¿En qué casos el bot debe transferir a un humano?</p>","help_html":"<p>Fallas de pago, quejas de acceso, casos sensibles…</p>","required":false,"options":[]},
        {"key":"refund_policy","type":"textarea","label_html":"<p>Política de devoluciones y garantías</p>","help_html":"","required":false,"options":[]}
      ]}
    ]}
    $json$::jsonb
  ) returning id into v_infoproductor_id;

  -- ---------------- ECOMMERCE ----------------
  insert into pro_gestion.questionnaire_templates (platform_id, name, description, position, body)
  values (
    v_botcake_id,
    'E-commerce',
    'Tienda con catálogo, envíos, garantías.',
    2,
    $json$
    {"sections":[
      {"title":"1. Conocimiento de marca (branding y posicionamiento)","description_html":"","questions":[
        {"key":"legal_name","type":"text","label_html":"<p>Nombre legal de la empresa</p>","help_html":"","required":true,"options":[]},
        {"key":"commercial_name","type":"text","label_html":"<p>Nombre comercial y variantes de marca</p>","help_html":"","required":false,"options":[]},
        {"key":"locations","type":"textarea","label_html":"<p>Ubicación(es) física(s)</p>","help_html":"<p>Ciudad, país, sucursales</p>","required":false,"options":[]},
        {"key":"business_description","type":"textarea","label_html":"<p>Descripción extendida del negocio (qué hace, para quién, cómo se diferencia)</p>","help_html":"","required":false,"options":[]},
        {"key":"one_line_pitch","type":"text","label_html":"<p>Definición en una frase frente al cliente</p>","help_html":"<p>Ej: somos X que ayuda a Y a lograr Z</p>","required":false,"options":[]},
        {"key":"main_problem_solved","type":"textarea","label_html":"<p>¿Qué problema principal solucionas?</p>","help_html":"","required":false,"options":[]},
        {"key":"key_benefits","type":"textarea","label_html":"<p>3-5 beneficios clave de tus productos</p>","help_html":"","required":false,"options":[]},
        {"key":"differentiators","type":"textarea","label_html":"<p>Diferenciales frente a la competencia</p>","help_html":"<p>Precio, calidad, servicio, rapidez, personalización, garantía</p>","required":false,"options":[]},
        {"key":"minimum_promise","type":"textarea","label_html":"<p>Promesa mínima que siempre se debe cumplir</p>","help_html":"<p>Ej: tiempos de entrega, calidad</p>","required":false,"options":[]},
        {"key":"allowed_tones","type":"multiselect","label_html":"<p>Tonos permitidos</p>","help_html":"","required":false,"options":["Formal","Cercano","Juvenil","Premium","Técnico","Divertido"]},
        {"key":"bot_must_never_say","type":"textarea","label_html":"<p>¿Qué cosas NUNCA quieres que diga el bot sobre tu marca?</p>","help_html":"","required":false,"options":[]},
        {"key":"forbidden_words","type":"textarea","label_html":"<p>Palabras o expresiones prohibidas</p>","help_html":"","required":false,"options":[]},
        {"key":"tone_examples","type":"textarea","label_html":"<p>Ejemplos de respuestas en tono correcto e incorrecto</p>","help_html":"","required":false,"options":[]},
        {"key":"social_links","type":"textarea","label_html":"<p>Redes sociales oficiales (links)</p>","help_html":"","required":false,"options":[]},
        {"key":"web_links","type":"textarea","label_html":"<p>Sitio web principal y landings importantes</p>","help_html":"","required":false,"options":[]},
        {"key":"sale_restrictions","type":"textarea","label_html":"<p>Restricciones de venta (edad, regulación, licencias)</p>","help_html":"","required":false,"options":[]},
        {"key":"active_promos","type":"textarea","label_html":"<p>Ofertas vigentes, cupones y condiciones</p>","help_html":"","required":false,"options":[]},
        {"key":"product_faq","type":"textarea","label_html":"<p>Preguntas frecuentes específicas por producto</p>","help_html":"<p>FAQ detallado por línea</p>","required":false,"options":[]}
      ]},
      {"title":"2. Perfil del lead que entra por pauta","description_html":"","questions":[
        {"key":"lead_context","type":"textarea","label_html":"<p>¿Qué debe saber el bot cuando alguien viene de anuncio?</p>","help_html":"<p>Ya vio precio, ya vio fotos…</p>","required":false,"options":[]},
        {"key":"min_lead_info","type":"multiselect","label_html":"<p>Información mínima a capturar para vender</p>","help_html":"","required":false,"options":["Nombre","Ciudad","Teléfono","Canal preferido","Presupuesto","Email"]},
        {"key":"qualifying_questions","type":"textarea","label_html":"<p>Preguntas de calificación que debe hacer el bot</p>","help_html":"","required":false,"options":[]},
        {"key":"qualified_criteria","type":"textarea","label_html":"<p>Criterios para considerar un lead \"calificado\" y listo para ventas humanas</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"3. Preguntas de descubrimiento para venta","description_html":"","questions":[
        {"key":"decision_drivers","type":"multiselect","label_html":"<p>¿Qué es lo más importante para el cliente al decidir?</p>","help_html":"","required":false,"options":["Precio","Tiempo","Calidad","Diseño","Marca","Garantía"]},
        {"key":"expected_objections","type":"textarea","label_html":"<p>Objeciones que espera el negocio</p>","help_html":"<p>Precio alto, miedo a estafa, tiempos de entrega, calidad…</p>","required":false,"options":[]},
        {"key":"objection_scripts","type":"textarea","label_html":"<p>Respuestas modelo para manejar cada objeción</p>","help_html":"","required":false,"options":[]},
        {"key":"sales_triggers","type":"multiselect","label_html":"<p>¿Qué \"gatillos\" debe usar el bot?</p>","help_html":"","required":false,"options":["Escasez","Garantía","Casos de éxito","Testimonios","Envío gratis","Cupón limitado"]}
      ]},
      {"title":"4. Proceso de cierre de venta","description_html":"","questions":[
        {"key":"next_step_after_doubts","type":"textarea","label_html":"<p>¿Cuál es el siguiente paso ideal después de resolver dudas?</p>","help_html":"","required":false,"options":[]},
        {"key":"closing_script","type":"textarea","label_html":"<p>Script de cierre que quieres que use el bot</p>","help_html":"","required":false,"options":[]},
        {"key":"on_will_think","type":"textarea","label_html":"<p>¿Qué hace el bot si el cliente dice \"lo voy a pensar\"?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"5. Condiciones comerciales básicas","description_html":"","questions":[
        {"key":"payment_policies","type":"textarea","label_html":"<p>Políticas de pago</p>","help_html":"<p>Porcentaje de anticipo, plazos, contraentrega sí/no y zonas</p>","required":false,"options":[]},
        {"key":"warranty_text","type":"textarea","label_html":"<p>Texto exacto de condiciones de garantía</p>","help_html":"","required":false,"options":[]},
        {"key":"return_text","type":"textarea","label_html":"<p>Texto exacto de condiciones de devolución</p>","help_html":"","required":false,"options":[]},
        {"key":"damaged_text","type":"textarea","label_html":"<p>Texto para producto dañado o incompleto</p>","help_html":"","required":false,"options":[]},
        {"key":"handoff_moment","type":"textarea","label_html":"<p>¿En qué momento el bot pasa el lead a un asesor humano?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"6. IA y estilo de atención al cliente","description_html":"","questions":[
        {"key":"detail_level","type":"select","label_html":"<p>Nivel de detalle en las respuestas</p>","help_html":"","required":false,"options":["Muy breve","Medio","Explicativo"]},
        {"key":"comparisons_allowed","type":"yesno","label_html":"<p>¿Autorizado usar ejemplos, comparaciones o recomendaciones personalizadas?</p>","help_html":"","required":false,"options":[]},
        {"key":"product_recommendations","type":"textarea","label_html":"<p>¿Puede recomendar productos específicos según respuestas del cliente?</p>","help_html":"<p>Reglas básicas</p>","required":false,"options":[]},
        {"key":"emoji_policy","type":"textarea","label_html":"<p>¿Puede usar emojis? ¿Cuántos y en qué contexto?</p>","help_html":"","required":false,"options":[]},
        {"key":"bot_persona","type":"select","label_html":"<p>¿Debe mencionar que es asistente virtual o hablar como parte del equipo?</p>","help_html":"","required":false,"options":["Asistente virtual","Parte del equipo (humano)"]},
        {"key":"no_info_response","type":"textarea","label_html":"<p>Texto estándar cuando no haya información suficiente</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"7. Envíos, entregas y personalización","description_html":"","questions":[
        {"key":"shipping_cost","type":"text","label_html":"<p>¿Cuánto cuesta el envío?</p>","help_html":"","required":false,"options":[]},
        {"key":"free_shipping","type":"textarea","label_html":"<p>¿Envío gratis según valor de compra?</p>","help_html":"","required":false,"options":[]},
        {"key":"shipping_zones","type":"textarea","label_html":"<p>¿Hasta qué zonas hacen envíos?</p>","help_html":"","required":false,"options":[]},
        {"key":"shipping_time","type":"text","label_html":"<p>¿Cuánto se demora en llegar?</p>","help_html":"","required":false,"options":[]},
        {"key":"shipping_to_other","type":"yesno","label_html":"<p>¿Puede pedirse para otra dirección?</p>","help_html":"","required":false,"options":[]},
        {"key":"scheduled_shipping","type":"yesno","label_html":"<p>¿Se puede programar envío para fecha específica?</p>","help_html":"","required":false,"options":[]},
        {"key":"gift_wrap","type":"yesno","label_html":"<p>¿Envoltura para regalo disponible?</p>","help_html":"","required":false,"options":[]},
        {"key":"personal_note","type":"yesno","label_html":"<p>¿Permite nota personalizada?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"8. Cambios y cancelaciones","description_html":"","questions":[
        {"key":"change_product","type":"textarea","label_html":"<p>¿Puede cambiarse el producto después de hacer el pedido?</p>","help_html":"","required":false,"options":[]},
        {"key":"edit_order_data","type":"textarea","label_html":"<p>¿Puede modificar datos del pedido si se equivocó?</p>","help_html":"","required":false,"options":[]},
        {"key":"cancel_order","type":"textarea","label_html":"<p>¿Puede cancelarse un pedido?</p>","help_html":"","required":false,"options":[]},
        {"key":"not_at_home","type":"textarea","label_html":"<p>¿Qué pasa si el cliente no está cuando llega el pedido?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"9. Métodos de pago","description_html":"","questions":[
        {"key":"card_payments","type":"yesno","label_html":"<p>¿Acepta tarjeta débito/crédito?</p>","help_html":"","required":false,"options":[]},
        {"key":"local_methods","type":"textarea","label_html":"<p>Métodos de pago locales que maneja</p>","help_html":"","required":false,"options":[]},
        {"key":"cash_on_delivery","type":"yesno","label_html":"<p>¿Pago contra entrega?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"10. Productos","description_html":"","questions":[
        {"key":"available_promos","type":"textarea","label_html":"<p>Promociones disponibles</p>","help_html":"","required":false,"options":[]},
        {"key":"top_promos","type":"textarea","label_html":"<p>Promociones más vendidas</p>","help_html":"","required":false,"options":[]},
        {"key":"sizes","type":"textarea","label_html":"<p>Tallas que manejan</p>","help_html":"","required":false,"options":[]},
        {"key":"best_seller","type":"text","label_html":"<p>Producto más vendido</p>","help_html":"","required":false,"options":[]},
        {"key":"kids_products","type":"yesno","label_html":"<p>¿Tienen productos para niños?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"11. Despachos y entregas","description_html":"","questions":[
        {"key":"shipping_cutoff","type":"text","label_html":"<p>¿Hasta qué hora hacen envíos?</p>","help_html":"","required":false,"options":[]},
        {"key":"shipping_days","type":"text","label_html":"<p>¿Qué días despachan o entregan pedidos?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"12. Garantías y soporte","description_html":"","questions":[
        {"key":"damaged_received","type":"textarea","label_html":"<p>Pedido llegó dañado, ¿qué hago?</p>","help_html":"","required":false,"options":[]},
        {"key":"wrong_model_received","type":"textarea","label_html":"<p>Llegó modelo diferente, ¿pueden cambiarlo?</p>","help_html":"","required":false,"options":[]},
        {"key":"missing_items","type":"textarea","label_html":"<p>No recibí todo lo que pedí, ¿pueden reponerlo?</p>","help_html":"","required":false,"options":[]}
      ]}
    ]}
    $json$::jsonb
  ) returning id into v_ecommerce_id;

  -- ---------------- SERVICIOS ----------------
  insert into pro_gestion.questionnaire_templates (platform_id, name, description, position, body)
  values (
    v_botcake_id,
    'Servicios / Clínica',
    'Consultorio, profesional con agenda, citas.',
    3,
    $json$
    {"sections":[
      {"title":"1. Información general del consultorio","description_html":"","questions":[
        {"key":"commercial_name","type":"text","label_html":"<p>Nombre comercial del consultorio/clínica</p>","help_html":"","required":true,"options":[]},
        {"key":"location","type":"text","label_html":"<p>Ciudad y barrio</p>","help_html":"","required":false,"options":[]},
        {"key":"specialties","type":"textarea","label_html":"<p>Especialidad(es) que manejas</p>","help_html":"","required":false,"options":[]},
        {"key":"staffing","type":"select","label_html":"<p>¿Cómo atiendes?</p>","help_html":"","required":false,"options":["Solo","Con un asistente","Con varios profesionales (cada uno con agenda propia)"]},
        {"key":"who_replies","type":"select","label_html":"<p>¿Quién responde hoy WhatsApp?</p>","help_html":"","required":false,"options":["Yo","Asistente","Varias personas"]},
        {"key":"patient_channels","type":"multiselect","label_html":"<p>¿Por qué canales te escriben los pacientes?</p>","help_html":"","required":false,"options":["WhatsApp","Instagram","Facebook","Llamadas","Web","Otro"]}
      ]},
      {"title":"2. Servicios, tratamientos y productos","description_html":"","questions":[
        {"key":"all_services","type":"textarea","label_html":"<p>Lista todos los servicios y tratamientos que ofreces</p>","help_html":"","required":false,"options":[]},
        {"key":"top_services","type":"textarea","label_html":"<p>Los 3 más consultados o vendidos</p>","help_html":"","required":false,"options":[]},
        {"key":"packages","type":"textarea","label_html":"<p>¿Tienes paquetes o combos? (Ej: planes de varias sesiones)</p>","help_html":"","required":false,"options":[]},
        {"key":"physical_products","type":"textarea","label_html":"<p>¿Vendes productos físicos? (skincare, cosméticos, suplementos)</p>","help_html":"","required":false,"options":[]},
        {"key":"eval_required","type":"textarea","label_html":"<p>¿Qué servicios requieren valoración previa obligatoria?</p>","help_html":"","required":false,"options":[]},
        {"key":"contraindications","type":"textarea","label_html":"<p>¿Procedimientos con contraindicaciones que deban informarse antes?</p>","help_html":"","required":false,"options":[]},
        {"key":"bot_not_offer","type":"textarea","label_html":"<p>¿Servicios que NO quieres que el bot ofrezca directamente?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"3. Horarios, agenda y tipos de cita","description_html":"","questions":[
        {"key":"business_hours","type":"textarea","label_html":"<p>Horarios de atención</p>","help_html":"","required":false,"options":[]},
        {"key":"specific_days","type":"textarea","label_html":"<p>¿Días específicos para ciertos procedimientos?</p>","help_html":"","required":false,"options":[]},
        {"key":"appointment_types","type":"multiselect","label_html":"<p>Tipos de cita que manejas</p>","help_html":"","required":false,"options":["Valoración","Procedimiento","Control","Seguimiento virtual"]},
        {"key":"appointment_duration","type":"textarea","label_html":"<p>Duración aproximada de cada tipo</p>","help_html":"","required":false,"options":[]},
        {"key":"min_advance","type":"text","label_html":"<p>¿Con cuánta anticipación mínima aceptas citas?</p>","help_html":"","required":false,"options":[]},
        {"key":"when_full","type":"select","label_html":"<p>Cuando la agenda está llena</p>","help_html":"","required":false,"options":["Lista de espera","No agendar","Reagendar"]}
      ]},
      {"title":"4. Proceso de agendamiento actual","description_html":"","questions":[
        {"key":"current_flow","type":"textarea","label_html":"<p>Paso a paso de cómo agenda hoy un paciente por WhatsApp</p>","help_html":"","required":false,"options":[]},
        {"key":"min_data_to_book","type":"textarea","label_html":"<p>Datos mínimos para agendar</p>","help_html":"","required":false,"options":[]},
        {"key":"availability_source","type":"select","label_html":"<p>¿Dónde verificas disponibilidad?</p>","help_html":"","required":false,"options":["Agenda digital","Software específico","Manual"]},
        {"key":"who_confirms","type":"text","label_html":"<p>¿Quién confirma la cita?</p>","help_html":"","required":false,"options":[]},
        {"key":"confirmation_trigger","type":"select","label_html":"<p>¿Cuándo queda realmente confirmada?</p>","help_html":"","required":false,"options":["Al agendar","Al pagar anticipo","Al enviar comprobante"]},
        {"key":"reminders","type":"textarea","label_html":"<p>¿Envías recordatorios? ¿Cuándo y por qué canal?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"5. Pagos, anticipos y políticas","description_html":"","questions":[
        {"key":"payment_methods","type":"textarea","label_html":"<p>Medios de pago que aceptas</p>","help_html":"","required":false,"options":[]},
        {"key":"deposit_required","type":"textarea","label_html":"<p>¿Solicitas anticipo? Monto y para qué servicios</p>","help_html":"","required":false,"options":[]},
        {"key":"payment_proof","type":"textarea","label_html":"<p>¿Qué debe enviar el paciente como comprobante?</p>","help_html":"","required":false,"options":[]},
        {"key":"cancellation_policy","type":"textarea","label_html":"<p>Política de citas canceladas</p>","help_html":"","required":false,"options":[]},
        {"key":"no_show_policy","type":"textarea","label_html":"<p>Política de no-show</p>","help_html":"","required":false,"options":[]},
        {"key":"reschedule_policy","type":"textarea","label_html":"<p>Política de reprogramación</p>","help_html":"","required":false,"options":[]},
        {"key":"late_policy","type":"textarea","label_html":"<p>Política de llegadas tarde</p>","help_html":"","required":false,"options":[]},
        {"key":"prepaid_packages","type":"textarea","label_html":"<p>¿Manejas paquetes prepagados? ¿Cómo validas sesiones restantes?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"6. Tipos de pacientes y clasificación","description_html":"","questions":[
        {"key":"patient_mix","type":"multiselect","label_html":"<p>¿Qué tipo de paciente recibes más?</p>","help_html":"","required":false,"options":["Nuevo","Recurrente","Tratamiento activo","VIP"]},
        {"key":"good_vs_problem","type":"textarea","label_html":"<p>¿Qué diferencia a un paciente \"bueno\" de uno \"problemático\"?</p>","help_html":"","required":false,"options":[]},
        {"key":"auto_classification","type":"textarea","label_html":"<p>¿Te gustaría que el bot clasifique automáticamente a los pacientes? ¿Cómo?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"7. Antes de la cita (preconsulta)","description_html":"","questions":[
        {"key":"pre_instructions","type":"textarea","label_html":"<p>¿Envías instrucciones previas? ¿Para qué procedimientos?</p>","help_html":"","required":false,"options":[]},
        {"key":"pre_medical_qs","type":"textarea","label_html":"<p>¿Haces preguntas médicas básicas antes?</p>","help_html":"","required":false,"options":[]},
        {"key":"informed_consent","type":"select","label_html":"<p>¿Usas consentimiento informado?</p>","help_html":"","required":false,"options":["Físico","Digital","No"]},
        {"key":"prior_photos","type":"textarea","label_html":"<p>¿Solicitas fotos previas?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"8. Después de la cita","description_html":"","questions":[
        {"key":"post_recommendations","type":"textarea","label_html":"<p>¿Entregas recomendaciones post tratamiento?</p>","help_html":"","required":false,"options":[]},
        {"key":"auto_followup","type":"textarea","label_html":"<p>¿Programas controles automáticamente?</p>","help_html":"","required":false,"options":[]},
        {"key":"reviews_collection","type":"textarea","label_html":"<p>¿Solicitas reseñas, valoraciones o testimonios?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"9. Promociones y fidelización","description_html":"","questions":[
        {"key":"special_dates_promos","type":"textarea","label_html":"<p>¿Realizas promociones por fechas especiales?</p>","help_html":"","required":false,"options":[]},
        {"key":"referral_system","type":"textarea","label_html":"<p>¿Manejas referidos? ¿Cómo los validas?</p>","help_html":"","required":false,"options":[]},
        {"key":"loyalty_system","type":"textarea","label_html":"<p>¿Tienes sistema de fidelización?</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"10. Quejas, urgencias y casos sensibles","description_html":"","questions":[
        {"key":"complaint_handling","type":"textarea","label_html":"<p>¿Cómo manejas hoy una queja?</p>","help_html":"","required":false,"options":[]},
        {"key":"handoff_to_human","type":"textarea","label_html":"<p>¿En qué casos el bot debe pasar inmediatamente a humano?</p>","help_html":"","required":false,"options":[]},
        {"key":"refund_policy","type":"textarea","label_html":"<p>Políticas claras sobre devoluciones, garantías y retoques</p>","help_html":"","required":false,"options":[]}
      ]},
      {"title":"11. Expectativa real del bot","description_html":"","questions":[
        {"key":"bot_should_do","type":"textarea","label_html":"<p>¿Qué te gustaría que el bot haga SOLO?</p>","help_html":"","required":false,"options":[]},
        {"key":"bot_should_not_do","type":"textarea","label_html":"<p>¿Qué NO quieres que haga nunca?</p>","help_html":"","required":false,"options":[]},
        {"key":"human_takeover_hours","type":"text","label_html":"<p>¿En qué horario hay alguien para tomar el control humano?</p>","help_html":"","required":false,"options":[]},
        {"key":"agenda_software","type":"text","label_html":"<p>¿Usas actualmente algún software de agenda? ¿Cuál?</p>","help_html":"","required":false,"options":[]},
        {"key":"whatsapp_lines","type":"text","label_html":"<p>¿Manejas uno o varios WhatsApp?</p>","help_html":"","required":false,"options":[]}
      ]}
    ]}
    $json$::jsonb
  ) returning id into v_servicios_id;

  -- ============================================
  -- 7) MIGRACIÓN DE DATOS: intake_forms -> project_questionnaires
  -- ============================================
  if exists (select 1 from information_schema.tables
             where table_schema = 'pro_gestion' and table_name = 'intake_forms') then
    insert into pro_gestion.project_questionnaires
      (project_id, template_id, platform_id, title, body, answers, status,
       submitted_at, reviewed_by, reviewed_at, review_comment, created_at, updated_at)
    select
      ifr.project_id,
      case ifr.business_type
        when 'infoproductor' then v_infoproductor_id
        when 'ecommerce'     then v_ecommerce_id
        when 'servicios'     then v_servicios_id
      end,
      v_botcake_id,
      case ifr.business_type
        when 'infoproductor' then 'Infoproductor'
        when 'ecommerce'     then 'E-commerce'
        when 'servicios'     then 'Servicios / Clínica'
      end,
      case ifr.business_type
        when 'infoproductor' then (select body from pro_gestion.questionnaire_templates where id = v_infoproductor_id)
        when 'ecommerce'     then (select body from pro_gestion.questionnaire_templates where id = v_ecommerce_id)
        when 'servicios'     then (select body from pro_gestion.questionnaire_templates where id = v_servicios_id)
      end,
      coalesce(ifr.answers, '{}'::jsonb),
      ifr.status,
      ifr.submitted_at,
      ifr.reviewed_by,
      ifr.reviewed_at,
      coalesce(ifr.review_comment, ''),
      ifr.created_at,
      ifr.updated_at
    from pro_gestion.intake_forms ifr
    where not exists (
      select 1 from pro_gestion.project_questionnaires pq
      where pq.project_id = ifr.project_id
        and pq.template_id in (v_infoproductor_id, v_ecommerce_id, v_servicios_id)
    );
  end if;
end $$;

-- ============================================
-- 8) DROP intake_forms + projects.business_type
-- ============================================
do $$
begin
  -- Quita triggers de projects que apuntan a ensure_intake_form
  if exists (select 1 from pg_trigger where tgname = 'trg_projects_ensure_intake_ins') then
    execute 'drop trigger if exists trg_projects_ensure_intake_ins on pro_gestion.projects';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_projects_ensure_intake_upd') then
    execute 'drop trigger if exists trg_projects_ensure_intake_upd on pro_gestion.projects';
  end if;
end $$;

drop function if exists pro_gestion.ensure_intake_form() cascade;
drop function if exists pro_gestion.notify_intake_event() cascade;

-- Saca intake_forms de la publication realtime antes de dropear.
do $$
begin
  begin alter publication supabase_realtime drop table pro_gestion.intake_forms;
  exception when undefined_object then null; when undefined_table then null; end;
end $$;

drop table if exists pro_gestion.intake_forms cascade;

alter table pro_gestion.projects drop constraint if exists projects_business_type_check;
alter table pro_gestion.projects drop column if exists business_type;

-- ============================================
-- 9) Reload PostgREST schema cache
-- ============================================
notify pgrst, 'reload config';
