#!/usr/bin/env node
/*
 * Dry-run de la edge function notify-deadlines.
 * Lee Supabase, calcula qué emails se ENVIARÍAN hoy, NO envía nada,
 * NO inserta en notification_log.
 *
 * Uso:
 *   node scripts/dry-run-notifications.mjs                    (usa anon → solo ve público)
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/dry-run-notifications.mjs   (ve todo)
 *
 * Lee .env del repo para VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---- mini .env loader (evita dependencia) ----
function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = { ...loadEnv(), ...process.env };

const URL = ENV.VITE_SUPABASE_URL || ENV.SUPABASE_URL;
const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY;
const ANON = ENV.VITE_SUPABASE_ANON_KEY || ENV.SUPABASE_ANON_KEY;
const KEY = SERVICE || ANON;

if (!URL || !KEY) {
  console.error('FALTA URL o KEY. Revisa .env o exporta SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const usingService = !!SERVICE;
console.log(`\n→ Conectando a ${URL}`);
console.log(`→ Modo: ${usingService ? 'SERVICE_ROLE (ve todo, bypassa RLS)' : 'ANON (solo proyectos públicos)'}\n`);

const supabase = createClient(URL, KEY, { db: { schema: 'pro_gestion' } });

// ---- misma lógica que edge function (copiada para test offline) ----
const FINAL_STATUSES = new Set(['Finalizado', 'Entregado']);
const DIFF_TO_KIND = {
  5: '5d', 3: '3d', 1: '1d', 0: 'due',
  [-1]: 'overdue+1', [-3]: 'overdue+3', [-7]: 'overdue+7', [-14]: 'overdue+14', [-30]: 'overdue+30',
};
function diffDays(yyyyMmDd, today) {
  const due = new Date(yyyyMmDd + 'T00:00:00Z');
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((due.getTime() - todayUTC.getTime()) / 86400000);
}
function buildSubject(kind, title) {
  if (kind === 'due') return `Hoy vence: ${title}`;
  if (kind.startsWith('overdue+')) return `Vencido hace ${kind.replace('overdue+', '')} día(s): ${title}`;
  return `Faltan ${kind.replace('d', '')} día(s) para entregar: ${title}`;
}

// ---- ejecutar dry-run ----
async function main() {
  // Permite override de "hoy" para simular fechas: --today=YYYY-MM-DD
  const arg = process.argv.find(a => a.startsWith('--today='));
  const today = arg ? new Date(arg.split('=')[1] + 'T12:00:00Z') : new Date();
  console.log(`Fecha de referencia: ${today.toISOString().slice(0, 10)}${arg ? ' (simulada)' : ''}\n`);

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, title, status, projected_end_date, notification_email, owner_id');

  if (error) {
    console.error('ERROR leyendo projects:', error.message);
    process.exit(1);
  }

  if (!projects?.length) {
    console.log('Sin proyectos visibles (¿anon sin acceso? Usa SUPABASE_SERVICE_ROLE_KEY).');
    return;
  }

  // owner → email + notif_email_enabled
  const ownerIds = [...new Set(projects.map(p => p.owner_id).filter(Boolean))];
  const ownerInfo = {};
  if (ownerIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, email, notif_email_enabled')
      .in('id', ownerIds);
    for (const r of profs || []) {
      ownerInfo[r.id] = { email: r.email, enabled: r.notif_email_enabled !== false };
    }
  }

  // notification_log existente (para mostrar "ya enviado")
  let alreadySent = new Set();
  try {
    const { data: logs } = await supabase
      .from('notification_log')
      .select('project_id, kind');
    for (const l of logs || []) alreadySent.add(`${l.project_id}|${l.kind}`);
  } catch {
    // tabla no existe aún (mig-17 no aplicada) → seguimos
  }

  const out = { send: [], skip: [] };

  for (const p of projects) {
    if (FINAL_STATUSES.has(p.status)) { out.skip.push({ p, why: 'status final' }); continue; }
    if (!p.projected_end_date) { out.skip.push({ p, why: 'sin projected_end_date' }); continue; }
    const diff = diffDays(p.projected_end_date, today);
    const kind = DIFF_TO_KIND[diff];
    if (!kind) { out.skip.push({ p, why: `diff=${diff} no dispara recordatorio` }); continue; }
    if (alreadySent.has(`${p.id}|${kind}`)) { out.skip.push({ p, why: `ya enviado (${kind})` }); continue; }

    const override = (p.notification_email || '').trim();
    let recipient = '', skipReason = null;
    if (override) {
      recipient = override;
    } else if (p.owner_id && ownerInfo[p.owner_id]) {
      const info = ownerInfo[p.owner_id];
      if (!info.enabled) { skipReason = 'owner opted out'; }
      else if (info.email) { recipient = info.email; }
      else { skipReason = 'owner sin email'; }
    } else {
      skipReason = 'sin owner ni override';
    }
    if (skipReason) { out.skip.push({ p, why: skipReason, kind }); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) { out.skip.push({ p, why: `email inválido: ${recipient}`, kind }); continue; }

    out.send.push({ p, kind, recipient, subject: buildSubject(kind, p.title), diff });
  }

  // ---- reporte ----
  console.log('═'.repeat(72));
  console.log(`EMAILS QUE SE ENVIARÍAN HOY: ${out.send.length}`);
  console.log('═'.repeat(72));
  if (out.send.length === 0) {
    console.log('(ninguno)\n');
  } else {
    for (const s of out.send) {
      console.log(`  [${s.kind.padEnd(11)}] ${s.recipient}`);
      console.log(`              ${s.subject}`);
      console.log(`              diff=${s.diff}d, projected_end=${s.p.projected_end_date}\n`);
    }
  }

  console.log('─'.repeat(72));
  console.log(`SKIP: ${out.skip.length}`);
  console.log('─'.repeat(72));
  // Agrupar skips por razón
  const byReason = {};
  for (const s of out.skip) {
    const k = s.why;
    byReason[k] = (byReason[k] || 0) + 1;
  }
  for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${reason}`);
  }
  console.log('');

  console.log(`TOTAL proyectos leídos: ${projects.length}`);
  console.log('\nNada se envió. Nada se grabó en notification_log.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
