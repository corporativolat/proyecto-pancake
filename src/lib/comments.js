import { supabase } from './supabase';
import { logger } from './logger';

export async function fetchComments(projectId) {
  const { data, error } = await supabase.from('comments')
    .select('*, profile:profiles(id,name,avatar,avatar_url)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createComment(projectId, profileId, body, tag = null) {
  const payload = { project_id: projectId, profile_id: profileId, body };
  if (tag) payload.tag = tag;
  const { data, error } = await supabase.from('comments').insert(payload).select('*, profile:profiles(id,name,avatar,avatar_url)').single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

// fetchActivity ahora acepta opcionales: { projectId, limit, tag, kind }.
// Compat: si se pasa un número como primer arg (uso viejo) se trata como limit.
export async function fetchActivity(opts = {}) {
  const params = typeof opts === 'number' ? { limit: opts } : (opts || {});
  const limit = params.limit ?? 20;
  let q = supabase.from('activity')
    .select('*, profile:profiles(id,name,avatar,avatar_url), project:projects(id,title)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (params.projectId) q = q.eq('project_id', params.projectId);
  if (params.tag) q = q.eq('tag', params.tag);
  if (params.kind) q = q.eq('kind', params.kind);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// logActivity ahora acepta tag y meta. tag defaults a 'manual' cuando el log
// viene del cliente (los triggers DB usan 'sistema' o 'avance').
export async function logActivity(profileId, projectId, kind, detail, { tag = 'manual', meta = null } = {}) {
  try {
    const payload = { profile_id: profileId, project_id: projectId, kind, detail, tag };
    if (meta) payload.meta = meta;
    await supabase.from('activity').insert(payload);
  } catch (e) { logger.warn('activity log fail', e); }
}
