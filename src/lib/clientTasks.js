import { supabase } from './supabase';

const ALLOWED_EXT = new Set([
  'pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp',
  'png','jpg','jpeg','gif','webp','svg',
  'txt','csv','md','json','log',
  'zip','rar','7z'
]);

export const CLIENT_TASK_PRIORITIES = ['baja','media','urgente'];
export const CLIENT_TASK_STATUSES = ['pendiente','en_progreso','entregado','aprobado','rechazado'];

// Lista tareas de un proyecto. Staff ve todas; cliente solo sus asignadas (RLS).
export async function listClientTasks(projectId) {
  const { data, error } = await supabase
    .from('client_tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Lista tareas asignadas a un usuario (vista cliente: cross-project).
export async function listAssignedTasks(profileId) {
  const { data, error } = await supabase
    .from('client_tasks')
    .select('*, projects:project_id(id, title)')
    .eq('assigned_to', profileId)
    .order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function createClientTask(payload) {
  const allowed = ['project_id','assigned_to','title','description','priority','start_date','due_date'];
  const clean = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)));
  const { data: { user } } = await supabase.auth.getUser();
  if (user) clean.created_by = user.id;
  const { data, error } = await supabase.from('client_tasks').insert(clean).select().single();
  if (error) throw error;
  return data;
}

export async function updateClientTask(id, patch) {
  const { data, error } = await supabase.from('client_tasks').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteClientTask(id) {
  const { error } = await supabase.from('client_tasks').delete().eq('id', id);
  if (error) throw error;
}

// Sube el archivo de entrega al bucket "documents" bajo el path
// <project_id>/client-tasks/<task_id>/<ts>-<safeName>. El primer folder
// es el project_id para satisfacer la policy de storage de mig-20.
// Marca la tarea como entregado y guarda file_path + file_name.
export async function deliverClientTask({ task, file }) {
  if (!file) throw new Error('Archivo requerido');
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new Error(`Tipo de archivo .${ext} no permitido`);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${task.project_id}/client-tasks/${task.id}/${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
  if (upErr) throw upErr;
  const patch = {
    file_path: path,
    file_name: file.name,
    status: 'entregado',
    delivered_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('client_tasks').update(patch).eq('id', task.id).select().single();
  if (error) throw error;
  return data;
}

export async function signedUrlForTaskFile(filePath, ttl = 300) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, ttl);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewClientTask({ id, approved, comment }) {
  const { data: { user } } = await supabase.auth.getUser();
  const patch = {
    status: approved ? 'aprobado' : 'rechazado',
    reviewed_by: user?.id || null,
    reviewed_at: new Date().toISOString(),
    review_comment: comment || null
  };
  const { data, error } = await supabase.from('client_tasks').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export function priorityMeta(p) {
  if (p === 'urgente') return { label: 'Urgente', cls: 'bg-red-100 text-red-700 border-red-200',  dot: 'bg-red-500' };
  if (p === 'baja')    return { label: 'Baja',    cls: 'bg-ink-100 text-ink-600 border-ink-200',  dot: 'bg-ink-400' };
  return                         { label: 'Media',   cls: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
}

export function statusMeta(s) {
  switch (s) {
    case 'pendiente':    return { label: 'Pendiente',    cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    case 'en_progreso':  return { label: 'En progreso',  cls: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'entregado':    return { label: 'Entregado',    cls: 'bg-violet-100 text-violet-700 border-violet-200' };
    case 'aprobado':     return { label: 'Aprobado',     cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    case 'rechazado':    return { label: 'Rechazado',    cls: 'bg-red-100 text-red-700 border-red-200' };
    default:             return { label: s,              cls: 'bg-ink-100 text-ink-600 border-ink-200' };
  }
}

// Devuelve {days, label, overdue} relativo a hoy. days<0 = vencida.
export function dueRelative(dueDate) {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dueDate + 'T00:00:00');
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { days, label: `vencida hace ${Math.abs(days)} d`, overdue: true };
  if (days === 0) return { days, label: 'vence hoy', overdue: false, soon: true };
  if (days === 1) return { days, label: 'vence mañana', overdue: false, soon: true };
  if (days <= 3)  return { days, label: `en ${days} días`, overdue: false, soon: true };
  return { days, label: `en ${days} días`, overdue: false };
}
