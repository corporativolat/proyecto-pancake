# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

- `npm run dev` — Vite dev server en `http://localhost:5173` (host abierto, hosts permitidos: ngrok, trycloudflare).
- `npm run build` — build de producción a `dist/`. Code-split con vendor chunks (react/gsap/chart/supabase).
- `npm run preview` — sirve el build.
- `npm run lint` — ESLint sobre `src/` (configurado en `.eslintrc.json`). Requiere `npm install` para tener las deps de eslint en `node_modules`. Sin test runner.

## Variables de entorno

`.env` requerido en raíz:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Sin esto el cliente Supabase falla al inicializarse (`src/lib/supabase.js`).

## Migraciones de base de datos

Postgres vive en Supabase y todo el schema custom es `pro_gestion` (no `public`). Aplicar en orden vía SQL Editor del proyecto Supabase:

1. `supabase-setup.sql` — schema base, tablas, triggers, RLS, GRANTS, `alter role authenticator set pgrst.db_schemas = 'public, pro_gestion'`.
2. `supabase-migration-2.sql` … `supabase-migration-6.sql` — cambios incrementales (avatar/lang/storage avatars, comments+activity, avatares 1-12, subtasks/tags/milestones, attachments+audit triggers+realtime).
3. `supabase-migration-7.sql` — **parche de seguridad**. `handle_new_user` ya no acepta `role` desde `raw_user_meta_data` (cierra privilege escalation), bucket `attachments` exige primer folder = uid, `revoke ... from anon` (RLS solo para authenticated), `activity_write` exige `profile_id = auth.uid()`, `comments_write_self` valida acceso al `project_id`.
4. `supabase-migration-8.sql` — feature reportes de error: tabla `pro_gestion.error_reports` + RLS (admin/gerente leen todo, autor lee los suyos, solo admin update/delete) + realtime publication.
5. `supabase-migration-9.sql` — performance + integridad: índices en `tasks.assignee_id`, `projects.category_id`, `project_members.profile_id`; `updated_at` + trigger en `tasks` y `phases`; RPC `pro_gestion.reorder_phases(items jsonb)` transaccional para reordenar fases.
6. `supabase-migration-10.sql` — campos oficiales del proyecto: añade `client_lead`, `projected_end_date`, `delivery_date`, `contract_url` a `projects`. Reemplaza el seed inicial de `categories` (Estrategia/Operaciones/Tecnología/Comercial) por los 7 tipos oficiales: Innovación y Desarrollo, Alianza comercial, Parametrizaciones, Eventos, Curso | Lanzamientos, Integraciones, Productos específicos. Los proyectos que apuntaban a categorías eliminadas quedan con `category_id = NULL` (gracias a `ON DELETE SET NULL`).
7. `supabase-migration-11.sql` — fix RLS recursión infinita ("infinite recursion detected in policy for relation projects"). Las policies `*_write` con `for all` en `project_members`, `phases`, `tasks`, `milestones` y `categories` instalaban implícitamente una variante SELECT que consultaba `projects`, formando un ciclo con `projects_read` → `project_members` → `members_write SELECT` → `projects_read`. Se separan en INSERT/UPDATE/DELETE explícitos; SELECT queda cubierto solo por las policies `*_read`.
8. `supabase-migration-12.sql` — abre creación de proyectos a `miembro`. `projects_insert` ahora exige `owner_id = auth.uid()` (o admin/gerente). Update/delete no cambian: `projects_update` ya permitía al owner, `projects_delete` sigue admin-only. Phases/tasks/milestones insert ya permitían al owner, así que un miembro que crea un proyecto queda como owner y puede gestionar todo dentro de él.
10. `supabase-migration-14.sql` — campos `projects.manual_progress` (smallint 0-100, nullable), `projects.client_contact` (text) y `projects.owner_label` (text NOT NULL DEFAULT ''). `calcProjectProgress` en `src/lib/utils.js` ahora prioriza el progreso calculado por tareas; si el proyecto no tiene ninguna tarea, usa `manual_progress` como fallback. `owner_label` se muestra como fallback en `Projects.jsx`, `Dashboard.jsx`, `ProjectDetail.jsx` y `exporters.js` cuando `owner_id` es null (responsable sin cuenta en la plataforma). En `ProjectDetail.jsx` el campo es editable. La misma migración seedea los 16 proyectos del Excel "Resumen" (mayo 2026) — resuelve `owner_id` / `category_id` por nombre vía LEFT JOIN; si no hay match, `owner_id` queda `null` pero `owner_label` se rellena con el nombre crudo del Excel. Idempotente: salta el insert si ya existe un proyecto con el mismo `title`.
11. `supabase-migration-15.sql` — parche para BD donde ya se corrió mig-14 antes de añadir `owner_label`. UPDATE puro: rellena `owner_label` por título solo cuando `owner_id is null` y `owner_label` está vacío. Idempotente.
12. `supabase-migration-16.sql` — calculadora de costo: añade `projects.project_value` (numeric 12,2) y `projects.project_hours` (numeric 8,2). Ambos nullable, con CHECK suaves (valor ≥ 0, horas > 0). La tarifa hora se calcula en cliente como `project_value / project_hours` (no se guarda). UI: sección "Costo" en `NewProjectForm` (`src/pages/Projects.jsx`) con helper que muestra `≈ $X COP/hora` en vivo. `ProjectDetail.jsx` renderiza una pill esmeralda con `$valor · Xh · $X/h` en el header cuando los dos campos están llenos.
13. `supabase-migration-17.sql` — recordatorios de vencimiento por email. Añade `projects.notification_email` (override opcional). Crea `pro_gestion.notification_log` con UNIQUE(project_id, kind) para idempotencia. Activa `pg_cron` + `pg_net` y registra el job `notify-deadlines-daily` (0 9 * * * UTC) que invoca la edge function `notify-deadlines` con bearer service_role. **Antes de correr la migración**: reemplaza `<PROJECT_REF>` y `<SERVICE_ROLE_JWT>` al final del archivo (o mejor: guarda el JWT en Vault). Kinds emitidos: `5d`, `3d`, `1d`, `due`, `overdue+{1,3,7,14,30}`. Recipient resuelve: `projects.notification_email` → fallback `profiles.email` del owner.

**Edge function `supabase/functions/notify-deadlines/index.ts`** (Deno). Setup manual:
- `supabase secrets set RESEND_API_KEY=... RESEND_FROM_EMAIL="Pro-Gestión <notify@dominio>"` (Resend free: 100 emails/día).
- Deploy: `supabase functions deploy notify-deadlines --no-verify-jwt`.
- Verifica manual: `curl -X POST https://<ref>.supabase.co/functions/v1/notify-deadlines -H "Authorization: Bearer <service_role>"`.
- Plantilla HTML inline (sin Edge Function dependencies extras). Logs por proyecto van a la respuesta JSON.
- **Respeta `profiles.notif_email_enabled`** (mig-18): si el owner desactivó emails, salta. Override por `projects.notification_email` ignora el flag (autorización explícita por proyecto).

14. `supabase-migration-18.sql` — refactor audit (bloques 1, 2, 6, 7). Añade:
    - `activity.tag` (`sistema|avance|riesgo|decision|bloqueo|manual`) + `activity.meta` jsonb. Relaja `activity_write` para permitir `profile_id NULL` (triggers sistema).
    - `projects.health_override` smallint (1=green, 2=amber, 3=red). Null = computed por `healthSignal()`. Visible vía `effectiveHealth()` en `src/lib/utils.js`.
    - `profiles.landing_route` text default `/dashboard` (CHECK: `/dashboard|/projects|/team`). Resuelto en `App.jsx::resolveLanding`.
    - `profiles.notif_email_enabled` + `profiles.notif_inapp_enabled` booleanos default true. Edge function `notify-deadlines` respeta el flag email.
    - `comments.tag` (avance|riesgo|decision|bloqueo). UI en `Comments.jsx` permite escoger.
    - **Triggers SECURITY DEFINER** sobre `projects`, `milestones`, `tasks` que graban en `activity` con `kind` semántico (`project_status_change`, `project_owner_change`, `project_date_change`, `project_delivery_change`, `project_contract_update`, `project_create`, `milestone_create`, `milestone_complete/uncomplete`, `task_complete/uncomplete`). `tag='sistema'` para metadata, `tag='avance'` para completion. La bitácora UI vive en `src/components/ActivityFeed.jsx` con tabs Auto/Manual y badges por tag; montada en ProjectDetail bajo Comments.
15. `supabase-migration-19.sql` — plantillas de hitos. Tabla `pro_gestion.milestone_templates` (`category_id`, `name`, `days_after_start`, `color`, `position`). RPC `apply_milestone_template(p_project_id)` copia los templates de la categoría del proyecto a `milestones` con `target_date = project.start_date + days_after_start`. Idempotente. UI: CRUD en `Admin.jsx::MilestoneTemplatesSection`; banner amarillo en ProjectDetail (`MilestonesEmptyBanner`) cuando el proyecto está activo y no tiene hitos.
16. `supabase-migration-20.sql` — **portal de clientes + roles extendidos**. Extiende `profiles.role` CHECK a `super_admin|admin|gerente|miembro|cliente`. Añade columnas `profiles.phone/company/suspended/onboarding_completed/onboarding_step/onboarding_seen_at`. Añade `projects.client_id` (uuid → profiles, ON DELETE SET NULL) — define al cliente externo asignado al proyecto. Nuevos helpers: `is_super_admin()`, `is_staff()`, `is_cliente()`, `is_project_client(uuid)`. `is_admin()` y `is_admin_or_gerente()` ahora incluyen `super_admin`. RLS de `projects/phases/tasks/milestones` permite lectura al cliente cuando `client_id = auth.uid()`. Nuevas tablas: `pro_gestion.documents` (project_id, name, kind, file_path, file_url, status pendiente|enviado|aprobado|rechazado, required, uploaded_by, reviewed_by, reviewed_at, review_comment) con RLS staff+cliente del proyecto; `pro_gestion.notifications` (profile_id, kind, title, body, link, project_id, meta, read_at) con RLS por destinatario. Triggers SECURITY DEFINER: `notify_document_event` (notif al owner al subir doc, notif al cliente al cambiar status del doc) y `notify_project_status_change` (notif al cliente al cambiar status del proyecto). Bucket privado `documents` con policies que validan primer folder = project_id. Añade `notifications` y `documents` a la publication realtime.
17. `supabase-migration-21.sql` — **plantillas de documentos por categoría + auto-aplicación**. Tabla `pro_gestion.document_templates` (`category_id`, `name`, `kind`, `required`, `trigger_status`, `position`) con RLS read-all + write admin. RPC `apply_document_template(p_project_id, p_trigger_status default null)` inserta filas en `documents` con `status='pendiente'` evitando duplicados por `(project_id, name)`. Triggers SECURITY DEFINER: `auto_apply_doc_templates_on_insert` (al crear proyecto, copia plantillas con `trigger_status IS NULL`) y `auto_apply_doc_templates_on_status` (al cambiar `status`, copia plantillas con `trigger_status = new.status`). UI admin: `Admin.jsx::DocumentTemplatesSection` (CRUD por categoría con dropdown de kind/trigger_status, checkbox obligatorio). UI cliente: `PendingDocsBanner.jsx` (popup amarillo en dashboard del portal cuando hay documentos en estado `pendiente` o `rechazado`, dismiss en sessionStorage). Notificaciones in-app: `src/lib/notifications.js` + `src/components/NotifBell.jsx` (bell con dropdown, realtime via channel filtrado por `profile_id`, mark-as-read individual y bulk). Onboarding cliente: `src/components/OnboardingTour.jsx` (spotlight + tooltip, persiste `profiles.onboarding_step/completed`), montado en `PortalLayout.jsx` con botón "Ver recorrido" para re-disparar.

18. `supabase-migration-22.sql` — **progreso por actividad**. Añade `tasks.progress` (smallint 0-100, default 0; backfill `progress=100` donde `completed`). Trigger `sync_task_completed` (BEFORE INSERT/UPDATE) deriva `tasks.completed := (progress = 100)` — el cliente solo escribe `progress`, nunca `completed`. `src/lib/utils.js`: `taskProgress(t)` (lee `progress`, fallback a `completed`), `calcPhaseProgress` ahora promedia `progress` en vez de contar `completed`. Helpers de plazo: `projectMaxDayIndex(project)` (último índice de día 0-based del Gantt según `start_date`→`projected_end_date`, tope 55) y `clampSpanToProject({start_week,start_day,duration}, maxDayIndex)` que recorta fase/tarea al plazo. `ProjectDetail.jsx`: el checkbox de actividad y el `TaskModal` (slider de avance) escriben `progress`; `PhaseCard` muestra barra de avance por tarea; crear/arrastrar/redimensionar fases y tareas en el Gantt se recorta al plazo del proyecto y la zona fuera de plazo se sombrea. Fix drag: `GanttBar` reseteaba mal el transform `x` de GSAP tras refresh (doble offset) — ahora un effect `[left,width]` lo limpia. **Portal cliente**: `PortalProjectDetail` carga `phases(tasks)` y muestra etapas con checklist de actividades + barras de avance (solo lectura); `PortalProjects` usa `calcProjectProgress` en vez de `manual_progress`; `PortalCalendar` añade eventos `phase` (fecha calculada desde `start_date` + offset semana/día) con su % de avance. Idempotente.

19. `supabase-migration-23.sql` — **fix RLS al crear proyectos + moneda**. Añade `projects.created_by` (uuid → profiles, `default auth.uid()`, backfill desde `owner_id`). Antes, un usuario no admin/gerente solo podía insertar en `projects` si `owner_id = auth.uid()`; con el toggle "el responsable tiene cuenta" en OFF el cliente manda `owner_id = NULL` → `projects_insert` rechazaba ("new row violates row-level security policy"). Ahora `projects_insert/read/update` incluyen `created_by = auth.uid()` (read conserva `client_id` de mig-20), y `phases/tasks/milestones` insert/update aceptan al `created_by` del proyecto (necesario porque `createProject` inserta la primera fase). También añade `projects.currency` (text NOT NULL default `'COP'`, CHECK `in ('COP','USD','BRL')`). Cliente: `src/lib/utils.js` exporta `CURRENCY_LOCALE` + `fmtMoney(n, cur)`; `NewProjectForm` (`Projects.jsx`) tiene selector de moneda en la sección Costo y manda `currency` en el payload; la pill esmeralda de `ProjectDetail.jsx` formatea con `project.currency`. `src/lib/data.js` exporta `friendlyDbError(e)` que mapea códigos Postgres (42501/RLS, 23505, 23503, 23514, 23502) a claves i18n `db.error.*`; `handleCreate` lo usa para mostrar toasts amigables en vez del error crudo. Idempotente.

**Refactor audit (sin migración):**
- Owner unificado vía toggle "Tiene cuenta en plataforma" en NewProjectForm + ProjectDetail (`projects.owner_id` o `projects.owner_label`, nunca ambos).
- `src/lib/utils.js`: `effectiveHealth(p, prog)`, `projectCompleteness(p)`, `PROJECT_CRITICAL_FIELDS`.
- `src/components/Breadcrumb.jsx` + montaje en Layout (desktop + móvil).
- `src/components/TeamMembersGrid.jsx` (visible en `/team` solo a `viewAll`): grid carga por miembro + drill-down + reasignación admin.
- Dashboard widgets riesgo: sin owner, sin fecha fin, sin update >14d (lee `projects.updated_at`), sin hitos.
- Tabla maestra `Projects.jsx`: nueva col "Salud" + sort por health.

9. `supabase-migration-13.sql` — granularidad de día en fases. Añade `phases.start_day` (smallint 1-7, default 1) y `phases.duration_days` (smallint 1-56, nullable). El cliente posiciona el rectángulo de fase en el Gantt como `((start_week-1)*7 + (start_day-1)) * 28` px y lo dimensiona como `(duration_days ?? duration_weeks*7) * 28` px. Si `duration_days` está NULL se mantiene compat con `duration_weeks`. Drag/resize del rect snappean a día (28px) en lugar de semana.

20. `supabase-migration-25.sql` — **datos obligatorios del cliente al primer login**. Añade a `profiles`: `whatsapp` (text), `country` (text), `id_type` (text, CHECK `null|NIT|CC|CE|PP|OTRO`), `id_number` (text), `contact_email` (text), `client_data_completed` (boolean default false). Motivo: el staff le crea la cuenta al cliente con un correo y password, así que no conocemos su WhatsApp, país, NIT/CC ni su correo personal. `src/components/ClientDataGate.jsx` se monta en `PortalLayout.jsx` y renderiza un modal fullscreen no descartable (z-200) cuando `profile.role === 'cliente' && !profile.client_data_completed`. Bloquea todo el portal hasta que el cliente complete los 4 campos. Al guardar, también copia `whatsapp` → `phone` por compat con el resto del portal. El tour visual (`OnboardingTour`) no arranca hasta que el gate cierre. Los mismos campos quedan editables luego en `PortalProfile.jsx`. Idempotente.

22. `supabase-migration-29.sql` — **cuestionarios por plataforma** (reemplaza intake_forms). Modela los productos Pancake (Botcake / CRM / Pancake / +2) como plataformas y los cuestionarios como plantillas ancladas a una plataforma. Un proyecto puede recibir N cuestionarios. Tablas nuevas:
    - `pro_gestion.platforms` (slug unique, name, description, icon, color, position, active). RLS read-all auth / write admin. Seed: `botcake`, `crm`, `pancake`.
    - `pro_gestion.questionnaire_templates` (platform_id, name, description, `body jsonb`, position, active, created_by). RLS read-all auth / write admin. El `body` tiene la forma `{ sections: [{ title, description_html, questions: [{ key, type, label_html, help_html, required, options }] }] }` — `label_html`/`help_html` admiten HTML rich-text producido por TipTap. Tipos: `text|textarea|select|multiselect|yesno`.
    - `pro_gestion.project_questionnaires` (project_id, template_id, platform_id, title, `body jsonb` snapshot del template al enviar, answers, status `borrador|enviado|aprobado|rechazado`, submitted_at, reviewed_*, created_by). RLS: staff lee/escribe; cliente del proyecto lee siempre y escribe `answers/status` sólo en borrador/rechazado. Triggers SECURITY DEFINER: `questionnaire_assigned` (al INSERT con status borrador → notif al cliente), `questionnaire_submitted` (cliente envía → notif al owner), `questionnaire_reviewed` (staff aprueba/rechaza → notif al cliente).
    - **Migración de datos**: `intake_forms` se vuelca a `project_questionnaires` (cada fila → instancia bajo plantilla Botcake correspondiente por `business_type`). Luego DROP `intake_forms` y `projects.business_type`.
    - Realtime publication agrega las 3 tablas nuevas (saca `intake_forms`).

    **Cliente (frontend):**
    - **Editor rich-text TipTap**: `src/components/RichTextEditor.jsx` (toolbar con bold/italic/underline/strike, color de letra con paleta, familia tipográfica, headings, listas, alineación, links, undo/redo) y `src/components/RichTextView.jsx` (HTML sanitizado con DOMPurify). Estilos en `index.css` bajo `.rte-content` / `.rte-view`. Lazy: TipTap entra en el chunk del editor (Admin/SendQuestionnaire), no en el bundle principal.
    - `src/components/QuestionnaireEditor.jsx` — editor de `body` (secciones + preguntas + tipos + opciones + drag-up/down). Usado en (a) Admin para editar plantillas, (b) SendQuestionnaireModal para editar la copia antes de enviar, (c) QuestionnairePanel para editar la estructura de una instancia tras enviarla.
    - `src/components/QuestionnaireRenderer.jsx` — render para LLENAR (cliente) o VER respuestas (staff). Respeta el HTML de `label_html`/`help_html`.
    - `src/components/SendQuestionnaireModal.jsx` — wizard 3 pasos (plataforma → plantilla → preview + edición opcional) para que staff envíe un cuestionario al cliente.
    - `src/components/QuestionnairePanel.jsx` — modal staff para revisar una instancia (ver respuestas / editar estructura / aprobar / rechazar / reabrir).
    - `src/components/ProjectQuestionnairesSection.jsx` — lista de cuestionarios del proyecto + botón "Enviar cuestionario". Montado en `ProjectDetail.jsx` debajo de hitos.
    - `src/components/PortalQuestionnairesSection.jsx` — sección portal cliente que lista todos los cuestionarios del proyecto y abre el filler en modal. Autoguardado cada 1.2s en borrador/rechazado. Botón "Enviar para revisión" si no faltan obligatorias.
    - `src/components/QuestionnairePendingBanner.jsx` — banner violeta en `PortalDashboard` con cuestionarios pendientes (borrador/rechazado) de todos los proyectos del cliente. Dismiss en sessionStorage `pending-questionnaire-dismissed`.
    - `src/lib/questionnaires.js` — data layer (CRUD platforms / templates / instances, `sendQuestionnaireToProject` que hace snapshot, `questionnaireProgress`, `localId`, `ensureKeys`).
    - Admin: `Admin.jsx` añade `PlatformsSection` (CRUD slug/name/desc/icon/color/active) y `QuestionnaireTemplatesSection` (CRUD por plataforma + editor modal).
    - **Removidos**: `src/lib/intakeSchemas.js`, `src/components/IntakeForm.jsx`, `IntakePanel.jsx`, `IntakePendingBanner.jsx`, `IntakePreviewModal.jsx`, `PortalIntakeSection.jsx`. `business_type` del NewProjectForm y de ProjectDetail.

    Idempotente.

21. `supabase-migration-26.sql` — **cuestionario obligatorio de intake por proyecto** (uno por tipo de negocio del cliente). Pancake construye bots para 3 verticales (infoproductor / e-commerce / servicios) y necesita capturar info estructurada antes de arrancar. Añade:
    - `projects.business_type` (text nullable, CHECK `null|infoproductor|ecommerce|servicios`). Es **ortogonal** a `category_id` (la taxonomía de qué hace Pancake): aquí se define qué tipo de negocio tiene el cliente final, lo que determina qué cuestionario base verá en el portal.
    - Tabla `pro_gestion.intake_forms` (1 fila por proyecto, UNIQUE(project_id)): `business_type`, `answers jsonb`, `status` (`borrador|enviado|aprobado|rechazado`), `submitted_at`, `reviewed_by`, `reviewed_at`, `review_comment`.
    - RLS: staff lee/escribe siempre. Cliente del proyecto lee siempre; escribe sólo si `status in ('borrador','rechazado')` (vía helper `is_project_client()`). Owner/created_by también escriben siempre.
    - Trigger `ensure_intake_form` (AFTER INSERT/UPDATE en `projects`): crea fila vacía en `intake_forms` cuando `business_type` pasa a no-null y no existe. Si cambia mientras está en borrador, sincroniza el `business_type` de la fila.
    - Trigger `notify_intake_event` (AFTER UPDATE en `intake_forms`): notifica al owner cuando cliente envía (`enviado` → kind `intake_submitted`); notifica al cliente cuando staff revisa (`aprobado`/`rechazado` → kind `intake_reviewed`).
    - Realtime publication: `intake_forms`.

    **Cliente (frontend):**
    - `src/lib/intakeSchemas.js` — 3 schemas declarativos (INFOPRODUCTOR, ECOMMERCE, SERVICIOS) con todas las preguntas del PDF base. Export `BUSINESS_TYPES`, `BUSINESS_TYPE_LABEL`, `getIntakeSchema(bt)`, `intakeProgress(schema, answers)` que cuenta respondidas/total y `requiredMissing`. Tipos de input soportados: `text|textarea|select|multiselect|yesno`.
    - `src/components/IntakeForm.jsx` — render genérico read/write con barra de progreso, secciones colapsadas, validación visual de `required`.
    - `src/components/IntakePanel.jsx` — vista staff. Modal montado desde `ProjectDetail.jsx` con badge ámbar en header (cuenta intakes en `enviado`). Permite aprobar o devolver con comentario. Si `status='aprobado'`, ofrece "reabrir con observaciones".
    - `src/components/PortalIntakeSection.jsx` — sección editable en `PortalProjectDetail.jsx`. Auto-guarda cada 1.2s en `borrador`/`rechazado`. Botón "Enviar para revisión" se habilita cuando no faltan `required`. En `enviado`/`aprobado` queda solo lectura.
    - `src/components/IntakePendingBanner.jsx` — banner violeta en `PortalDashboard.jsx` (paralelo a `PendingDocsBanner`) que avisa de cuestionarios en `borrador`/`rechazado`. Dismiss en sessionStorage (`pending-intake-dismissed`).
    - `src/lib/data.js` — `fetchIntakeForm`, `ensureIntakeForm`, `saveIntakeAnswers`, `submitIntakeForm`, `approveIntakeForm`, `rejectIntakeForm`.
    - `Projects.jsx::NewProjectForm` — selector de tipo de negocio (3 chips) en la creación.
    - `ProjectDetail.jsx` — selector en el header (debajo de Contrato) para asignar/cambiar después, y botón **Intake** con badge para abrir el modal de revisión.

    Idempotente.

El cliente apunta al schema custom mediante `db: { schema: 'pro_gestion' }` en `createClient`. Cualquier tabla nueva debe crearse dentro de `pro_gestion` y exponerse en `pgrst.db_schemas`.

**Nota sobre attachments**: tras `migration-7`, los archivos antiguos cuya ruta no empieza con `<uid>/` no podrán modificarse/borrarse por sus dueños (solo admin podrá borrarlos). El cliente ahora usa `<uid>/<task_id>/<timestamp>-<safeName>` (ver `src/lib/storage.js::uploadAttachment`). Si tienes uploads heredados, migra los paths o ignóralos.

## Arquitectura

SPA React 18 + Vite. Backend = Supabase (Auth + Postgres + Realtime). No hay servidor propio; toda la lógica vive en el cliente y en políticas RLS / triggers de Postgres.

### Capas

- `src/main.jsx` monta `BrowserRouter` → `AuthProvider` → `App`.
- `src/App.jsx` decide entre `<Login />` y la app autenticada. Dentro de la app envuelve con `ThemeProvider` + `I18nProvider` y monta el `Layout` con `<Routes>`. Rutas protegidas por capacidades (`can('viewKPIs')`, `can('manageUsers')`).
- `src/lib/auth.jsx` — `AuthProvider` + `useAuth()`. Maneja `session` (Supabase Auth) y `profile` (fila en `pro_gestion.profiles`). Expone `can(perm)` contra la matriz `PERMS` (roles: `admin`, `gerente`, `miembro`).
- `src/lib/store.js` — store Zustand con `projects`, `profiles`, `categories` y acciones `refreshAll/refreshProjects/refreshProfiles/refreshCategories/patchProject`.
- `src/lib/data.js` — todos los `select`/`insert`/`update`/`delete` contra Supabase. `fetchProjects` hace el join anidado `projects → phases → tasks` + `milestones` + `project_members`, y normaliza ordenando por `position` y exponiendo `member_ids` en cada proyecto. `reorderPhases` llama al RPC `reorder_phases` (transaccional).
- `src/lib/supabase.js` — cliente único.
- `src/lib/i18n.jsx`, `src/lib/theme.jsx` — providers (idioma `es/en/pt` persistido en `profiles.language`; tema `light/dark` en `localStorage` como `proTheme`). Para añadir un idioma: extender el objeto `DICT` y agregar la opción al selector en `Settings.jsx`.
- `src/lib/exporters.js` — `downloadCSV({filename, columns, rows})` y `downloadPDF({filename, title, subtitle, columns, rows})`. CSV usa BOM U+FEFF para que Excel detecte UTF-8. PDF usa jspdf + jspdf-autotable (chunk lazy: `html2canvas` se separa). `columns` es `[{ header, accessor: row => value }]`.
- `src/lib/logger.js` — wrapper sobre `console.*` que solo emite en `import.meta.env.DEV`. Usar siempre en lugar de `console.*` directo.
- `src/lib/confirm.jsx` — `<ConfirmHost />` global montado en `App.jsx` + `askConfirm({title, message, danger})` que devuelve `Promise<boolean>`. Reemplaza `window.confirm`.
- `src/lib/toast.js` + `src/components/Toast.jsx` — `useToast().show(msg, kind)` con `kind` ∈ `success|error|info`. Reemplaza `alert()`.
- `src/lib/reports.js` — CRUD para `error_reports`.
- `src/components/ErrorBoundary.jsx` — clase `ErrorBoundary` que envuelve toda la app en `main.jsx`. Captura crashes de render y muestra UI de fallback con reintentar/recargar.
- `src/components/ReportButton.jsx` — botón flotante 🐛 abajo-derecha (z-40) visible para todo usuario autenticado. Modal manual con title/description/severity. Adjunta automáticamente `page_url` y `user_agent`. Ningún hook a `window.onerror` (captura solo manual).
- `src/pages/*` — páginas top-level (Dashboard, Team, Projects, ProjectDetail, Admin, AdminReports, Settings, Login). Dashboard, ProjectDetail, Admin, AdminReports, Settings se cargan con `lazy()` + `<Suspense>` para code-split.
- `src/components/*` — UI reutilizable (Layout, Modal, Toast, CommandPalette, Shortcuts, Comments, ActivityFeed, ErrorBoundary, ReportButton, TeamMetricsBar, TeamMetricsModal…). `TeamMetricsBar` (en `pages/Team.jsx`) muestra una tarjeta por cada proyecto del usuario con avance, tareas, salud y ETA, más un botón "Expandir" que abre `TeamMetricsModal`. El modal renderiza 3 charts (avance por proyecto, distribución por estado, tareas hechas vs pendientes) y permite descargar el reporte como PDF (jsPDF + autotable) o CSV/Excel (UTF-8 BOM) usando `src/lib/exporters.js`.

### Responsive / móvil

Breakpoint clave: `md` (768px). Por debajo:
- `Layout.jsx` muestra una **topbar móvil** con hamburguesa, logo, búsqueda (Cmd+K) y toggle de tema. La sidebar (`w-72 sidebar-bg`) cambia de `md:relative` a `fixed` y se traslada con `-translate-x-full ↔ translate-x-0` controlado por estado `mobileOpen`. Backdrop semi-transparente cierra el drawer; navegar también lo cierra (effect en `loc.pathname`).
- Páginas (`Projects`, `ProjectDetail`, `Dashboard`, `Team`, `Admin`, `AdminReports`, `Settings`) usan padding responsive `p-4 md:p-10` y headers `flex-col md:flex-row`.
- En `Projects.jsx` los chips de categoría tienen scroll horizontal en móvil (`overflow-x-auto -mx-4 px-4`).
- En `ProjectDetail.jsx` el split Hoja de Ruta / Gantt se vuelve **tabs** en móvil (estado `mobileTab` ∈ `'roadmap' | 'gantt'`); en `≥md` ambos paneles se muestran lado a lado como antes.

### Modelo de datos (`pro_gestion`)

`profiles (id ref auth.users, role, avatar 1-5) → projects (owner_id, category_id, client_lead, start_date, projected_end_date, delivery_date, contract_url, status, goal, observation) → phases (position) → tasks (assignee_id, position, start_week, start_day, duration)`. Tablas auxiliares: `project_members` (M:N), `milestones`, `categories`. Constraints clave: `start_week 1-8`, `duration_weeks 1-8`, `tasks.duration 1-56`, `start_day 1-7`.

**Campos oficiales de proyecto** (definidos por negocio, ver `src/lib/utils.js::PROJECT_FIELD_HELP` y `PROJECT_CATEGORY_HELP`):
`title` (Proyectos), `category_id` (Tipo), `client_lead` (Dependencia · responsable cara cliente), `status` (Estado), `goal` (Objetivo), `owner_id` (Responsable interno), `start_date` (Fecha inicio), `projected_end_date` (Fin proyectada), `delivery_date` (Fecha de entrega), `contract_url` (Contrato), `observation` (Observaciones). Las descripciones de cada campo y de cada tipo de categoría se renderizan inline en el modal de creación (`Projects.jsx::NewProjectModal`) y en el header del detalle (`ProjectDetail.jsx`).

Trigger `pro_gestion.handle_new_user` corre en `auth.users` AFTER INSERT y crea la fila en `profiles`. **Primer usuario registrado en la base → rol `admin` automático**; los siguientes → `miembro`. Ese trigger es la única forma soportada de crear perfiles desde signup.

### Permisos (dos capas, deben coincidir)

1. **Cliente** — matriz `PERMS` en `auth.jsx` decide qué UI/rutas se muestran.
2. **Servidor** — RLS en `supabase-setup.sql` + parches en migraciones 7 y 8. Helpers `pro_gestion.is_admin()` y `pro_gestion.is_admin_or_gerente()`. Reglas:
   - `projects`: lee admin/gerente, owner, o miembro asignado vía `project_members`.
   - `phases`/`tasks`: heredan acceso del proyecto. `tasks` además permite escritura al `assignee_id`.
   - `profiles`: lectura abierta para autenticados; update propio o admin. La policy `profiles_self_update` (mig 2) impide que un usuario cambie su propio `role`.
   - `categories`: lectura abierta; escritura solo admin.
   - `comments`: insert exige `profile_id = auth.uid()` **y** acceso al `project_id` (mig 7).
   - `activity`: insert exige `profile_id = auth.uid()` (mig 7); ya no se permite `null`.
   - `error_reports`: insert con `profile_id = auth.uid()`; admin/gerente leen todo, autor lee los suyos; update/delete solo admin (mig 8).
   - **Storage `attachments`**: insert/update exigen primer folder = uid del usuario; delete permite admin además de owner (mig 7).
   - **`anon` no tiene grants**: tras mig 7 todos los `grant ... to anon` están revocados. Solo `authenticated` opera.

Si añades capacidad nueva, actualiza **ambas** capas o el cliente mostrará botones que el servidor rechaza.

### Realtime

`App.jsx` se suscribe al canal `pro_gestion_changes` con `postgres_changes` para `projects`, `phases`, `tasks`, `milestones`. Cualquier cambio dispara `refreshProjects()` con **debounce de 350ms** para amortiguar ráfagas. Para que esto funcione, esas tablas deben estar en la *publication* de Supabase Realtime (mig 6 las añade).

### Atajos de teclado

Manejados en `App.jsx`: `Cmd/Ctrl+K` → CommandPalette, `?` → Shortcuts, `Esc` cierra ambos. La detección de input usa `tagName` + `isContentEditable` — respeta esto al añadir nuevos shortcuts globales.

### Estilo y motion

- Tailwind con paleta custom `ink-*` (escala neutral) y fuentes `Plus Jakarta Sans` / `JetBrains Mono` (`tailwind.config.js`).
- Modo dark: clase `dark` aplicada al `<body>` (no `<html>`) por `ThemeProvider`.
- GSAP es la librería de animación. `src/lib/motion.js` exporta `reduced` para respetar `prefers-reduced-motion`; consultarlo antes de cualquier animación decorativa.

## Carpeta `legacy/`

Vanilla JS + HTML predecesor del SPA. No se importa desde `src/` y no es parte del build de Vite. Mantener intocado salvo petición explícita.
