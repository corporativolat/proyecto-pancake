import { supabase } from './supabase';

export async function createErrorReport({ profileId, title, description, severity = 'normal' }) {
  const payload = {
    profile_id: profileId,
    title: title.trim(),
    description: description.trim(),
    severity,
    page_url: typeof window !== 'undefined' ? window.location.href : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };
  const { data, error } = await supabase.from('error_reports').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function fetchErrorReports({ scope = 'all' } = {}) {
  let q = supabase
    .from('error_reports')
    .select('*, profile:profiles(id,name,avatar,avatar_url,email)')
    .order('created_at', { ascending: false });
  if (scope === 'open') q = q.in('status', ['open', 'in_progress']);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function updateErrorReport(id, patch) {
  const { error } = await supabase.from('error_reports').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteErrorReport(id) {
  const { error } = await supabase.from('error_reports').delete().eq('id', id);
  if (error) throw error;
}
