import { createClient } from '@supabase/supabase-js';

// Defensa contra env vars contaminadas en Vercel UI:
// strip whitespace interno, comillas envolventes, slash final.
// JWT y URL nunca llevan whitespace internamente.
const sanitize = (v) => (v || '')
  .replace(/^['"]|['"]$/g, '')   // quita comillas envolventes
  .replace(/\s+/g, '');          // quita TODO whitespace (espacios, \n, \t, \r)

const url = sanitize(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const key = sanitize(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!url || !key) {
  // Falla loud y claro en consola para diagnosticar build sin envs.
  console.error('[supabase] env vars missing:', { url: !!url, key: !!key });
}

export const supabase = createClient(url, key, {
  db: { schema: 'pro_gestion' },
  auth: { persistSession: true, autoRefreshToken: true }
});
