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
export const calcProjectProgress = (project) => {
  const totalTasks = (project?.phases || []).reduce((a, ph) => a + (ph.tasks?.length || 0), 0);
  if (totalTasks === 0) {
    return Number.isFinite(project?.manual_progress) ? project.manual_progress : 0;
  }
  return Math.round(project.phases.reduce((a, ph) => a + calcPhaseProgress(ph), 0) / project.phases.length);
};

export function healthSignal(project, prog) {
  if (project.status === 'Finalizado') return 'green';
  if (project.status === 'En Pausa' || project.status === 'Pendiente de información') return 'amber';
  if (!project.start_date) return 'gray';
  const start = new Date(project.start_date);
  const now = new Date();
  const elapsedWeeks = Math.max(1, (now - start) / (1000 * 60 * 60 * 24 * 7));
  const expected = Math.min(100, (elapsedWeeks / 8) * 100);
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
export const isFinalStatus = (s) => s === 'Finalizado' || s === 'Entregado';

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

export const STATUSES = [
  { name: 'No iniciado', color: '#a1a1aa' },
  { name: 'Planeación', color: '#06b6d4' },
  { name: 'En Desarrollo', color: '#7c3aed' },
  { name: 'En Pausa', color: '#f59e0b' },
  { name: 'Pendiente de información', color: '#a855f7' },
  { name: 'Validación de viabilidad', color: '#ec4899' },
  { name: 'Finalizado', color: '#10b981' }
];

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
