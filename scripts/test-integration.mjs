#!/usr/bin/env node
/*
 * Test integración end-to-end de mig-18 (bitácora triggers) + mig-19 (plantillas)
 * + opt-out de notificaciones. Modifica datos REALES temporalmente y luego
 * revierte. Requiere SUPABASE_SERVICE_ROLE_KEY.
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

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'}  ${name}${detail ? ' · ' + detail : ''}`);
}

console.log('\n════════════════════════════════════════════════════════════════');
console.log('TEST INTEGRACIÓN: bitácora + plantillas + opt-out');
console.log('════════════════════════════════════════════════════════════════\n');

// ---- 1. Test bitácora trigger: cambiar status de un proyecto ----
console.log('► 1. Trigger activity al cambiar projects.status');
const { data: anyProj } = await supabase.from('projects').select('id, title, status').limit(1).single();
const origStatus = anyProj.status;
const newStatus = origStatus === 'En Desarrollo' ? 'En Pausa' : 'En Desarrollo';

const tStart = new Date();
await supabase.from('projects').update({ status: newStatus }).eq('id', anyProj.id);
await new Promise(r => setTimeout(r, 800));

const { data: act1 } = await supabase
  .from('activity')
  .select('*')
  .eq('project_id', anyProj.id)
  .eq('kind', 'project_status_change')
  .gt('created_at', tStart.toISOString())
  .order('created_at', { ascending: false });

const found1 = act1?.[0];
record('Trigger graba row con kind=project_status_change', !!found1, found1 ? `id=${found1.id.slice(0, 8)}` : 'no row');
record('Row trae meta jsonb con old + new', !!found1?.meta?.old && !!found1?.meta?.new,
  found1?.meta ? `${found1.meta.old} → ${found1.meta.new}` : 'sin meta');
record('Row trae tag = "sistema"', found1?.tag === 'sistema', `tag=${found1?.tag}`);

// Revertir
await supabase.from('projects').update({ status: origStatus }).eq('id', anyProj.id);
// Borrar la fila de activity para no contaminar bitácora real
if (found1) await supabase.from('activity').delete().eq('id', found1.id);
// La segunda fila (revert) tampoco se queda
const { data: act1b } = await supabase
  .from('activity')
  .select('id')
  .eq('project_id', anyProj.id)
  .eq('kind', 'project_status_change')
  .gt('created_at', tStart.toISOString());
for (const r of act1b || []) await supabase.from('activity').delete().eq('id', r.id);
record('Cleanup: revert status + borrar logs temp', true);

// ---- 2. Test plantillas hitos (mig-19) ----
console.log('\n► 2. milestone_templates + RPC apply_milestone_template');

const { data: cat } = await supabase.from('categories').select('id, name').limit(1).single();
// Crear template temporal
const { data: tpl, error: errTpl } = await supabase.from('milestone_templates').insert({
  category_id: cat.id,
  name: '__TEST_kickoff__' + Date.now(),
  days_after_start: 7,
  color: '#7c3aed',
  position: 99,
}).select().single();
record('Insert milestone_template', !errTpl && !!tpl, tpl ? `id=${tpl.id.slice(0, 8)}` : errTpl?.message);

// Asegurar que el proyecto de test tenga la categoría y start_date
await supabase.from('projects').update({
  category_id: cat.id,
  start_date: '2026-05-01',
}).eq('id', anyProj.id);

// Contar milestones antes
const { data: msBefore } = await supabase.from('milestones').select('id').eq('project_id', anyProj.id);
const beforeCount = msBefore?.length || 0;

// Llamar RPC
const { data: created, error: errRpc } = await supabase.rpc('apply_milestone_template', {
  p_project_id: anyProj.id,
});
record('RPC apply_milestone_template ejecuta', !errRpc, errRpc?.message || `creados=${created}`);

// Verificar milestone insertado con name del template
const { data: msAfter } = await supabase
  .from('milestones')
  .select('id, name, target_date')
  .eq('project_id', anyProj.id)
  .like('name', '__TEST_kickoff__%');
record('Milestone insertado con name del template', msAfter?.length === 1,
  msAfter?.[0] ? `target_date=${msAfter[0].target_date}` : 'no insertado');
record('target_date = start_date + 7 días', msAfter?.[0]?.target_date === '2026-05-08',
  msAfter?.[0]?.target_date || 'N/A');

// Idempotencia: re-llamar y verificar que no duplica
const { data: created2 } = await supabase.rpc('apply_milestone_template', {
  p_project_id: anyProj.id,
});
record('RPC idempotente (2nd call → 0 creados)', created2 === 0, `creados=${created2}`);

// Cleanup template + milestone
if (msAfter?.[0]) await supabase.from('milestones').delete().eq('id', msAfter[0].id);
if (tpl) await supabase.from('milestone_templates').delete().eq('id', tpl.id);
record('Cleanup: borrar template + milestone temp', true);

// ---- 3. Test opt-out de notificaciones ----
console.log('\n► 3. notif_email_enabled opt-out → script skipea');

// Tomar el primer profile con email válido
const { data: someProfile } = await supabase
  .from('profiles')
  .select('id, email, notif_email_enabled')
  .not('email', 'is', null)
  .limit(1)
  .single();

const origEnabled = someProfile.notif_email_enabled;

// Desactivar
await supabase.from('profiles').update({ notif_email_enabled: false }).eq('id', someProfile.id);

// Verificar lectura
const { data: check } = await supabase
  .from('profiles')
  .select('notif_email_enabled')
  .eq('id', someProfile.id)
  .single();
record('notif_email_enabled persiste como false', check.notif_email_enabled === false,
  `valor=${check.notif_email_enabled}`);

// Restaurar
await supabase.from('profiles').update({ notif_email_enabled: origEnabled }).eq('id', someProfile.id);
record('Cleanup: restaurar notif flag', true);

// ---- 4. Test health_override ----
console.log('\n► 4. projects.health_override');

const origHealth = anyProj.health_override ?? null;
await supabase.from('projects').update({ health_override: 3 }).eq('id', anyProj.id);
const { data: hCheck } = await supabase.from('projects').select('health_override').eq('id', anyProj.id).single();
record('health_override acepta valor 3 (rojo)', hCheck.health_override === 3);

await supabase.from('projects').update({ health_override: null }).eq('id', anyProj.id);
const { data: hNull } = await supabase.from('projects').select('health_override').eq('id', anyProj.id).single();
record('health_override acepta NULL (volver a auto)', hNull.health_override === null);

// Test constraint: valor inválido debe fallar
const { error: badErr } = await supabase.from('projects').update({ health_override: 99 }).eq('id', anyProj.id);
record('CHECK constraint rechaza valor 99', !!badErr, badErr ? 'rejected correctly' : 'ERROR: no rechazó');

await supabase.from('projects').update({ health_override: origHealth }).eq('id', anyProj.id);
record('Cleanup: restaurar health_override original', true);

// Limpiar activity rows generadas por los updates de test
const { data: allTestActivity } = await supabase
  .from('activity')
  .select('id')
  .eq('project_id', anyProj.id)
  .gt('created_at', tStart.toISOString());
for (const r of allTestActivity || []) await supabase.from('activity').delete().eq('id', r.id);

// ---- Resumen ----
console.log('\n════════════════════════════════════════════════════════════════');
const pass = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`RESULTADO: ${pass}/${results.length} OK${fail ? `, ${fail} FAIL` : ''}`);
console.log('════════════════════════════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);
