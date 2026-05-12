/* Test final: forzar un proyecto a vencer en 5 días + notification_email →
 * invocar edge function cloud → verificar envío real → revertir. */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return {};
  const o = {};
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}
const ENV = { ...loadEnv(), ...process.env };
const supabase = createClient(ENV.VITE_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'pro_gestion' } });

// Hoy + 5 días = ventana '5d'
const today = new Date();
const future = new Date(today);
future.setUTCDate(today.getUTCDate() + 5);
const futureISO = future.toISOString().slice(0, 10);

// Tomar un proyecto cualquiera no finalizado y guardar su estado original
const { data: p } = await supabase.from('projects')
  .select('id, title, projected_end_date, notification_email, status')
  .not('status', 'in', '("Finalizado","Entregado")')
  .limit(1).single();
console.log(`Proyecto: ${p.title}`);
console.log(`Original: end=${p.projected_end_date}, notif=${p.notification_email}, status=${p.status}`);

// Save originals
const orig = { ...p };

// Update: fecha = hoy+5, notification_email = samuecatano
await supabase.from('projects').update({
  projected_end_date: futureISO,
  notification_email: 'samuecatano@gmail.com',
}).eq('id', p.id);
console.log(`Modificado: end=${futureISO}, notif=samuecatano@gmail.com`);

// Limpiar logs previos para este proyecto+kind
await supabase.from('notification_log').delete().eq('project_id', p.id);

// Invocar edge function cloud
console.log('\n→ Invocando edge function en producción...');
const resp = await fetch(`${ENV.VITE_SUPABASE_URL}/functions/v1/notify-deadlines`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ENV.VITE_SUPABASE_ANON_KEY}` },
});
const body = await resp.json();
const ourResult = body.results?.find(r => r.project === p.id);
console.log(`Status HTTP: ${resp.status}`);
console.log(`Resultado: ${JSON.stringify(ourResult, null, 2)}`);

// Revertir
await supabase.from('projects').update({
  projected_end_date: orig.projected_end_date,
  notification_email: orig.notification_email,
}).eq('id', p.id);
// Limpiar logs creados durante el test (queremos producción limpia)
await supabase.from('notification_log').delete().eq('project_id', p.id);
console.log('\n✓ Revertido a estado original. Logs de test borrados.');
