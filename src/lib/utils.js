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
