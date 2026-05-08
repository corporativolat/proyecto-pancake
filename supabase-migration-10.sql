-- ===========================================================
-- PRO-GESTIÓN · Migración 10
-- Campos oficiales del proyecto: dependencia, fechas adicionales,
-- enlace al contrato. Reemplazo de categorías por las 7 oficiales.
-- Aplicar en: SQL Editor del proyecto Supabase, después de migración 9.
-- ===========================================================

-- 1) Nuevas columnas en projects
alter table pro_gestion.projects
    add column if not exists client_lead         text not null default '',
    add column if not exists projected_end_date  date,
    add column if not exists delivery_date       date,
    add column if not exists contract_url        text not null default '';

-- 2) Reemplazo de categorías seed por las 7 oficiales.
--    `projects.category_id` tiene ON DELETE SET NULL, así que los proyectos
--    que referencian una categoría removida quedan con category_id = NULL.
delete from pro_gestion.categories
where name in ('Estrategia', 'Operaciones', 'Tecnología', 'Comercial');

insert into pro_gestion.categories (name, color)
select v.name, v.color
from (values
    ('Innovación y Desarrollo', '#7c3aed'),
    ('Alianza comercial',       '#ef4444'),
    ('Parametrizaciones',       '#10b981'),
    ('Eventos',                 '#f59e0b'),
    ('Curso | Lanzamientos',    '#06b6d4'),
    ('Integraciones',           '#a855f7'),
    ('Productos específicos',   '#ec4899')
) as v(name, color)
where not exists (
    select 1 from pro_gestion.categories c where c.name = v.name
);

notify pgrst, 'reload schema';
