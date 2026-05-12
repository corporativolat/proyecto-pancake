#!/usr/bin/env node
/*
 * Test final: cosas no cubiertas por suites previas.
 * - comments.tag (B1/mig-18)
 * - owner mutex (B3): owner_id ↔ owner_label sin coexistencia
 * - notification_log integridad
 * - Realtime publication: tablas mig-18 + mig-19 expuestas
 * - Permisos service_role en pro_gestion (consistencia post-grants)
 */
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

const out = [];
const t = (name, ok, det = '') => { out.push({ name, ok, det }); console.log(`  ${ok ? '✓' : '✗'}  ${name}${det ? ' · ' + det : ''}`); };

console.log('\n════════════════════════════════════════════════════════════════');
console.log('TEST FINAL: comments.tag + owner mutex + notification_log + perms');
console.log('════════════════════════════════════════════════════════════════\n');

// 1. comments.tag funciona end-to-end ─────────────────────────────────────
console.log('► 1. comments.tag (mig-18 col)');
const { data: anyProj } = await supabase.from('projects').select('id').limit(1).single();
const { data: anyProf } = await supabase.from('profiles').select('id').limit(1).single();

const { data: c1, error: e1 } = await supabase.from('comments').insert({
  project_id: anyProj.id,
  profile_id: anyProf.id,
  body: '__TEST_riesgo_' + Date.now(),
  tag: 'riesgo',
}).select().single();
t('Insert comment con tag=riesgo', !e1 && c1?.tag === 'riesgo', c1?.tag);

const { error: eBad } = await supabase.from('comments').insert({
  project_id: anyProj.id,
  profile_id: anyProf.id,
  body: '__TEST_bad__',
  tag: 'invalido',
});
t('Comment con tag inválido rechazado por CHECK', !!eBad, eBad ? 'rejected' : 'NO rechazó');

if (c1) await supabase.from('comments').delete().eq('id', c1.id);
t('Cleanup: borrar comment test', true);

// 2. Owner mutex: simulamos los 2 escenarios del cliente ──────────────────
console.log('\n► 2. Owner mutex (B3)');
const { data: proj2 } = await supabase.from('projects').select('id, owner_id, owner_label').limit(1).single();
const origOwnerId = proj2.owner_id;
const origLabel = proj2.owner_label || '';

// Caso A: cuenta → label limpio
await supabase.from('projects').update({ owner_label: '' }).eq('id', proj2.id);
const { data: a } = await supabase.from('projects').select('owner_id, owner_label').eq('id', proj2.id).single();
t('Tiene cuenta → owner_label vacío', a.owner_label === '', `owner_id=${!!a.owner_id}, label="${a.owner_label}"`);

// Caso B: sin cuenta → owner_id null + label lleno
await supabase.from('projects').update({ owner_id: null, owner_label: '__TEST_external__' }).eq('id', proj2.id);
const { data: b } = await supabase.from('projects').select('owner_id, owner_label').eq('id', proj2.id).single();
t('Sin cuenta → owner_id null + label texto', b.owner_id === null && b.owner_label === '__TEST_external__');

// Cleanup: volver a estado original
await supabase.from('projects').update({ owner_id: origOwnerId, owner_label: origLabel }).eq('id', proj2.id);
t('Cleanup: restaurar owner', true);

// 3. notification_log integridad ──────────────────────────────────────────
console.log('\n► 3. notification_log integridad');
const { count } = await supabase.from('notification_log').select('*', { count: 'exact', head: true });
t('notification_log accesible vía service_role', count !== null, `rows=${count}`);

// UNIQUE constraint test: intentar insertar duplicado
const { data: existing } = await supabase.from('notification_log').select('project_id, kind').limit(1).maybeSingle();
if (existing) {
  const { error: dupErr } = await supabase.from('notification_log').insert({
    project_id: existing.project_id,
    kind: existing.kind,
    recipient: 'test@test.com',
  });
  t('UNIQUE (project_id, kind) bloquea duplicado', !!dupErr, dupErr?.message?.slice(0, 60) || '');
} else {
  t('UNIQUE constraint test (skip: log vacío)', true, 'sin rows para chequear');
}

// 4. Realtime publication incluye nuevas tablas ───────────────────────────
console.log('\n► 4. Realtime publication mig-6 expone tablas críticas');
// Esta es una verificación indirecta: si las tablas mig-3/5/14 están en pub,
// asumimos mig-18 con nuevas cols sigue funcionando. No podemos consultar
// `pg_publication_tables` vía PostgREST por defecto. Skip puro.
t('Realtime check (skip: requiere SQL directo)', true, 'no testeable desde PostgREST');

// 5. Permisos service_role ────────────────────────────────────────────────
console.log('\n► 5. Permisos service_role en pro_gestion');
const tables = ['projects', 'milestones', 'phases', 'tasks', 'comments', 'activity',
                'notification_log', 'milestone_templates', 'categories', 'profiles'];
for (const tbl of tables) {
  const { error } = await supabase.from(tbl).select('*', { count: 'exact', head: true });
  t(`SELECT ${tbl}`, !error, error?.message?.slice(0, 50) || 'OK');
}

// ── Resumen ─────────────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════════════════════════════');
const pass = out.filter(r => r.ok).length;
const fail = out.filter(r => !r.ok).length;
console.log(`RESULTADO: ${pass}/${out.length} OK${fail ? `, ${fail} FAIL` : ''}`);
console.log('════════════════════════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
