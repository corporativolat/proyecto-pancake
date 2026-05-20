// Schemas declarativos del cuestionario de intake.
// Las preguntas vienen literalmente de los PDFs base que Pancake entrega
// al iniciar un proyecto (uno por tipo de negocio del cliente).
//
// Forma de cada pregunta:
//   { key, label, type, options?, required?, help?, placeholder? }
//
// type:
//   text       -> input text una línea
//   textarea   -> textarea multilinea
//   select     -> dropdown (requiere options)
//   multiselect-> chips múltiples (requiere options)
//   yesno      -> "Sí / No" (radio compacto)
//
// Para añadir un 4° tipo de negocio: extender CHECK en
// supabase-migration-26.sql + projects_business_type_check, agregar la
// entrada al CHECK de intake_forms.business_type, y sumar el schema aquí.

export const BUSINESS_TYPES = [
  { key: 'infoproductor', label: 'Infoproductor',     hint: 'Cursos, mentorías, membresías, high ticket' },
  { key: 'ecommerce',     label: 'E-commerce',        hint: 'Tienda con catálogo, envíos, garantías' },
  { key: 'servicios',     label: 'Servicios / Clínica', hint: 'Consultorio, profesional con agenda, citas' }
];

export const BUSINESS_TYPE_LABEL = Object.fromEntries(BUSINESS_TYPES.map(b => [b.key, b.label]));

// ============================================================
// INFOPRODUCTOR
// ============================================================
const INFOPRODUCTOR = {
  business_type: 'infoproductor',
  title: 'Cuestionario para infoproductores',
  intro: 'Necesitamos esta información para configurar el bot de ventas y soporte de tu infoproducto.',
  sections: [
    {
      title: '1. Información general y ecosistema digital',
      questions: [
        { key: 'brand_name',         label: 'Nombre de la marca personal o comercial', type: 'text', required: true },
        { key: 'niches',             label: 'Nichos y sub-nichos que manejas', type: 'textarea', help: 'Ej: Fitness para mujeres, Trading para principiantes' },
        { key: 'who_replies',        label: '¿Quién responde actualmente los mensajes?', type: 'multiselect', options: ['Tú', 'Closer de ventas', 'Setter', 'Asistente', 'Nadie aún'] },
        { key: 'lead_channels',      label: '¿Por qué canales llegan los leads?', type: 'multiselect', options: ['Instagram DM', 'Facebook Ads', 'TikTok', 'YouTube', 'WhatsApp', 'Web', 'Otro'] }
      ]
    },
    {
      title: '2. Portafolio de infoproductos (escalera de valor)',
      questions: [
        { key: 'product_type',         label: 'Tipo de producto digital', type: 'multiselect', options: ['Curso online', 'Membresía', 'Programa grupal', 'Mentoría 1 a 1', 'Plantilla', 'Software', 'Otro'] },
        { key: 'product_name',         label: 'Nombre específico del producto', type: 'text' },
        { key: 'product_pitch',        label: 'Explícalo en una sola frase (qué es y qué resultado promete)', type: 'textarea' },
        { key: 'product_format',       label: '¿Es 100% digital o incluye componentes en vivo / físicos / comunidad?', type: 'textarea' },
        { key: 'upsells',              label: '¿Manejas Order Bumps o Upsells (productos adicionales al pagar)?', type: 'textarea' },
        { key: 'closing_call_required',label: '¿Qué productos requieren llamada de cierre obligatoria?', type: 'textarea' },
        { key: 'main_problem',         label: '¿Qué problema principal resuelve tu producto en la vida o negocio del cliente?', type: 'textarea' },
        { key: 'problem_consequences', label: '¿Qué consecuencias tiene ese problema si no lo resuelve?', type: 'textarea', help: 'Emocionales, económicas, de tiempo, status…' },
        { key: 'failed_alternatives',  label: 'Antes de comprarte, ¿qué intentan tus clientes y por qué no les funciona?', type: 'textarea' }
      ]
    },
    {
      title: '3. Cliente ideal',
      questions: [
        { key: 'icp_profile',          label: 'Perfil de tu cliente ideal (edad, profesión, nivel socioeconómico, país)', type: 'textarea' },
        { key: 'icp_starting_point',   label: '¿En qué situación está el cliente cuando te busca?', type: 'textarea' },
        { key: 'icp_goal',             label: '¿Qué meta o transformación quiere lograr?', type: 'textarea' },
        { key: 'sales_journey',        label: 'Paso a paso desde que un lead escribe hasta que compra', type: 'textarea' },
        { key: 'hot_lead_definition',  label: '¿Cómo defines un lead "caliente" vs uno curioso?', type: 'textarea' },
        { key: 'qualifying_questions', label: '¿Qué preguntas clave debe hacer el bot para filtrar quien no puede pagar el High Ticket?', type: 'textarea' }
      ]
    },
    {
      title: '4. Contenido y estructura del producto',
      questions: [
        { key: 'modules',           label: 'Módulos, lecciones o secciones (lista breve)', type: 'textarea' },
        { key: 'duration',          label: 'Duración aproximada (semanas, horas, sesiones)', type: 'text' },
        { key: 'downloadables',     label: 'Material descargable incluido (plantillas, PDF, checklists)', type: 'textarea' },
        { key: 'community',         label: '¿Incluye comunidad o canal de soporte? ¿Qué tipo de acompañamiento?', type: 'textarea' }
      ]
    },
    {
      title: '5. Propuesta de valor y diferenciación',
      questions: [
        { key: 'differentiation',  label: '¿Qué te hace diferente de competidores similares?', type: 'textarea' },
        { key: 'main_promise',     label: 'Promesa principal (beneficio central concreto y medible)', type: 'textarea' },
        { key: 'common_objections',label: 'Objeciones frecuentes antes de comprar', type: 'textarea', help: 'Precio, tiempo, desconfianza, saturación…' }
      ]
    },
    {
      title: '6. Precio, condiciones y garantías',
      questions: [
        { key: 'price',                label: 'Precio actual y moneda', type: 'text' },
        { key: 'plans',                label: '¿Manejas planes o paquetes? ¿Qué incluye cada uno?', type: 'textarea' },
        { key: 'payment_facilities',   label: '¿Facilidades de pago (cuotas, financiación, promos)?', type: 'textarea' },
        { key: 'guarantee',            label: '¿Garantía? (devolución de X días, satisfacción, acceso extendido)', type: 'textarea' },
        { key: 'lead_qualification_data', label: '¿Qué datos necesitas para calificar un lead?', type: 'textarea', help: 'Presupuesto, experiencia, país…' },
        { key: 'checkout_platform',    label: '¿Dónde realizas la venta final?', type: 'multiselect', options: ['Hotmart', 'Stripe', 'Web propia', 'Transferencia manual', 'PayU', 'Mercado Pago', 'Otro'] },
        { key: 'sale_closed_when',     label: '¿Cuándo se considera una venta cerrada?', type: 'select', options: ['Pago total', 'Pago de reserva', 'Inscripción', 'Otro'] }
      ]
    },
    {
      title: '7. Pruebas sociales y resultados',
      questions: [
        { key: 'testimonials',       label: 'Testimonios o casos de éxito (describe 2-3 brevemente)', type: 'textarea' },
        { key: 'success_metrics',    label: 'Métricas o indicadores para validar que el producto funciona', type: 'textarea' }
      ]
    },
    {
      title: '8. Post-venta y fidelización',
      questions: [
        { key: 'delivery_method',  label: '¿Cómo entregas el producto una vez pagado?', type: 'textarea', help: 'Acceso automático por mail, grupo de WhatsApp…' },
        { key: 'affiliate_system', label: '¿Manejas sistema de afiliados o referidos?', type: 'textarea' }
      ]
    },
    {
      title: '9. Gestión de crisis y soporte',
      questions: [
        { key: 'handoff_to_human', label: '¿En qué casos el bot debe transferir a un humano?', type: 'textarea', help: 'Fallas de pago, quejas de acceso, casos sensibles…' },
        { key: 'refund_policy',    label: 'Política de devoluciones y garantías', type: 'textarea' }
      ]
    }
  ]
};

// ============================================================
// ECOMMERCE
// ============================================================
const ECOMMERCE = {
  business_type: 'ecommerce',
  title: 'Cuestionario para creación del bot — E-commerce',
  intro: 'Necesitamos esta información para configurar el bot de ventas, soporte y postventa de tu tienda.',
  sections: [
    {
      title: '1. Conocimiento de marca (branding y posicionamiento)',
      questions: [
        { key: 'legal_name',           label: 'Nombre legal de la empresa', type: 'text', required: true },
        { key: 'commercial_name',      label: 'Nombre comercial y variantes de marca', type: 'text' },
        { key: 'locations',            label: 'Ubicación(es) física(s)', type: 'textarea', help: 'Ciudad, país, sucursales' },
        { key: 'business_description', label: 'Descripción extendida del negocio (qué hace, para quién, cómo se diferencia)', type: 'textarea' },
        { key: 'one_line_pitch',       label: 'Definición en una frase frente al cliente', type: 'text', help: 'Ej: somos X que ayuda a Y a lograr Z' },
        { key: 'main_problem_solved', label: '¿Qué problema principal solucionas?', type: 'textarea' },
        { key: 'key_benefits',         label: '3-5 beneficios clave de tus productos', type: 'textarea' },
        { key: 'differentiators',      label: 'Diferenciales frente a la competencia', type: 'textarea', help: 'Precio, calidad, servicio, rapidez, personalización, garantía' },
        { key: 'minimum_promise',      label: 'Promesa mínima que siempre se debe cumplir', type: 'textarea', help: 'Ej: tiempos de entrega, calidad' },
        { key: 'allowed_tones',        label: 'Tonos permitidos', type: 'multiselect', options: ['Formal', 'Cercano', 'Juvenil', 'Premium', 'Técnico', 'Divertido'] },
        { key: 'bot_must_never_say',   label: '¿Qué cosas NUNCA quieres que diga el bot sobre tu marca?', type: 'textarea' },
        { key: 'forbidden_words',      label: 'Palabras o expresiones prohibidas', type: 'textarea' },
        { key: 'tone_examples',        label: 'Ejemplos de respuestas en tono correcto e incorrecto', type: 'textarea' },
        { key: 'social_links',         label: 'Redes sociales oficiales (links)', type: 'textarea' },
        { key: 'web_links',            label: 'Sitio web principal y landings importantes', type: 'textarea' },
        { key: 'sale_restrictions',    label: 'Restricciones de venta (edad, regulación, licencias)', type: 'textarea' },
        { key: 'active_promos',        label: 'Ofertas vigentes, cupones y condiciones', type: 'textarea' },
        { key: 'product_faq',          label: 'Preguntas frecuentes específicas por producto', type: 'textarea', help: 'FAQ detallado por línea' }
      ]
    },
    {
      title: '2. Perfil del lead que entra por pauta',
      questions: [
        { key: 'lead_context',          label: '¿Qué debe saber el bot cuando alguien viene de anuncio?', type: 'textarea', help: 'Ya vio precio, ya vio fotos…' },
        { key: 'min_lead_info',         label: 'Información mínima a capturar para vender', type: 'multiselect', options: ['Nombre', 'Ciudad', 'Teléfono', 'Canal preferido', 'Presupuesto', 'Email'] },
        { key: 'qualifying_questions',  label: 'Preguntas de calificación que debe hacer el bot', type: 'textarea' },
        { key: 'qualified_criteria',    label: 'Criterios para considerar un lead "calificado" y listo para ventas humanas', type: 'textarea' }
      ]
    },
    {
      title: '3. Preguntas de descubrimiento para venta',
      questions: [
        { key: 'decision_drivers',  label: '¿Qué es lo más importante para el cliente al decidir?', type: 'multiselect', options: ['Precio', 'Tiempo', 'Calidad', 'Diseño', 'Marca', 'Garantía'] },
        { key: 'expected_objections', label: 'Objeciones que espera el negocio', type: 'textarea', help: 'Precio alto, miedo a estafa, tiempos de entrega, calidad…' },
        { key: 'objection_scripts', label: 'Respuestas modelo para manejar cada objeción', type: 'textarea' },
        { key: 'sales_triggers',    label: '¿Qué "gatillos" debe usar el bot?', type: 'multiselect', options: ['Escasez', 'Garantía', 'Casos de éxito', 'Testimonios', 'Envío gratis', 'Cupón limitado'] }
      ]
    },
    {
      title: '4. Proceso de cierre de venta',
      questions: [
        { key: 'next_step_after_doubts', label: '¿Cuál es el siguiente paso ideal después de resolver dudas?', type: 'textarea' },
        { key: 'closing_script',         label: 'Script de cierre que quieres que use el bot', type: 'textarea' },
        { key: 'on_will_think',          label: '¿Qué hace el bot si el cliente dice "lo voy a pensar"?', type: 'textarea' }
      ]
    },
    {
      title: '5. Condiciones comerciales básicas',
      questions: [
        { key: 'payment_policies',  label: 'Políticas de pago', type: 'textarea', help: 'Porcentaje de anticipo, plazos, contraentrega sí/no y zonas' },
        { key: 'warranty_text',     label: 'Texto exacto de condiciones de garantía', type: 'textarea' },
        { key: 'return_text',       label: 'Texto exacto de condiciones de devolución', type: 'textarea' },
        { key: 'damaged_text',      label: 'Texto para producto dañado o incompleto', type: 'textarea' },
        { key: 'handoff_moment',    label: '¿En qué momento el bot pasa el lead a un asesor humano?', type: 'textarea' }
      ]
    },
    {
      title: '6. IA y estilo de atención al cliente',
      questions: [
        { key: 'detail_level',          label: 'Nivel de detalle en las respuestas', type: 'select', options: ['Muy breve', 'Medio', 'Explicativo'] },
        { key: 'comparisons_allowed',   label: '¿Autorizado usar ejemplos, comparaciones o recomendaciones personalizadas?', type: 'yesno' },
        { key: 'product_recommendations', label: '¿Puede recomendar productos específicos según respuestas del cliente?', type: 'textarea', help: 'Reglas básicas' },
        { key: 'emoji_policy',          label: '¿Puede usar emojis? ¿Cuántos y en qué contexto?', type: 'textarea' },
        { key: 'bot_persona',           label: '¿Debe mencionar que es asistente virtual o hablar como parte del equipo?', type: 'select', options: ['Asistente virtual', 'Parte del equipo (humano)'] },
        { key: 'no_info_response',      label: 'Texto estándar cuando no haya información suficiente', type: 'textarea' }
      ]
    },
    {
      title: '7. Envíos, entregas y personalización',
      questions: [
        { key: 'shipping_cost',       label: '¿Cuánto cuesta el envío?', type: 'text' },
        { key: 'free_shipping',       label: '¿Envío gratis según valor de compra?', type: 'textarea' },
        { key: 'shipping_zones',      label: '¿Hasta qué zonas hacen envíos?', type: 'textarea' },
        { key: 'shipping_time',       label: '¿Cuánto se demora en llegar?', type: 'text' },
        { key: 'shipping_to_other',   label: '¿Puede pedirse para otra dirección?', type: 'yesno' },
        { key: 'scheduled_shipping',  label: '¿Se puede programar envío para fecha específica?', type: 'yesno' },
        { key: 'gift_wrap',           label: '¿Envoltura para regalo disponible?', type: 'yesno' },
        { key: 'personal_note',       label: '¿Permite nota personalizada?', type: 'yesno' }
      ]
    },
    {
      title: '8. Cambios y cancelaciones',
      questions: [
        { key: 'change_product',     label: '¿Puede cambiarse el producto después de hacer el pedido?', type: 'textarea' },
        { key: 'edit_order_data',    label: '¿Puede modificar datos del pedido si se equivocó?', type: 'textarea' },
        { key: 'cancel_order',       label: '¿Puede cancelarse un pedido?', type: 'textarea' },
        { key: 'not_at_home',        label: '¿Qué pasa si el cliente no está cuando llega el pedido?', type: 'textarea' }
      ]
    },
    {
      title: '9. Métodos de pago',
      questions: [
        { key: 'card_payments',     label: '¿Acepta tarjeta débito/crédito?', type: 'yesno' },
        { key: 'local_methods',     label: 'Métodos de pago locales que maneja', type: 'textarea' },
        { key: 'cash_on_delivery',  label: '¿Pago contra entrega?', type: 'yesno' }
      ]
    },
    {
      title: '10. Productos',
      questions: [
        { key: 'available_promos',   label: 'Promociones disponibles', type: 'textarea' },
        { key: 'top_promos',         label: 'Promociones más vendidas', type: 'textarea' },
        { key: 'sizes',              label: 'Tallas que manejan', type: 'textarea' },
        { key: 'best_seller',        label: 'Producto más vendido', type: 'text' },
        { key: 'kids_products',      label: '¿Tienen productos para niños?', type: 'yesno' }
      ]
    },
    {
      title: '11. Despachos y entregas',
      questions: [
        { key: 'shipping_cutoff',  label: '¿Hasta qué hora hacen envíos?', type: 'text' },
        { key: 'shipping_days',    label: '¿Qué días despachan o entregan pedidos?', type: 'text' }
      ]
    },
    {
      title: '12. Garantías y soporte',
      questions: [
        { key: 'damaged_received',     label: 'Pedido llegó dañado, ¿qué hago?', type: 'textarea' },
        { key: 'wrong_model_received', label: 'Llegó modelo diferente, ¿pueden cambiarlo?', type: 'textarea' },
        { key: 'missing_items',        label: 'No recibí todo lo que pedí, ¿pueden reponerlo?', type: 'textarea' }
      ]
    }
  ]
};

// ============================================================
// SERVICIOS (Consultorio / Clínica / Profesional con agenda)
// ============================================================
const SERVICIOS = {
  business_type: 'servicios',
  title: 'Cuestionario para creación del bot — Servicios / Consultorio',
  intro: 'Necesitamos esta información para configurar el bot de agendamiento, soporte y postconsulta.',
  sections: [
    {
      title: '1. Información general del consultorio',
      questions: [
        { key: 'commercial_name',    label: 'Nombre comercial del consultorio/clínica', type: 'text', required: true },
        { key: 'location',           label: 'Ciudad y barrio', type: 'text' },
        { key: 'specialties',        label: 'Especialidad(es) que manejas', type: 'textarea' },
        { key: 'staffing',           label: '¿Cómo atiendes?', type: 'select', options: ['Solo', 'Con un asistente', 'Con varios profesionales (cada uno con agenda propia)'] },
        { key: 'who_replies',        label: '¿Quién responde hoy WhatsApp?', type: 'select', options: ['Yo', 'Asistente', 'Varias personas'] },
        { key: 'patient_channels',   label: '¿Por qué canales te escriben los pacientes?', type: 'multiselect', options: ['WhatsApp', 'Instagram', 'Facebook', 'Llamadas', 'Web', 'Otro'] }
      ]
    },
    {
      title: '2. Servicios, tratamientos y productos',
      questions: [
        { key: 'all_services',          label: 'Lista todos los servicios y tratamientos que ofreces', type: 'textarea' },
        { key: 'top_services',          label: 'Los 3 más consultados o vendidos', type: 'textarea' },
        { key: 'packages',              label: '¿Tienes paquetes o combos? (Ej: planes de varias sesiones)', type: 'textarea' },
        { key: 'physical_products',     label: '¿Vendes productos físicos? (skincare, cosméticos, suplementos)', type: 'textarea' },
        { key: 'eval_required',         label: '¿Qué servicios requieren valoración previa obligatoria?', type: 'textarea' },
        { key: 'contraindications',     label: '¿Procedimientos con contraindicaciones que deban informarse antes?', type: 'textarea' },
        { key: 'bot_not_offer',         label: '¿Servicios que NO quieres que el bot ofrezca directamente?', type: 'textarea' }
      ]
    },
    {
      title: '3. Horarios, agenda y tipos de cita',
      questions: [
        { key: 'business_hours',         label: 'Horarios de atención', type: 'textarea' },
        { key: 'specific_days',          label: '¿Días específicos para ciertos procedimientos?', type: 'textarea' },
        { key: 'appointment_types',      label: 'Tipos de cita que manejas', type: 'multiselect', options: ['Valoración', 'Procedimiento', 'Control', 'Seguimiento virtual'] },
        { key: 'appointment_duration',   label: 'Duración aproximada de cada tipo', type: 'textarea' },
        { key: 'min_advance',            label: '¿Con cuánta anticipación mínima aceptas citas?', type: 'text' },
        { key: 'when_full',              label: 'Cuando la agenda está llena', type: 'select', options: ['Lista de espera', 'No agendar', 'Reagendar'] }
      ]
    },
    {
      title: '4. Proceso de agendamiento actual',
      questions: [
        { key: 'current_flow',         label: 'Paso a paso de cómo agenda hoy un paciente por WhatsApp', type: 'textarea' },
        { key: 'min_data_to_book',     label: 'Datos mínimos para agendar', type: 'textarea' },
        { key: 'availability_source',  label: '¿Dónde verificas disponibilidad?', type: 'select', options: ['Agenda digital', 'Software específico', 'Manual'] },
        { key: 'who_confirms',         label: '¿Quién confirma la cita?', type: 'text' },
        { key: 'confirmation_trigger', label: '¿Cuándo queda realmente confirmada?', type: 'select', options: ['Al agendar', 'Al pagar anticipo', 'Al enviar comprobante'] },
        { key: 'reminders',            label: '¿Envías recordatorios? ¿Cuándo y por qué canal?', type: 'textarea' }
      ]
    },
    {
      title: '5. Pagos, anticipos y políticas',
      questions: [
        { key: 'payment_methods',     label: 'Medios de pago que aceptas', type: 'textarea' },
        { key: 'deposit_required',    label: '¿Solicitas anticipo? Monto y para qué servicios', type: 'textarea' },
        { key: 'payment_proof',       label: '¿Qué debe enviar el paciente como comprobante?', type: 'textarea' },
        { key: 'cancellation_policy', label: 'Política de citas canceladas', type: 'textarea' },
        { key: 'no_show_policy',      label: 'Política de no-show', type: 'textarea' },
        { key: 'reschedule_policy',   label: 'Política de reprogramación', type: 'textarea' },
        { key: 'late_policy',         label: 'Política de llegadas tarde', type: 'textarea' },
        { key: 'prepaid_packages',    label: '¿Manejas paquetes prepagados? ¿Cómo validas sesiones restantes?', type: 'textarea' }
      ]
    },
    {
      title: '6. Tipos de pacientes y clasificación',
      questions: [
        { key: 'patient_mix',           label: '¿Qué tipo de paciente recibes más?', type: 'multiselect', options: ['Nuevo', 'Recurrente', 'Tratamiento activo', 'VIP'] },
        { key: 'good_vs_problem',       label: '¿Qué diferencia a un paciente "bueno" de uno "problemático"?', type: 'textarea' },
        { key: 'auto_classification',   label: '¿Te gustaría que el bot clasifique automáticamente a los pacientes? ¿Cómo?', type: 'textarea' }
      ]
    },
    {
      title: '7. Antes de la cita (preconsulta)',
      questions: [
        { key: 'pre_instructions',  label: '¿Envías instrucciones previas? ¿Para qué procedimientos?', type: 'textarea' },
        { key: 'pre_medical_qs',    label: '¿Haces preguntas médicas básicas antes?', type: 'textarea' },
        { key: 'informed_consent',  label: '¿Usas consentimiento informado?', type: 'select', options: ['Físico', 'Digital', 'No'] },
        { key: 'prior_photos',      label: '¿Solicitas fotos previas?', type: 'textarea' }
      ]
    },
    {
      title: '8. Después de la cita',
      questions: [
        { key: 'post_recommendations', label: '¿Entregas recomendaciones post tratamiento?', type: 'textarea' },
        { key: 'auto_followup',        label: '¿Programas controles automáticamente?', type: 'textarea' },
        { key: 'reviews_collection',   label: '¿Solicitas reseñas, valoraciones o testimonios?', type: 'textarea' }
      ]
    },
    {
      title: '9. Promociones y fidelización',
      questions: [
        { key: 'special_dates_promos', label: '¿Realizas promociones por fechas especiales?', type: 'textarea' },
        { key: 'referral_system',      label: '¿Manejas referidos? ¿Cómo los validas?', type: 'textarea' },
        { key: 'loyalty_system',       label: '¿Tienes sistema de fidelización?', type: 'textarea' }
      ]
    },
    {
      title: '10. Quejas, urgencias y casos sensibles',
      questions: [
        { key: 'complaint_handling',   label: '¿Cómo manejas hoy una queja?', type: 'textarea' },
        { key: 'handoff_to_human',     label: '¿En qué casos el bot debe pasar inmediatamente a humano?', type: 'textarea' },
        { key: 'refund_policy',        label: 'Políticas claras sobre devoluciones, garantías y retoques', type: 'textarea' }
      ]
    },
    {
      title: '11. Expectativa real del bot',
      questions: [
        { key: 'bot_should_do',     label: '¿Qué te gustaría que el bot haga SOLO?', type: 'textarea' },
        { key: 'bot_should_not_do', label: '¿Qué NO quieres que haga nunca?', type: 'textarea' },
        { key: 'human_takeover_hours', label: '¿En qué horario hay alguien para tomar el control humano?', type: 'text' },
        { key: 'agenda_software',   label: '¿Usas actualmente algún software de agenda? ¿Cuál?', type: 'text' },
        { key: 'whatsapp_lines',    label: '¿Manejas uno o varios WhatsApp?', type: 'text' }
      ]
    }
  ]
};

// ============================================================
// EXPORT
// ============================================================
export const INTAKE_SCHEMAS = {
  infoproductor: INFOPRODUCTOR,
  ecommerce:     ECOMMERCE,
  servicios:     SERVICIOS
};

export function getIntakeSchema(businessType) {
  return INTAKE_SCHEMAS[businessType] || null;
}

// Cuenta preguntas totales y respondidas en un schema dado contra un objeto answers.
// Una respuesta cuenta como "respondida" si:
//   - text/textarea: string trim no vacío
//   - select/yesno: hay valor
//   - multiselect: array con al menos 1 elemento
export function intakeProgress(schema, answers) {
  if (!schema) return { total: 0, answered: 0, percent: 0, requiredMissing: [] };
  const ans = answers || {};
  let total = 0;
  let answered = 0;
  const requiredMissing = [];
  for (const sec of schema.sections) {
    for (const q of sec.questions) {
      total++;
      const v = ans[q.key];
      const filled = (() => {
        if (v === null || v === undefined) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'string') return v.trim().length > 0;
        return true;
      })();
      if (filled) answered++;
      if (q.required && !filled) requiredMissing.push(q.key);
    }
  }
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);
  return { total, answered, percent, requiredMissing };
}
