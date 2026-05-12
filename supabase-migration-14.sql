-- ===========================================================
-- migration-14: campos manual_progress + client_contact en projects
-- + seed de 16 proyectos iniciales (mayo 2026)
-- Correr en SQL Editor del proyecto Supabase ajtikvqfhylhafuwemnq
-- ===========================================================

-- 1) Columnas nuevas en projects -----------------------------
alter table pro_gestion.projects
  add column if not exists manual_progress smallint
    check (manual_progress is null or (manual_progress between 0 and 100)),
  add column if not exists client_contact text,
  add column if not exists owner_label text not null default '';

comment on column pro_gestion.projects.manual_progress is
  'Avance reportado manualmente (0-100). Solo se usa para mostrar % cuando el proyecto no tiene tareas que permitan calcularlo automáticamente.';
comment on column pro_gestion.projects.client_contact is
  'Contacto del responsable cara cliente (teléfono o handle). Texto libre.';
comment on column pro_gestion.projects.owner_label is
  'Nombre crudo del responsable interno cuando aún no tiene cuenta en la plataforma. UI lo muestra como fallback cuando owner_id es null. Al registrarse la persona, hacer UPDATE owner_id y opcionalmente limpiar owner_label.';

-- 2) Seed de proyectos. Idempotente: si ya existe un proyecto con el
-- mismo título, se omite. Resuelve owner_id y category_id por nombre
-- vía LEFT JOIN — si el perfil/categoría no existe, queda null.
with seed as (
  select * from (values
    -- (title, category_name, client_lead, status, manual_progress,
    --  goal, owner_name, observation,
    --  start_date, projected_end_date, delivery_date, contract_url, client_contact)

    ('Antonia Villa', 'Parametrizaciones',
     'Antonia Villa (Ecommerce)', 'Finalizado', 100,
     E'Implementación de un bot automatizado de confirmación de pedidos, apoyado en una IA básica, integrado a la plataforma Shopify de Antonia Villa.\nEl desarrollo incluirá:\n● Secuencia automatizada de seguimiento de pedidos.\n● Flujo de atención y recuperación de carritos abandonados.\n● Validación y pruebas completas de funcionalidad antes de la entrega final.',
     'Michell Ocampo',
     E'Proyecto fue desarrollado segun propuesta comercial a totalidad, debido a una necesidad tributaria que tenía Antonia Villa, Mauricio le ofrece la posibilidad de que pueda testear una funcionalidad nueva desarrollada por Asia (Bidireccionalidad de Pos - Shopify).\n\nDespues de probarla con Antonia, esta funcionalidad el equipo de Asia nos indica que no estará en producción y que no tendrá utilidad real. Este proceso no nos ha permitido cerrar el proyecto.\n\nNecesitamos el apoyo de Mauro para cerrar el proyecto, para esto compartimos lo siguiente con Mauro por Work DM:\n1. Informe del desarro y estado del proyecto.\n2. Propuesta comercial aceptada y paga por el cliente.',
     '2025-12-11'::date, '2026-01-13'::date, '2026-04-16'::date,
     'Enlace del contrato (Solicitar comercial)', '573178610995'),

    ('Cristian Effix', 'Parametrizaciones',
     'Cristian (Proveedor Effi)', 'En Desarrollo', 85,
     E'Es crear un proceso de automatización para su Ecommerce de productos para el hogar que abarca los siguientes puntos en el desarrollo del proyecto:\n\nCreación e implementación de Agente IA\nAutomatización de Interacciones en Redes Sociales con Bot Pancake, válido para 3 conexiones.\nRegistro Automático de Contactos en el CRM\nConfiguración de las Plataformas Pancake y Poscake\nImplementación de Canal de Venta Exclusivo Meta Livestream\nCreación de Canal de Venta Exclusivo LiveCake (Ventas en vivo simuladas)',
     'Andrés Bucheli',
     E'El proyecto está en proceso de ejecución, este cliente ha tenido dificultades técnicas de la herramienta, que es la Bidireccionalidad.\n\nYa se encuentra en la última etapa de ejecución, se estima cerrar el 30/04/2026',
     '2025-10-01'::date, '2026-04-30'::date, null::date,
     'Enlace del contrato (Solicitar comercial)', '573125204275'),

    ('Randolph Rodas Guatemala', 'Parametrizaciones',
     'Randolph Rodas Castillo', 'Pendiente de información', 85,
     E'Es crear un proceso de automatización para su Ecommerce de productos de Moda que abarca los siguientes puntos en el desarrollo del proyecto:\n\nCentralización y Automatización Multicanal\nIntegración de WhatsApp API\nCentralización de conversaciones\nGestión unificada de inventario\nRespuestas automáticas personalizadas\n\nImplementación de Ecosistema Pancake\nAutomatización de un bot de ventas por WhatsApp\nSistema de Gestión de Clientes (CRM)\nLive Cake - Ventas a través de Live Simulados',
     'Steven Machado',
     E'Este proyecto está pendiente de la ejecución de Livecake, pero el cliente no ha enviado la información para realizar el proceso y poder finalizarlo.\nEstamos presionando para estas entregas, en indica que ha tenido problemas para la creadora de contenido que usarán.',
     '2026-02-12'::date, '2026-04-30'::date, null::date,
     'Enlace del contrato (Solicitar comercial)', '50247703531'),

    ('Organic Ecom', 'Parametrizaciones',
     'Eduard Briceño (TikTok)', 'En Desarrollo', 0,
     E'El presente acuerdo contempla la implementación integral del ecosistema Pancake, estructurado en los siguientes pilares:\n\nEcosistema Pancake: Conexión de activos comerciales, activación de Licencia (3 conexiones / 3 usuarios), configuración de API y despliegue de PosCake (Gestión de servicios, almacén y productos para Livecake).\n\nAutomatización en Botcake Hibrida, para atender 24/7 a clientes filtrando a los "curiosos" y entregando leads calificados a los asesores de cierre.\n\nVentas en Vivo (LiveCake): Objetivo: Generar canal de venta exclusivo que recrea la experiencia de una transmisión en vivo, pero de forma controlada y automatizada.',
     'Steven Machado',
     'El proyecto está iniciando, Error de verificación de Tiktok corregido. Proyecto comienza el 24/04/2025',
     '2026-04-24'::date, '2026-06-25'::date, null::date,
     'Enlace del contrato (Solicitar comercial)', '51953780578'),

    ('Jesús Gómez', 'Alianza comercial',
     'Jorman Tenorio (Equipo de Jesus)', 'En Pausa', 0,
     E'El presente acuerdo contempla la implementación integral del ecosistema Pancake (para tienda de Ecommerce | venta de tennis), estructurado en los siguientes pilares:\n\nEcosistema Pancake: Conexión de activos comerciales, activación de Licencia (3 conexiones / 3 usuarios), configuración de API y despliegue de PosCake. Conexión de Shopify y Dropi.\n\nConfiguración de Bot de ventas Híbrido.\n\nConfiguración de un Bot de confirmación de pedidos.',
     'Steven Machado',
     'No se puede continuar con el proyecto, porque no tienen activos para conectar Pancake.',
     '2026-04-13'::date, '2026-05-12'::date, null::date,
     'Enlace del contrato (Solicitar comercial)', '573185506529'),

    ('Gintracom: integración con una transportadora (Ecuador - Guatemala)', 'Integraciones',
     'Equipo de Gintracom', 'Validación de viabilidad', 99,
     E'Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercado de la región:\n\nEcuador\nGuatemala\nRepública Dominicana',
     'Steban Cataño',
     E'Se encuentra completado el proceso de desarrollo en Ecuador y Guatemala.\nComercial y Marketing deben buscar tester reales para aprobar la viabilidad de la operación.',
     '2026-02-25'::date, '2026-04-30'::date, null::date,
     'https://pancakework.vn/messages/w4/c4196/m740c1d30-4059-178c-b03c-b9c0440e8302', null),

    ('Gintracom: integración con una transportadora (Dominica)', 'Integraciones',
     'Equipo de Gintracom', 'En Desarrollo', 0,
     E'Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercado de la región:\n\nEcuador\nGuatemala\nRepública Dominicana',
     'Steban Cataño',
     E'El proceso de República Dominicana no se ha completado.\nEstán distribuyendo las ciudades, regiones y distritos (el equipo de Asia sigue sin establecer un tiempo de entrega).',
     '2026-02-25'::date, null::date, null::date, null, null),

    ('Tienda Nube', 'Integraciones',
     'Equipo de Tienda Nube', 'Finalizado', 100,
     E'Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercado de la región:\n\nArgentina\nBrasil.\nMéxico',
     'Steban Cataño',
     E'Todo está listo: vídeos, enlaces, manual...\n¡LO QUE FALTA ES MARKETING Y VENTAS! realizar lanzamiento.',
     '2025-01-10'::date, null::date, '2025-09-24'::date,
     'https://pancakework.vn/messages/w4/c4196/mf47fa400-4933-12bd-a936-dd229b5ee8cd', null),

    ('Integracion con EFFI', 'Integraciones',
     'Equipo Effi', 'En Pausa', 50,
     E'Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercado de la región:\n\nColombia\nEcuador\nRepública Dominicana\nGuatemala\nCosta Rica',
     'Steban Cataño',
     E'Esta integración está pausada debido a que no han autorizado el uso de toda la API al equipo de Desarrollo.\nEstá en una fase 1, donde solo permite sincronizar los productos y enviar pedidos desde Pos a Effi.\n\nNecesitamos una nueva negociación, donde se habiliten el resto de funcionalidades:\n\n1. Inventarios de manera Bidireccional.\n2. Cambios de estados y novedades de los pedidos.',
     '2025-08-28'::date, null::date, '2026-01-04'::date,
     'https://pancakework.vn/messages/w4/c4196/m0e6f0e50-53ab-1570-b2d8-c568e855a379', null),

    ('Integración ALICLICK', 'Integraciones',
     'Equipo Aliclick', 'En Desarrollo', 99,
     'Desarrollar un nuevo canal de ventas, que permita impactar comercialmente el mercado de Perú.',
     'Steban Cataño',
     'Integración se encuentra en su última etapa de Desarrollo, solo falta conectar la API de cancelación de pedidos.',
     '2025-08-26'::date, null::date, null::date, null, null),

    ('Waguard software', 'Innovación y Desarrollo',
     'Mauricio Cuevas', 'Pendiente de información', 99,
     'Desarrollar una herramienta que permita auditar, optimizar y automatizar tus plantillas.',
     'Steven Machado',
     E'Desarrollo de la plataforma, completamente termina e integrada.\nSe espera la asignación del responsable de desarrollo y mantenimiento para realizar la entrega del producto.\nLuego de esto se debe coordinar el lanzamiento del producto.',
     null::date, null::date, null::date, null, null),

    ('Producto para Restaurantes', 'Productos específicos',
     'Equipo comercial de Pancake', 'Validación de viabilidad', 99,
     'Desarrollar un producto específico comercial, para que sea replicable y masivo en el nicho de restaurantes.',
     'Michell Ocampo',
     E'Producto se encuentra terminado.\nEstá pendiente de conseguir un tester para comenzar con la etapa de validación y optimización.',
     '2025-08-10'::date, null::date, '2025-08-30'::date, null, null),

    ('CakeMedic', 'Productos específicos',
     'Debora y Daniel Marcovich', 'Validación de viabilidad', 99,
     'Desarrollar un producto específico comercial, para que sea replicable y masivo en el nicho de cirujanos.',
     'Steven Machado', null,
     null::date, null::date, null::date, null, null),

    ('Gaston Argentina', 'Alianza comercial',
     null, 'No iniciado', 0,
     null, null, null,
     null::date, null::date, null::date, null, null),

    ('Santiago (Legacy)', 'Alianza comercial',
     null, 'No iniciado', 0,
     null, null, null,
     null::date, null::date, null::date, null, null),

    ('Integración Mercado Libre', 'Integraciones',
     'Equipo técnico de Asia', 'No iniciado', 0,
     null, 'Steban Cataño',
     'El equipo acordó realizar el desarrollo, se necesita una cuenta de desarrollo',
     '2026-04-24'::date, null::date, null::date, null, null)
  ) as v(
    title, category_name, client_lead, status, manual_progress,
    goal, owner_name, observation,
    start_date, projected_end_date, delivery_date, contract_url, client_contact
  )
)
insert into pro_gestion.projects (
  title, category_id, client_lead, status, manual_progress,
  goal, owner_id, owner_label, observation,
  start_date, projected_end_date, delivery_date, contract_url, client_contact
)
select s.title, c.id, coalesce(s.client_lead, ''), s.status, s.manual_progress,
       coalesce(s.goal, ''), p.id, coalesce(s.owner_name, ''), coalesce(s.observation, ''),
       s.start_date, s.projected_end_date, s.delivery_date,
       coalesce(s.contract_url, ''), s.client_contact
from seed s
left join pro_gestion.categories c on lower(c.name) = lower(s.category_name)
left join pro_gestion.profiles p on lower(p.name) = lower(s.owner_name)
where not exists (
  select 1 from pro_gestion.projects pr where pr.title = s.title
);
