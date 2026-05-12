-- ===========================================================
-- migration-15: parche owner_label para proyectos ya cargados
-- desde el Excel "Tabla de resumen". Solo aplica si ya corriste
-- migration-14 y los proyectos quedaron sin owner_label.
-- ===========================================================

with owner_map (title, owner_name) as (
  values
    ('Antonia Villa', 'Michell Ocampo'),
    ('Cristian Effix', 'Andrés Bucheli'),
    ('Randolph Rodas Guatemala', 'Steven Machado'),
    ('Organic Ecom', 'Steven Machado'),
    ('Jesús Gómez', 'Steven Machado'),
    ('Gintracom: integración con una transportadora (Ecuador - Guatemala)', 'Steban Cataño'),
    ('Gintracom: integración con una transportadora (Dominica)', 'Steban Cataño'),
    ('Tienda Nube', 'Steban Cataño'),
    ('Integracion con EFFI', 'Steban Cataño'),
    ('Integración ALICLICK', 'Steban Cataño'),
    ('Waguard software', 'Steven Machado'),
    ('Producto para Restaurantes', 'Michell Ocampo'),
    ('CakeMedic', 'Steven Machado'),
    ('Integración Mercado Libre', 'Steban Cataño')
)
update pro_gestion.projects p
set owner_label = m.owner_name
from owner_map m
where p.title = m.title
  and p.owner_id is null
  and coalesce(p.owner_label, '') = '';
