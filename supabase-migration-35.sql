-- ===========================================================
-- migration-35: enriquecimiento de los 25 proyectos seedeados en mig-34
-- con la información COMPLETA del Excel "Resumen" operativo (mayo 2026).
--
-- Llena:
--   - title          → canonicaliza 9 títulos al nombre exacto del Excel
--   - goal           → OBJETIVO multi-párrafo con bullets
--   - client_lead    → DEPENDENCIA con nombres reales
--   - contract_url   → URLs reales de pancakework.vn o notas comerciales
--   - observation    → OBSERVACIONES texto largo
--   - delivery_date  → FECHA OFICIAL DE ENTREGA donde existe (idempotente
--                      con COALESCE para no pisar ediciones manuales)
--
-- IMPORTANTE: este es un OVERWRITE para los textos. Si ya editaste algún
-- goal/observation/client_lead/contract_url en producción, esa edición
-- se perderá. Para preservar ediciones específicas, comenta esa línea SET
-- dentro del UPDATE correspondiente antes de correr.
--
-- Idempotente: cada WHERE matchea por título canónico O por el seed
-- anterior, así que se puede correr múltiples veces sin error.
--
-- 3 proyectos NO se enriquecen porque en el Excel también están vacíos:
-- Gaston Argentina, Santiago (Legacy), Karen Mora, Nicolas Argentina.
-- ===========================================================

-- 1. Camilo Hotmart ⭐ (Alianza comercial + Parametrizaciones)
update pro_gestion.projects set
  goal = $g$Creación de Livecake para un proceso pequeño de su unidad de negocio en Hotmart, esto llevará automatización de WhatsApp, que se sincronizará con Livecake.$g$,
  client_lead = 'Camilo Hotmart',
  contract_url = 'No hay por ahora',
  observation = $obs$Mauricio acaba de cerrar la alianza (15/05/2026). El día martes se inicia el contacto para comenzar el trabajo de estrategia, planificación y ejecución.$obs$
where lower(title) = lower('Camilo Hotmart');

-- 2. Cake Barber (Excel solo tiene DEPENDENCIA)
update pro_gestion.projects set
  client_lead = 'Alejandro Gil'
where lower(title) = lower('Cake Barber');

-- 3. Gaston Argentina — Excel sin datos extra (noop)

-- 4. Ruta infoproductos (canonical con i minúscula)
update pro_gestion.projects set
  title = 'Ruta infoproductos',
  client_lead = 'Steban'
where lower(title) in (lower('Ruta Infoproductos'), lower('Ruta infoproductos'));

-- 5. Ruta Tiktok
update pro_gestion.projects set
  client_lead = 'Steban'
where lower(title) = lower('Ruta Tiktok');

-- 6. Cristian Effix (Parametrizaciones - En Desarrollo 95%)
update pro_gestion.projects set
  goal = $g$Es crear un proceso de automatización para su Ecommerce de productos para el hogar que abarca los siguientes puntos en el desarrollo del proyecto:

• Creación e implementación de Agente IA
• Automatización de Interacciones en Redes Sociales con Bot Pancake, válido para 3 conexiones.
• Registro Automático de Contactos en el CRM
• Configuración de las Plataformas Pancake y Poscake
• Implementación de Canal de Venta Exclusivo Meta Livestream
• Creación de Canal de Venta Exclusivo LiveCake (Ventas en vivo simuladas)$g$,
  client_lead = 'Cristian (Proveedor Effi)',
  contract_url = 'Enlace del contrato (Solicitar comercial)',
  observation = $obs$El proyecto está en proceso de ejecución, este cliente ha tenido dificultades técnicas de la herramienta, que es la Bidireccionalidad.

Ya se encuentra en la última etapa de ejecución, se estima cerrar el 30/04/2026.$obs$
where lower(title) = lower('Cristian Effix');

-- 7. Randolph Rodas Guatemala (Parametrizaciones - En Desarrollo 85%)
update pro_gestion.projects set
  goal = $g$Es crear un proceso de automatización para su Ecommerce de productos de Moda que abarca los siguientes puntos en el desarrollo del proyecto:

Centralización y Automatización Multicanal
• Integración de WhatsApp API
• Centralización de conversaciones
• Gestión unificada de inventario
• Respuestas automáticas personalizadas

Implementación de Ecosistema Pancake
• Automatización de un bot de ventas por WhatsApp
• Sistema de Gestión de Clientes (CRM)
• Live Cake - Ventas a través de Live Simulados$g$,
  client_lead = 'Randolph Rodas Castillo',
  contract_url = 'Enlace del contrato (Solicitar comercial)',
  observation = $obs$Este proyecto está pendiente de la ejecución de Livecake, pero el cliente no ha enviado la información para realizar el proceso y poder finalizarlo. Estamos presionando para estas entregas, indica que ha tenido problemas para la creadora de contenido que usarán.$obs$
where lower(title) = lower('Randolph Rodas Guatemala');

-- 8. Organic Ecom (Parametrizaciones - En Desarrollo 20%)
update pro_gestion.projects set
  goal = $g$El presente acuerdo contempla la implementación integral del ecosistema Pancake, estructurado en los siguientes pilares:

Ecosistema Pancake: Conexión de activos comerciales, activación de Licencia (3 conexiones / 3 usuarios), configuración de API y despliegue de PosCake (Gestión de servicios, almacén y productos para Livecake).

Automatización en Botcake Híbrida, para atender 24/7 a clientes filtrando a los "curiosos" y entregando leads calificados a los asesores de cierre.

Ventas en Vivo (LiveCake): generar canal de venta exclusivo que recrea la experiencia de una transmisión en vivo, pero de forma controlada y automatizada.$g$,
  client_lead = 'Eduard Briceño (TikTok)',
  contract_url = 'Enlace del contrato (Solicitar comercial)',
  observation = $obs$El proyecto está iniciando. Error de verificación de Tiktok corregido. Proyecto comienza el 24/04/2026.$obs$
where lower(title) = lower('Organic Ecom');

-- 9. Gintracom Dominica → canonical largo
update pro_gestion.projects set
  title = 'Gintracom: integración con una transportadora (Dominica)',
  goal = $g$Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercados de la región:

• Ecuador
• Guatemala
• República Dominicana$g$,
  client_lead = 'Equipo de Gintracom',
  observation = $obs$El proceso de República Dominicana no se ha completado. Están distribuyendo las ciudades, regiones y distritos (el equipo de Asia sigue sin establecer un tiempo de entrega).$obs$
where lower(title) in (
  lower('Gintracom: Transportadora (Dominica)'),
  lower('Gintracom: integración con una transportadora (Dominica)')
);

-- 10. Integración ALICLICK
update pro_gestion.projects set
  goal = $g$Desarrollar un nuevo canal de ventas, que permita impactar comercialmente el mercado de Perú.$g$,
  client_lead = 'Equipo Aliclick',
  observation = $obs$Integración se encuentra en su última etapa de Desarrollo, solo falta conectar la API de cancelación de pedidos.$obs$
where lower(title) = lower('Integración ALICLICK');

-- 11. Integración Mercado Libre
update pro_gestion.projects set
  client_lead = 'Equipo técnico de Asia',
  observation = $obs$El equipo acordó realizar el desarrollo, se necesita una cuenta de desarrollo.$obs$
where lower(title) = lower('Integración Mercado Libre');

-- 12. Sincronización Envios (Pos | Webcake) → canonical con pipe + sin tilde
update pro_gestion.projects set
  title = 'Sincronización Envios (Pos | Webcake)',
  client_lead = 'Equipo técnico de Asia'
where lower(title) in (
  lower('Sincronización Envíos (POS/Webcake)'),
  lower('Sincronización Envios (Pos | Webcake)')
);

-- 13. Agencia Livecake (Alex effix) → canonical con "effix" minúscula
update pro_gestion.projects set
  title = 'Agencia Livecake (Alex effix)',
  client_lead = 'Alexander Effix'
where lower(title) in (
  lower('Agencia Livecake (Alex Effix)'),
  lower('Agencia Livecake (Alex effix)')
);

-- 14. Gintracom Ecuador-Guatemala → canonical largo + URL real de contrato
update pro_gestion.projects set
  title = 'Gintracom: integración con una transportadora (Ecuador - Guatemala)',
  goal = $g$Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercados de la región:

• Ecuador
• Guatemala
• República Dominicana$g$,
  client_lead = 'Equipo de Gintracom',
  contract_url = 'https://pancakework.vn/messages/w4/c4196/m740c1d30-4059-178c-b03c-b9c0440e8302',
  observation = $obs$Se encuentra completado el proceso de desarrollo en Ecuador y Guatemala. Comercial y Marketing deben buscar tester reales para aprobar la viabilidad de la operación.$obs$
where lower(title) in (
  lower('Gintracom (Ecuador-Guatemala)'),
  lower('Gintracom: integración con una transportadora (Ecuador - Guatemala)')
);

-- 15. Tienda Nube ⚠️ — delivery_date oficial 24/09/2025
update pro_gestion.projects set
  goal = $g$Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercados de la región:

• Argentina
• Brasil
• México$g$,
  client_lead = 'Equipo de Tienda Nube',
  contract_url = 'https://pancakework.vn/messages/w4/c4196/mf47fa400-4933-12bd-a936-dd229b5ee8cd',
  observation = $obs$Todo está listo: vídeos, enlaces, manual… ¡LO QUE FALTA ES MARKETING Y VENTAS! Realizar lanzamiento.$obs$,
  delivery_date = coalesce(delivery_date, '2025-09-24'::date)
where lower(title) = lower('Tienda Nube');

-- 16. CakeMedic ⚠️
update pro_gestion.projects set
  goal = $g$Desarrollar un producto específico comercial, para que sea replicable y masivo en el nicho de cirujanos.$g$,
  client_lead = 'Debora y Daniel Marcovich'
where lower(title) = lower('CakeMedic');

-- 17. Antonia Villa — delivery_date oficial 16/04/2026
update pro_gestion.projects set
  goal = $g$Implementación de un bot automatizado de confirmación de pedidos, apoyado en una IA básica, integrado a la plataforma Shopify de Antonia Villa.

El desarrollo incluirá:
• Secuencia automatizada de seguimiento de pedidos.
• Flujo de atención y recuperación de carritos abandonados.
• Validación y pruebas completas de funcionalidad antes de la entrega final.$g$,
  client_lead = 'Antonia Villa (Ecommerce)',
  contract_url = 'Enlace del contrato (Solicitar comercial)',
  observation = $obs$Proyecto fue desarrollado según propuesta comercial a totalidad. Debido a una necesidad tributaria que tenía Antonia Villa, Mauricio le ofrece la posibilidad de testear una funcionalidad nueva desarrollada por Asia (Bidireccionalidad de Pos - Shopify).

Después de probarla con Antonia, esta funcionalidad el equipo de Asia indica que no estará en producción y que no tendrá utilidad real. Este proceso no nos ha permitido cerrar el proyecto.

Necesitamos el apoyo de Mauro para cerrar el proyecto, para esto compartimos con él por Work DM:
1. Informe del desarrollo y estado del proyecto.
2. Propuesta comercial aceptada y paga por el cliente.$obs$,
  delivery_date = coalesce(delivery_date, '2026-04-16'::date)
where lower(title) = lower('Antonia Villa');

-- 18. Jesús Gómez (Cancelado)
update pro_gestion.projects set
  goal = $g$El presente acuerdo contempla la implementación integral del ecosistema Pancake (para tienda de Ecommerce | venta de tennis), estructurado en los siguientes pilares:

Ecosistema Pancake: Conexión de activos comerciales, activación de Licencia (3 conexiones / 3 usuarios), configuración de API y despliegue de PosCake. Conexión de Shopify y Dropi.

• Configuración de Bot de ventas Híbrido.
• Configuración de un Bot de confirmación de pedidos.$g$,
  client_lead = 'Jorman Tenorio (Equipo de Jesus)',
  contract_url = 'Enlace del contrato (Solicitar comercial)',
  observation = $obs$No se puede continuar con el proyecto, porque no tienen activos para conectar Pancake.$obs$
where lower(title) = lower('Jesús Gómez');

-- 19. Integracion con EFFI → canonical sin acento + delivery_date 04/01/2026
update pro_gestion.projects set
  title = 'Integracion con EFFI',
  goal = $g$Desarrollar un nuevo canal de ventas, que permita impactar comercialmente otros mercados de la región:

• Colombia
• Ecuador
• República Dominicana
• Guatemala
• Costa Rica$g$,
  client_lead = 'Equipo Effi',
  contract_url = 'https://pancakework.vn/messages/w4/c4196/m0e6f0e50-53ab-1570-b2d8-c568e855a379',
  observation = $obs$Esta integración está pausada debido a que no han autorizado el uso de toda la API al equipo de Desarrollo. Está en una fase 1, donde solo permite sincronizar los productos y enviar pedidos desde Pos a Effi.

Necesitamos una nueva negociación, donde se habiliten el resto de funcionalidades:
1. Inventarios de manera Bidireccional.
2. Cambios de estados y novedades de los pedidos.$obs$,
  delivery_date = coalesce(delivery_date, '2026-01-04'::date)
where lower(title) in (
  lower('Integración EFFI'),
  lower('Integracion con EFFI')
);

-- 20. Santiago (Legacy) — Excel sin datos (noop)

-- 21. Producto para Restaurantes → canonical + delivery_date 30/08/2025
update pro_gestion.projects set
  title = 'Producto para Restaurantes',
  goal = $g$Desarrollar un producto específico comercial, para que sea replicable y masivo en el nicho de restaurantes.$g$,
  client_lead = 'Equipo comercial de Pancake',
  observation = $obs$Producto se encuentra terminado. Está pendiente de conseguir un tester para comenzar con la etapa de validación y optimización.$obs$,
  delivery_date = coalesce(delivery_date, '2025-08-30'::date)
where lower(title) in (
  lower('Producto Restaurantes'),
  lower('Producto para Restaurantes')
);

-- 22. Waguard software → canonical lowercase
update pro_gestion.projects set
  title = 'Waguard software',
  goal = $g$Desarrollar una herramienta que permita auditar, optimizar y automatizar tus plantillas.$g$,
  client_lead = 'Mauricio Cuevas',
  observation = $obs$Desarrollo de la plataforma completamente terminada e integrada. Se espera la asignación del responsable de desarrollo y mantenimiento para realizar la entrega del producto. Luego de esto se debe coordinar el lanzamiento del producto.$obs$
where lower(title) in (
  lower('Waguard Software'),
  lower('Waguard software')
);

-- 23. Karen Mora — Excel solo tiene notas Igor (noop)

-- 24. Nicolas Argentina — Excel solo tiene notas Igor (noop)

-- 25. Integración de Paypal en Pos → canonical
update pro_gestion.projects set
  title = 'Integración de Paypal en Pos',
  goal = $g$Incorporar la integración con la pasarela de pago Paypal en Pos.$g$,
  client_lead = 'Steban Cataño',
  observation = $obs$La integración ya se encuentra implementada en Pos, comenzamos la fase de testeo con el Partner Leonardo.$obs$
where lower(title) in (
  lower('Integración PayPal en POS'),
  lower('Integración de Paypal en Pos')
);

-- Reload PostgREST cache para que los cambios sean visibles vía API inmediatamente.
notify pgrst, 'reload config';
