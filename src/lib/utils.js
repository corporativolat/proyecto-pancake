export const userInitials = (name) => (name || '?').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
export const avatarClass = (n) => {
  const v = parseInt(n) || 1;
  const safe = ((v - 1) % 12 + 12) % 12 + 1;
  return `av-${safe}`;
};

export const calcPhaseProgress = (phase) => {
  if (!phase?.tasks?.length) return 0;
  return Math.round((phase.tasks.filter(t => t.completed).length / phase.tasks.length) * 100);
};
export const calcProjectProgress = (project) => {
  if (!project?.phases?.length) return 0;
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
