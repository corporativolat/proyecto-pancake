#!/usr/bin/env node
/*
 * Variante "wet" de dry-run-notifications: hace todo lo que la edge function
 * notify-deadlines haría, pero corriendo desde Node local. Envía emails
 * reales via Resend e inserta filas en notification_log.
 *
 * Flags:
 *   --today=YYYY-MM-DD          Simula la fecha (default: hoy)
 *   --override-to=email@...     Sustituye el recipient REAL por este email
 *                               (útil para probar sin spamear owners reales)
 *   --really-send               Sin este flag, opera en dry-run (no envía,
 *                               no inserta). Con el flag, dispara.
 *
 * Env requerido:
 *   VITE_SUPABASE_URL (de .env)
 *   SUPABASE_SERVICE_ROLE_KEY (process env)
 *   RESEND_API_KEY (process env)
 *   RESEND_FROM_EMAIL (process env)
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
const URL = ENV.VITE_SUPABASE_URL;
const KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
const RESEND = ENV.RESEND_API_KEY;
const FROM = ENV.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

if (!URL || !KEY) { console.error('FALTA URL o SERVICE_ROLE_KEY'); process.exit(1); }

// Args
const arg = (name) => process.argv.find(a => a.startsWith('--' + name + '='));
const TODAY_ARG = arg('today');
const OVERRIDE_TO = arg('override-to')?.split('=')[1];
const REALLY = process.argv.includes('--really-send');

const today = TODAY_ARG ? new Date(TODAY_ARG.split('=')[1] + 'T12:00:00Z') : new Date();

if (REALLY && !RESEND) {
  console.error('FALTA RESEND_API_KEY (--really-send activo).');
  process.exit(1);
}

console.log(`\n→ Supabase: ${URL}`);
console.log(`→ Fecha: ${today.toISOString().slice(0, 10)}${TODAY_ARG ? ' (simulada)' : ''}`);
console.log(`→ Modo: ${REALLY ? '🟢 ENVIANDO emails de verdad' : '🟡 DRY-RUN (sin enviar)'}`);
if (OVERRIDE_TO) console.log(`→ Override recipient: ${OVERRIDE_TO}`);
if (REALLY) console.log(`→ From: ${FROM}`);
console.log('');

const supabase = createClient(URL, KEY, { db: { schema: 'pro_gestion' } });

const FINAL_STATUSES = new Set(['Finalizado', 'Entregado']);
const DIFF_TO_KIND = {
  5: '5d', 3: '3d', 1: '1d', 0: 'due',
  [-1]: 'overdue+1', [-3]: 'overdue+3', [-7]: 'overdue+7', [-14]: 'overdue+14', [-30]: 'overdue+30',
};
function diffDays(yyyyMmDd, today) {
  const due = new Date(yyyyMmDd + 'T00:00:00Z');
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((due.getTime() - t.getTime()) / 86400000);
}
function buildSubject(kind, title) {
  if (kind === 'due') return `Hoy vence: ${title}`;
  if (kind.startsWith('overdue+')) return `Vencido hace ${kind.replace('overdue+', '')} día(s): ${title}`;
  return `Faltan ${kind.replace('d', '')} día(s) para entregar: ${title}`;
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function buildHtml(kind, p, dueDate) {
  const isOverdue = kind === 'due' || kind.startsWith('overdue+');
  const color = isOverdue ? '#dc2626' : '#7c3aed';
  const headline = kind === 'due' ? 'El proyecto vence hoy'
    : kind.startsWith('overdue+') ? `Vencido hace ${kind.replace('overdue+', '')} día(s)`
    : `Faltan ${kind.replace('d', '')} día(s) para entregar`;
  return `<!doctype html>
<html><body style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#fafafa;margin:0;padding:24px;color:#18181b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:18px;overflow:hidden">
<tr><td style="background:${color};color:#fff;padding:18px 24px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:11px">Pro-Gestion · I+D</td></tr>
<tr><td style="padding:28px 24px">
<p style="font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:${color};margin:0 0 8px">${headline}</p>
<h1 style="font-size:24px;font-weight:900;margin:0 0 8px;color:#18181b">${esc(p.title)}</h1>
<p style="color:#52525b;margin:0 0 18px;font-size:14px">${esc(p.company || 'Sin empresa')}</p>
<table cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 18px;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Fecha proyectada</td><td style="padding:6px 0;text-align:right;font-weight:800;color:#18181b">${dueDate}</td></tr>
<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Estado</td><td style="padding:6px 0;text-align:right;color:#18181b">${esc(p.status || '—')}</td></tr>
${p.client_lead ? `<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Dependencia</td><td style="padding:6px 0;text-align:right;color:#18181b">${esc(p.client_lead)}</td></tr>` : ''}
</table>
${p.goal ? `<p style="font-size:13px;color:#3f3f46;background:#f4f4f5;border-left:3px solid ${color};padding:10px 14px;border-radius:6px;margin:0 0 18px">${esc(p.goal)}</p>` : ''}
<p style="margin:0;font-size:12px;color:#71717a">Recordatorio automático. Pro-Gestión.</p>
</td></tr></table></body></html>`;
}

async function sendResend(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) {
    return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  return { ok: true, body: await res.json() };
}

async function main() {
  const { data: projects, error: e1 } = await supabase
    .from('projects')
    .select('id, title, company, status, goal, client_lead, projected_end_date, notification_email, owner_id');
  if (e1) { console.error(e1); process.exit(1); }

  const ownerIds = [...new Set((projects || []).map(p => p.owner_id).filter(Boolean))];
  const ownerInfo = {};
  if (ownerIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, email, notif_email_enabled')
      .in('id', ownerIds);
    for (const r of profs || []) ownerInfo[r.id] = { email: r.email, enabled: r.notif_email_enabled !== false };
  }

  const alreadySent = new Set();
  const { data: logs } = await supabase.from('notification_log').select('project_id, kind');
  for (const l of logs || []) alreadySent.add(`${l.project_id}|${l.kind}`);

  let sent = 0, skipped = 0, errors = 0;
  for (const p of projects || []) {
    if (FINAL_STATUSES.has(p.status)) { skipped++; continue; }
    if (!p.projected_end_date) { skipped++; continue; }
    const d = diffDays(p.projected_end_date, today);
    const kind = DIFF_TO_KIND[d];
    if (!kind) { skipped++; continue; }
    if (alreadySent.has(`${p.id}|${kind}`)) { console.log(`  ↺ ya enviado: ${p.title} [${kind}]`); skipped++; continue; }

    let recipient = (p.notification_email || '').trim();
    if (!recipient && p.owner_id && ownerInfo[p.owner_id]) {
      const info = ownerInfo[p.owner_id];
      if (!info.enabled) { console.log(`  ⊘ opt-out: ${p.title}`); skipped++; continue; }
      recipient = info.email;
    }
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      console.log(`  ⊘ sin email válido: ${p.title}`); skipped++; continue;
    }

    const finalTo = OVERRIDE_TO || recipient;
    const subject = buildSubject(kind, p.title);
    const html = buildHtml(kind, p, p.projected_end_date);

    if (!REALLY) {
      console.log(`  ✉ [DRY] ${finalTo} ← "${subject}"`);
      sent++;
      continue;
    }

    const r = await sendResend(finalTo, subject, html);
    if (r.ok) {
      console.log(`  ✓ ENVIADO ${finalTo} ← "${subject}" (Resend id: ${r.body?.id || '?'})`);
      // grabar idempotencia
      await supabase.from('notification_log').insert({
        project_id: p.id, kind, recipient: finalTo, error: null,
      });
      sent++;
    } else {
      console.log(`  ✗ FALLÓ ${finalTo}: ${r.error}`);
      await supabase.from('notification_log').insert({
        project_id: p.id, kind, recipient: finalTo, error: r.error,
      });
      errors++;
    }
  }

  console.log(`\nResumen: ${sent} enviados${REALLY ? '' : ' (dry)'}, ${skipped} skip, ${errors} errores.`);
}

main().catch(e => { console.error(e); process.exit(1); });
