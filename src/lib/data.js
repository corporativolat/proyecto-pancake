import { supabase } from './supabase';

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
  const { data, error } = await supabase.from('profiles').select('*').order('created_at');
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
  const { data: phase } = await supabase.from('phases').insert({ project_id: data.id, name: firstPhaseName, start_week: 1, duration_weeks: 2, position: 0 }).select().single();
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

export async function createPhase(projectId, position) {
  const { data, error } = await supabase.from('phases').insert({ project_id: projectId, name: 'NUEVA FASE', start_week: 1, duration_weeks: 2, position }).select().single();
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
