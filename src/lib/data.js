import { supabase } from './supabase';
import { logger } from './logger';

export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select(`
      *,
      members:project_members(profile_id),
      phases(*, tasks(*)),
      milestones(*)
    `)
    .order('created_at', { ascending: true });
  if (error) throw error;
  data.forEach(p => {
    p.phases?.sort((a, b) => a.position - b.position);
    p.phases?.forEach(ph => ph.tasks?.sort((a, b) => a.position - b.position));
    p.milestones?.sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
    p.member_ids = (p.members || []).map(m => m.profile_id);
  });
  return data;
}

export async function fetchProfiles() {
  // Excluye clientes — staff y portal cliente viven separados.
  // Para listar clientes: src/lib/clients.js::fetchClients.
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'cliente')
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('created_at');
  if (error) throw error;
  return data;
}

export async function createProject(payload, opts = {}) {
  const { data, error } = await supabase.from('projects').insert(payload).select().single();
  if (error) throw error;
  const firstPhaseName = opts.firstPhaseName || 'Nueva Fase';
  const { data: phase, error: phaseError } = await supabase.from('phases').insert({ project_id: data.id, name: firstPhaseName, start_week: 1, duration_weeks: 2, position: 0 }).select().single();
  if (phaseError) logger.error('createProject: phase insert failed', phaseError);
  return { ...data, phases: phase ? [{ ...phase, tasks: [] }] : [], member_ids: [] };
}

export async function updateProject(id, patch) {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProjectById(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function setProjectMember(projectId, profileId, isMember) {
  if (isMember) {
    const { error } = await supabase.from('project_members').insert({ project_id: projectId, profile_id: profileId });
    // 23505 = unique violation (ya es miembro). 23503 = FK fail. Solo silenciamos duplicado.
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('profile_id', profileId);
    if (error) throw error;
  }
}

export async function createPhase(projectId, position, extra = {}) {
  const { data, error } = await supabase.from('phases').insert({ project_id: projectId, name: 'NUEVA FASE', start_week: 1, duration_weeks: 2, position, ...extra }).select().single();
  if (error) throw error;
  return { ...data, tasks: [] };
}
export async function updatePhase(id, patch) {
  const { error } = await supabase.from('phases').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deletePhase(id) {
  const { error } = await supabase.from('phases').delete().eq('id', id);
  if (error) throw error;
}

export async function createTask(phaseId, payload) {
  const { data, error } = await supabase.from('tasks').insert({ phase_id: phaseId, ...payload }).select().single();
  if (error) throw error;
  return data;
}
export async function updateTask(id, patch) {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

export async function createCategory(name, color) {
  const { data, error } = await supabase.from('categories').insert({ name, color }).select().single();
  if (error) throw error;
  return data;
}
export async function updateCategory(id, patch) {
  const { error } = await supabase.from('categories').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function updateProfile(id, patch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteProfile(id) {
  const { error } = await supabase.from('profiles').delete().eq('id', id);
  if (error) throw error;
}

// MILESTONES
export async function createMilestone(projectId, payload) {
  const { data, error } = await supabase.from('milestones').insert({ project_id: projectId, ...payload }).select().single();
  if (error) throw error;
  return data;
}
export async function updateMilestone(id, patch) {
  const { error } = await supabase.from('milestones').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteMilestone(id) {
  const { error } = await supabase.from('milestones').delete().eq('id', id);
  if (error) throw error;
}

// REORDER fases (transaccional vía RPC, ver supabase-migration-9.sql)
export async function reorderPhases(items) {
  const { error } = await supabase.rpc('reorder_phases', { items });
  if (error) throw error;
}

// =============================================================
// Plantillas de hitos (mig-19)
// =============================================================
export async function fetchMilestoneTemplates(categoryId = null) {
  let q = supabase.from('milestone_templates').select('*').order('position').order('created_at');
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createMilestoneTemplate(payload) {
  const { data, error } = await supabase.from('milestone_templates').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateMilestoneTemplate(id, patch) {
  const { error } = await supabase.from('milestone_templates').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMilestoneTemplate(id) {
  const { error } = await supabase.from('milestone_templates').delete().eq('id', id);
  if (error) throw error;
}

// =============================================================
// Mapea un error de Postgres/Supabase a una clave i18n amigable.
// Devuelve { key, raw }: `key` para mostrar al usuario vía t(), `raw`
// para loguear. Códigos: 42501/RLS, 23505 unique, 23503 FK,
// 23514 check, 23502 not-null.
// =============================================================
export function friendlyDbError(e) {
  const msg = (e?.message || '').toLowerCase();
  const code = e?.code || '';
  if (code === '42501' || msg.includes('row-level security')) return { key: 'db.error.rls', raw: e?.message };
  if (code === '23505') return { key: 'db.error.duplicate', raw: e?.message };
  if (code === '23503') return { key: 'db.error.fk', raw: e?.message };
  if (code === '23514') return { key: 'db.error.check', raw: e?.message };
  if (code === '23502') return { key: 'db.error.notNull', raw: e?.message };
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('fetch')) return { key: 'db.error.network', raw: e?.message };
  return { key: 'db.error.generic', raw: e?.message };
}

// RPC: aplica plantilla por categoría al proyecto. Devuelve cantidad creados.
export async function applyMilestoneTemplate(projectId) {
  const { data, error } = await supabase.rpc('apply_milestone_template', { p_project_id: projectId });
  if (error) throw error;
  return data ?? 0;
}

// ===== Document templates (mig-21) =====
export async function fetchDocumentTemplates(categoryId = null) {
  let q = supabase.from('document_templates').select('*').order('position').order('created_at');
  if (categoryId) q = q.eq('category_id', categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createDocumentTemplate(payload) {
  const { data, error } = await supabase.from('document_templates').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateDocumentTemplate(id, patch) {
  const { error } = await supabase.from('document_templates').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteDocumentTemplate(id) {
  const { error } = await supabase.from('document_templates').delete().eq('id', id);
  if (error) throw error;
}

// RPC: aplica plantillas de documentos al proyecto. trigger=null aplica todas.
export async function applyDocumentTemplate(projectId, triggerStatus = null) {
  const { data, error } = await supabase.rpc('apply_document_template', {
    p_project_id: projectId,
    p_trigger_status: triggerStatus
  });
  if (error) throw error;
  return data ?? 0;
}
