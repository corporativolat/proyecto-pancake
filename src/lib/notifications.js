import { supabase } from './supabase';

export async function fetchNotifications(limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function markRead(id) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function markAllRead(profileId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('read_at', null);
  if (error) throw error;
}

export function subscribeNotifications(profileId, onInsert) {
  if (!profileId) return () => {};
  const uniq = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const ch = supabase
    .channel(`notif-${profileId}-${uniq}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'pro_gestion',
      table: 'notifications',
      filter: `profile_id=eq.${profileId}`
    }, (payload) => {
      onInsert?.(payload.new);
    })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}
