export const userInitials = (name) => (name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();

// Moneda: locale por código para que Intl formatee con el símbolo correcto.
export const CURRENCY_LOCALE = { COP: 'es-CO', USD: 'en-US', BRL: 'pt-BR' };
export const fmtMoney = (n, cur = 'COP') => {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(CURRENCY_LOCALE[cur] || 'es-CO',
    { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
};

export const avatarClass = (n) => {
  const v = parseInt(n) || 1;
  const safe = ((v - 1) % 12 + 12) % 12 + 1;
  return `av-${safe}`;
};

// Progreso de una tarea: usa `progress` (0-100) si existe; si no, deriva de `completed`.
export const taskProgress = (t) =>
  Number.isFinite(t?.progress) ? t.progress : (t?.completed ? 100 : 0);

export const calcPhaseProgress = (phase) => {
  if (!phase?.tasks?.length) return 0;
  return Math.round(phase.tasks.reduce((a, t) => a + taskProgress(t), 0) / phase.tasks.length);
};

// ---- Plazo del proyecto en la grilla del Gantt (8 semanas / 56 días) --------
// Día 0 = start_date. El último día permitido es projected_end_date.
// Devuelve el índice (0-based) del último día utilizable, tope 55.
// Sin start_date o sin projected_end_date => 55 (sin restricción).
export function projectMaxDayIndex(project) {
  if (!project?.start_date || !project?.projected_end_date) return 55;
  const s = new Date(project.start_date + 'T00:00:00');
  const e = new Date(project.projected_end_date + 'T00:00:00');
  const days = Math.round((e - s) / 86400000);
  if (!Number.isFinite(days) || days < 0) return 55;
  return Math.min(55, days);
}

export const dayIndexOf = (week, day) => (week - 1) * 7 + (day - 1);
export const weekDayFromIndex = (idx) => ({
  week: Math.min(8, Math.floor(idx / 7) + 1),
  day: (idx % 7) + 1,
});

// Ajusta una fase/tarea ({start_week, start_day, duration}) para que no exceda
// el plazo del proyecto. `duration` está en días.
export function clampSpanToProject({ start_week, start_day, duration }, maxDayIndex) {
  let sw = Math.max(1, Math.min(8, parseInt(start_week) || 1));
  let sd = Math.max(1, Math.min(7, parseInt(start_day) || 1));
  let dur = Math.max(1, Math.min(56, parseInt(duration) || 1));
  let idx = dayIndexOf(sw, sd);
  if (idx > maxDayIndex) {
    idx = maxDayIndex;
    const wd = weekDayFromIndex(idx);
    sw = wd.week; sd = wd.day;
  }
  if (idx + dur - 1 > maxDayIndex) dur = Math.max(1, maxDayIndex - idx + 1);
  return { start_week: sw, start_day: sd, duration: dur };
}

// Ajusta una tarea para que quede DENTRO de su fase padre (intersectado con
// el plazo del proyecto). Las actividades pertenecen a la fase: nunca deben
// caer fuera de ella ni por la izquierda ni por la derecha.
//   - phase: { start_week, start_day, duration_days?, duration_weeks }
//   - maxDayIndex: límite del plazo del proyecto (0-based)
export function clampSpanToPhase({ start_week, start_day, duration }, phase, maxDayIndex) {
  const phaseStart = ((phase.start_week - 1) * 7) + ((phase.start_day || 1) - 1);
  const phaseDur   = phase.duration_days != null ? phase.duration_days : (phase.duration_weeks || 1) * 7;
  const phaseEnd   = phaseStart + phaseDur; // exclusivo
  // Primero clamp al proyecto.
  const p = clampSpanToProject({ start_week, start_day, duration }, maxDayIndex);
  let idx = dayIndexOf(p.start_week, p.start_day);
  let dur = p.duration;
  // La duración no puede exceder el ancho de la fase.
  dur = Math.max(1, Math.min(dur, phaseDur));
  // Encaja el inicio dentro de [phaseStart, phaseEnd - dur].
  idx = Math.max(phaseStart, Math.min(phaseEnd - dur, idx));
  const wd = weekDayFromIndex(idx);
  return { start_week: wd.week, start_day: wd.day, duration: dur };
}
// Cumplimiento automático = promedio del cumplimiento de TODAS las fases.
// Una fase sin actividades cuenta como 0%. Si no hay fases, devuelve 0.
export const calcProjectProgressAuto = (project) => {
  const phases = project?.phases || [];
  if (phases.length === 0) return 0;
  return Math.round(phases.reduce((a, ph) => a + calcPhaseProgress(ph), 0) / phases.length);
};

// Cumplimiento efectivo del proyecto. Si `manual_progress` está seteado
// (0-100), actúa como override manual y manda sobre el cálculo por tareas.
// Si es null, cae al cálculo automático.
export const calcProjectProgress = (project) => {
  if (Number.isFinite(project?.manual_progress)) return project.manual_progress;
  return calcProjectProgressAuto(project);
};

export function healthSignal(project, prog) {
  if (project.status === 'Finalizado') return 'green';
  if (project.status === 'En Pausa' || project.status === 'Pendiente de información') return 'amber';
  if (!project.start_date) return 'gray';
  const start = new Date(project.start_date);
  const now = new Date();
  // Avance esperado según el tiempo transcurrido sobre la duración planeada
  // (start_date → projected_end_date). Si no hay fecha fin, cae al supuesto
  // histórico de 8 semanas.
  const end = project.projected_end_date ? new Date(project.projected_end_date) : null;
  let expected;
  if (end && end > start) {
    const elapsed = Math.max(0, now - start);
    expected = Math.min(100, (elapsed / (end - start)) * 100);
  } else {
    const elapsedWeeks = Math.max(1, (now - start) / (1000 * 60 * 60 * 24 * 7));
    expected = Math.min(100, (elapsedWeeks / 8) * 100);
  }
  if (prog >= expected - 10) return 'green';
  if (prog >= expected - 25) return 'amber';
  return 'red';
}

// Salud efectiva: si el proyecto tiene `health_override` (1/2/3) lo respeta;
// de lo contrario delega a `healthSignal()`. Devuelve 'green' | 'amber' | 'red' | 'gray'.
export function effectiveHealth(project, prog) {
  const ov = project?.health_override;
  if (ov === 1) return 'green';
  if (ov === 2) return 'amber';
  if (ov === 3) return 'red';
  return healthSignal(project, prog);
}

// Indicador de salud ACCESIBLE (no depende del color — para daltónicos).
// Emoji por estado + clave i18n del label para el tooltip.
export const HEALTH_META = {
  green: { emoji: '🙂', i18n: 'health.state.green' },
  amber: { emoji: '😐', i18n: 'health.state.amber' },
  red:   { emoji: '☹️', i18n: 'health.state.red' },
  gray:  { emoji: '⚪', i18n: 'health.state.gray' },
};
export const healthEmoji = (h) => (HEALTH_META[h] || HEALTH_META.gray).emoji;

// Salud agregada del portafolio. Pondera cada proyecto por su salud efectiva
// (verde=100, amarillo=50, rojo=0); los grises (sin datos) NO entran al score
// para no castigar proyectos que aún no tienen fecha. Devuelve el score 0-100
// más el conteo por estado para mostrar el desglose.
export function portfolioHealth(projects) {
  const counts = { green: 0, amber: 0, red: 0, gray: 0 };
  for (const p of (projects || [])) {
    const h = effectiveHealth(p, calcProjectProgress(p));
    counts[h] = (counts[h] || 0) + 1;
  }
  const scored = counts.green + counts.amber + counts.red;
  const score = scored ? Math.round((counts.green * 100 + counts.amber * 50) / scored) : 0;
  return { score, scored, ...counts };
}

// Campos críticos para considerar un proyecto "completo".
// Owner cuenta si owner_id o owner_label están llenos (req B3).
export const PROJECT_CRITICAL_FIELDS = [
  'title', 'category_id', 'owner', 'start_date',
  'projected_end_date', 'goal', 'contract_url',
  'project_value', 'project_hours'
];

// Score 0-100 de cuán completo está un proyecto. Útil para tabla y dashboard.
export function projectCompleteness(p) {
  if (!p) return 0;
  let filled = 0;
  for (const f of PROJECT_CRITICAL_FIELDS) {
    let v;
    if (f === 'owner') v = p.owner_id || (p.owner_label && p.owner_label.trim());
    else v = p[f];
    if (v !== null && v !== undefined && v !== '' && v !== 0) filled++;
    else if (f === 'project_value' || f === 'project_hours') {
      // 0 cuenta como vacío pero null/undefined también. Ya manejado arriba.
    }
  }
  return Math.round((filled / PROJECT_CRITICAL_FIELDS.length) * 100);
}

// True si proyecto ya cerró (no debe contar como "vencido").
// Incluye 'Cancelado' (mig-34) además de Finalizado/Entregado.
export const isFinalStatus = (s) => s === 'Finalizado' || s === 'Entregado' || s === 'Cancelado';

// Vencimiento contra projected_end_date vs hoy.
// kind: 'overdue' | 'soon' (≤7d) | 'ok' | 'done' (finalizado) | 'none' (sin fecha)
export function vencimiento(project) {
  if (!project) return { days: null, kind: 'none' };
  if (isFinalStatus(project.status)) return { days: 0, kind: 'done' };
  if (!project.projected_end_date) return { days: null, kind: 'none' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const fin = new Date(project.projected_end_date + 'T00:00:00');
  const days = Math.round((fin - today) / 86400000);
  if (days < 0) return { days: Math.abs(days), kind: 'overdue' };
  if (days <= 7) return { days, kind: 'soon' };
  return { days, kind: 'ok' };
}

// STATUSES alineados con el Excel "Resumen" (mig-34). `step` controla el orden
// canónico del dropdown y el prefijo numérico visible ("0. No iniciado" etc.).
// `name` es la clave persistida en DB (sin prefijo) — no romper compat.
export const STATUSES = [
  { name: 'No iniciado',              step: 0,  color: '#a1a1aa', label: '0. No iniciado' },
  { name: 'Planeación',               step: 1,  color: '#06b6d4', label: '1. Planeación' },
  { name: 'En Desarrollo',            step: 2,  color: '#7c3aed', label: '2. En Desarrollo' },
  { name: 'Validación de viabilidad', step: 4,  color: '#ec4899', label: '4. Validación de viabilidad' },
  { name: 'Entregado',                step: 6,  color: '#10b981', label: '6. Entregado' },
  { name: 'Cancelado',                step: 7,  color: '#ef4444', label: '7. Cancelado' },
  { name: 'En Pausa',                 step: 8,  color: '#f59e0b', label: 'En Pausa' },
  { name: 'Pendiente de información', step: 9,  color: '#a855f7', label: 'Pendiente de información' },
  { name: 'Finalizado',               step: 10, color: '#059669', label: 'Finalizado' }
];

export const STATUS_BY_NAME = STATUSES.reduce((acc, s) => { acc[s.name] = s; return acc; }, {});

// Marcador de "Atención" del Excel (⭐ / ⚠️).
// Null = normal (sin marca).
export const PRIORITY = {
  estrella: { icon: '⭐', label: 'Estrella',  color: '#f59e0b', tone: 'amber', order: 0 },
  atencion: { icon: '⚠️', label: 'Atención',  color: '#ef4444', tone: 'red',   order: 1 }
};

export const PRIORITY_OPTIONS = [
  { value: '',         icon: '',   label: 'Normal' },
  { value: 'estrella', icon: '⭐', label: 'Estrella' },
  { value: 'atencion', icon: '⚠️', label: 'Atención' }
];

// Helpers de fechas (Δ inicio, Vencimiento granular, Duración total).
// Todos devuelven null si falta la fecha base.
export const _midnight = (iso) => iso ? new Date(iso + 'T00:00:00') : null;

export function daysSinceStart(project) {
  const d = _midnight(project?.start_date);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / 86400000);
}

export function daysToDue(project) {
  const d = _midnight(project?.projected_end_date);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

export function projectDurationDays(project) {
  const s = _midnight(project?.start_date);
  const e = _midnight(project?.projected_end_date);
  if (!s || !e) return null;
  return Math.max(0, Math.floor((e - s) / 86400000));
}

// Categorías combinadas (primaria + extras del array mig-34).
// Devuelve siempre array de uuids; útil para filtros y tooltips.
export function projectAllCategoryIds(project) {
  const ids = [];
  if (project?.category_id) ids.push(project.category_id);
  for (const id of project?.extra_category_ids || []) {
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function projectCategoryNames(project, categories = []) {
  return projectAllCategoryIds(project)
    .map(id => categories.find(c => c.id === id)?.name)
    .filter(Boolean);
}

// True si el proyecto está bloqueado (mig-34 blocker_note no vacío).
export const isBlocked = (project) => !!(project?.blocker_note && project.blocker_note.trim());

// Descripciones oficiales de cada columna del proyecto.
// Se muestran como ayuda inline en el modal de creación y en el detalle.
export const PROJECT_FIELD_HELP = {
  title: 'Título del proyecto.',
  company: 'Empresa o cliente al que pertenece la iniciativa.',
  category_id: 'Categoría del proyecto en ejecución.',
  client_lead: 'Responsable del proyecto de cara al cliente.',
  status: 'Momento del proceso en que se encuentra el proyecto.',
  goal: 'Propósito del proyecto y su alcance.',
  owner_id: 'Persona que lidera el proyecto internamente.',
  start_date: 'Fecha en que inicia el proyecto.',
  projected_end_date: 'Fecha proyectada para finalizar y entregar el proyecto.',
  delivery_date: 'Fecha real en que se entrega el proyecto.',
  contract_url: 'Enlace que lleva a la propuesta comercial firmada por el cliente.',
  observation: 'Actualizaciones objetivas sobre el estado del proyecto, riesgos, limitaciones o logros alcanzados.'
};

// Significado oficial de cada tipo de proyecto.
export const PROJECT_CATEGORY_HELP = {
  'Innovación y Desarrollo': 'Desarrollo de nuevas herramientas | Actualización de funcionalidades.',
  'Alianza comercial':       'Desarrollo de parametrizaciones con alianza comercial.',
  'Parametrizaciones':       'Desarrollo de parametrizaciones con clientes.',
  'Eventos':                 'Desarrollo de parametrizaciones para eventos internos o externos.',
  'Curso | Lanzamientos':    'Desarrollo de parametrizaciones para lanzamientos o cursos internos.',
  'Integraciones':           'Planificación, ejecución y validación de integraciones con plataformas externas.',
  'Productos específicos':   'Desarrollo de productos nuevos para venta comercial.'
};
