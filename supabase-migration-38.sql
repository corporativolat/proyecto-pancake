-- ===========================================================
-- migration-38: sync de campos vacíos desde el Excel "Resumen" (mayo 2026)
--   https://docs.google.com/spreadsheets/d/1CI0Vbg4BtaPuTrTWJ84yyB3jIV6Hr8ar-BoVEUtsTCE
--
-- Política: solo se llena cuando el campo en BD está NULL o vacío.
-- Si la BD ya tiene un valor (aunque difiera del Excel), NO se pisa.
-- Match por lower(title). Idempotente (re-ejecutable sin efecto).
--
-- Cruce realizado contra snapshot de BD del 2026-05-25.
-- Los 25 proyectos del Excel mapean 1:1 con BD (sin nuevos a crear).
-- ===========================================================

begin;

-- 1) CakeMedic: observation estaba vacío en BD.
update pro_gestion.projects
   set observation = 'michell ajustando para hj oque debora entregó',
       updated_at  = now()
 where lower(title) = lower('CakeMedic')
   and coalesce(nullif(trim(observation), ''), '') = '';

-- 2) Gaston Argentina: observation estaba vacío en BD.
update pro_gestion.projects
   set observation = 'planejando o escopo da migração, parte!',
       updated_at  = now()
 where lower(title) = lower('Gaston Argentina')
   and coalesce(nullif(trim(observation), ''), '') = '';

-- 3) Organic Ecom: delivery_date estaba NULL en BD.
update pro_gestion.projects
   set delivery_date = date '2026-05-30',
       updated_at    = now()
 where lower(title) = lower('Organic Ecom')
   and delivery_date is null;

commit;

-- ===========================================================
-- CONFLICTOS NO APLICADOS (la BD ya tiene un valor distinto al Excel).
-- Revisar manualmente. Para aplicar, descomentar el UPDATE relevante.
-- ===========================================================

-- Cristian Effix
--   BD:    start_date = 2026-05-01
--   Excel: start_date = 2025-10-01
-- update pro_gestion.projects set start_date = date '2025-10-01', updated_at = now()
--  where lower(title) = lower('Cristian Effix');

-- Gintracom: integración con una transportadora (Ecuador - Guatemala)
--   BD:    projected_end_date = 2026-04-30
--   Excel: projected_end_date = 2026-05-30
-- update pro_gestion.projects set projected_end_date = date '2026-05-30', updated_at = now()
--  where lower(title) = lower('Gintracom: integración con una transportadora (Ecuador - Guatemala)');

-- Producto para Restaurantes
--   BD:    start_date = 2026-05-01
--   Excel: start_date = 2025-08-10
-- update pro_gestion.projects set start_date = date '2025-08-10', updated_at = now()
--  where lower(title) = lower('Producto para Restaurantes');

-- ===========================================================
-- PROYECTOS EN BD NO PRESENTES EN EL EXCEL (no se tocan):
--   - "PJT TESTE: EVENTO HOTMART CO26"
--   - "test"
-- PROYECTOS EN EL EXCEL NO PRESENTES EN BD: ninguno (los 25 cruzaron).
-- ===========================================================
