import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = { ...loadEnv(), ...process.env };
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pro_gestion' } });

const titleArg = process.argv.find(a => a.startsWith('--title='));
if (!titleArg) { console.error('Uso: --title="Eduard Tiktok"'); process.exit(1); }
const title = titleArg.split('=')[1];

const { data: proj, error: e1 } = await supabase.from('projects').select('id, title').ilike('title', title);
if (e1) { console.error(e1); process.exit(1); }
if (!proj?.length) { console.error('No match'); process.exit(1); }
console.log('Match:', proj.map(p => p.title));

const ids = proj.map(p => p.id);
const { data, error } = await supabase.from('notification_log').delete().in('project_id', ids).select();
if (error) { console.error(error); process.exit(1); }
console.log(`Borrados ${data?.length || 0} logs.`);
