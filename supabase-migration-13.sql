-- ===========================================================
-- PRO-GESTIÓN · Migración 13
-- Fases con granularidad de día.
--
-- Antes: fases solo se podían posicionar y dimensionar por semana
-- (start_week 1-8, duration_weeks 1-8). Eso era suficiente para
-- el roadmap macro pero impedía afinar inicio dentro de una semana
-- o duraciones de días sueltos.
--
-- Ahora se añaden 2 columnas a `phases`:
--   - start_day (smallint, 1-7, default 1): día dentro de start_week.
--   - duration_days (smallint, 1-56, NULL): si está presente, manda
--     sobre duration_weeks. Si es NULL, se calcula como
--     duration_weeks * 7 (compat con datos previos).
--
-- El cliente recalcula posición / ancho en píxeles como:
--   leftPx  = ((start_week - 1) * 7 + (start_day - 1)) * 28
--   widthPx = (duration_days ?? duration_weeks * 7) * 28
--
-- Idempotente.
-- ===========================================================

alter table pro_gestion.phases
    add column if not exists start_day smallint not null default 1
        check (start_day between 1 and 7);

alter table pro_gestion.phases
    add column if not exists duration_days smallint
        check (duration_days is null or duration_days between 1 and 56);

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
