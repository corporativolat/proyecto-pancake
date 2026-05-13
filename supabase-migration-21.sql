-- ===========================================================
-- migration-21: plantillas de documentos por categoría + RPC
-- para auto-crear filas de `documents` en estado 'pendiente' al
-- entrar el proyecto a una etapa que las requiera.
--
-- Idempotente.
-- ===========================================================

create table if not exists pro_gestion.document_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references pro_gestion.categories(id) on delete cascade,
  name text not null,                  -- "Cédula representante legal"
  kind text not null default 'generico', -- cedula | branding | accesos | logos | contrato | otro
  required boolean not null default true,
  trigger_status text,                 -- status del proyecto que dispara la generación (null = al crear el proyecto)
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists document_templates_category_idx
  on pro_gestion.document_templates (category_id, position);

alter table pro_gestion.document_templates enable row level security;

drop policy if exists "doctpl_read" on pro_gestion.document_templates;
create policy "doctpl_read" on pro_gestion.document_templates for select to authenticated using (true);

drop policy if exists "doctpl_admin_write" on pro_gestion.document_templates;
create policy "doctpl_admin_write" on pro_gestion.document_templates for all to authenticated
using (pro_gestion.is_admin()) with check (pro_gestion.is_admin());

grant select, insert, update, delete on pro_gestion.document_templates to authenticated;

-- ============================================
-- RPC apply_document_template
--   - Copia los templates de la categoría del proyecto a `documents`
--   - Si se especifica p_trigger_status, solo copia los que coinciden
--     (filas con trigger_status = p_trigger_status). NULL filtro = todos.
--   - Solo crea documentos faltantes: usa (project_id, name) como clave
--     lógica para evitar duplicados.
-- ============================================
create or replace function pro_gestion.apply_document_template(
  p_project_id uuid,
  p_trigger_status text default null
) returns int
language plpgsql security definer set search_path = pro_gestion
as $$
declare
  v_project pro_gestion.projects%rowtype;
  v_count int := 0;
begin
  select * into v_project from pro_gestion.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  if v_project.category_id is null then return 0; end if;

  -- Solo staff o owner del proyecto pueden ejecutar
  if not (pro_gestion.is_admin_or_gerente() or v_project.owner_id = auth.uid()) then
    raise exception 'no autorizado';
  end if;

  with src as (
    select t.name, t.kind, t.required
    from pro_gestion.document_templates t
    where t.category_id = v_project.category_id
      and (p_trigger_status is null or t.trigger_status = p_trigger_status)
  ), ins as (
    insert into pro_gestion.documents (project_id, name, kind, required, status)
    select p_project_id, s.name, s.kind, s.required, 'pendiente'
    from src s
    where not exists (
      select 1 from pro_gestion.documents d
      where d.project_id = p_project_id and d.name = s.name
    )
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

revoke all on function pro_gestion.apply_document_template(uuid, text) from public;
grant execute on function pro_gestion.apply_document_template(uuid, text) to authenticated;

-- ============================================
-- Trigger: cuando el status del proyecto cambia, intenta auto-aplicar
-- templates que tengan ese trigger_status. Falla silenciosa si no hay match.
-- ============================================
create or replace function pro_gestion.auto_apply_doc_templates_on_status() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.category_id is not null then
    -- Inline (no llama al RPC para no chocar con su check de auth)
    insert into pro_gestion.documents (project_id, name, kind, required, status)
    select new.id, t.name, t.kind, t.required, 'pendiente'
    from pro_gestion.document_templates t
    where t.category_id = new.category_id
      and t.trigger_status = new.status
      and not exists (
        select 1 from pro_gestion.documents d
        where d.project_id = new.id and d.name = t.name
      );
  end if;
  return new;
end; $$;

drop trigger if exists trg_projects_auto_doc_templates on pro_gestion.projects;
create trigger trg_projects_auto_doc_templates after update on pro_gestion.projects
for each row execute function pro_gestion.auto_apply_doc_templates_on_status();

-- Al crear el proyecto, también copia las plantillas con trigger_status IS NULL
-- (las que deben crearse de entrada).
create or replace function pro_gestion.auto_apply_doc_templates_on_insert() returns trigger
language plpgsql security definer set search_path = pro_gestion
as $$
begin
  if new.category_id is not null then
    insert into pro_gestion.documents (project_id, name, kind, required, status)
    select new.id, t.name, t.kind, t.required, 'pendiente'
    from pro_gestion.document_templates t
    where t.category_id = new.category_id
      and t.trigger_status is null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_projects_auto_doc_templates_ins on pro_gestion.projects;
create trigger trg_projects_auto_doc_templates_ins after insert on pro_gestion.projects
for each row execute function pro_gestion.auto_apply_doc_templates_on_insert();

notify pgrst, 'reload config';
