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

export async function createComment(projectId, profileId, body) {
  const { data, error } = await supabase.from('comments').insert({ project_id: projectId, profile_id: profileId, body }).select('*, profile:profiles(id,name,avatar,avatar_url)').single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchActivity(limit = 20) {
  const { data, error } = await supabase.from('activity')
    .select('*, profile:profiles(id,name,avatar,avatar_url), project:projects(id,title)')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function logActivity(profileId, projectId, kind, detail) {
  try {
    await supabase.from('activity').insert({ profile_id: profileId, project_id: projectId, kind, detail });
  } catch (e) { logger.warn('activity log fail', e); }
}
