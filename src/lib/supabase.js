import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabase = createClient(url, key, {
  db: { schema: 'pro_gestion' },
  auth: { persistSession: true, autoRefreshToken: true }
});
