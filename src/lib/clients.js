import { supabase } from './supabase';

// Lista todos los clientes (profiles role='cliente').
export async function fetchClients() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, phone, company, suspended, avatar, created_at')
    .eq('role', 'cliente')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Llama la edge function admin-create-client.
export async function createClient(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sesión expirada');
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-client`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export async function updateClient(id, patch) {
  const allowed = ['name', 'phone', 'company', 'suspended'];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  const { error } = await supabase.from('profiles').update(clean).eq('id', id).eq('role', 'cliente');
  if (error) throw error;
}

// Asignar/desasignar cliente a proyecto (UPDATE projects.client_id).
export async function assignClientToProject(projectId, clientId) {
  const { error } = await supabase.from('projects').update({ client_id: clientId }).eq('id', projectId);
  if (error) throw error;
}

export async function clientProjects(clientId) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, status, start_date, projected_end_date')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
