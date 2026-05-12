#!/usr/bin/env node
/*
 * Variante Gmail SMTP de send-notifications.
 * No requiere dominio verificado. Usa cuenta Gmail + App Password.
 *
 * Env requerido:
 *   VITE_SUPABASE_URL (.env)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GMAIL_USER             (ej: crotipato@gmail.com)
 *   GMAIL_APP_PASSWORD     (16 chars sin espacios)
 *
 * Flags:
 *   --today=YYYY-MM-DD
 *   --override-to=email@...
 *   --really-send
 */
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
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
const GMAIL_USER = ENV.GMAIL_USER;
const GMAIL_PASS = ENV.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');

if (!URL || !KEY) { console.error('FALTA URL o SERVICE_ROLE_KEY'); process.exit(1); }

const arg = (n) => process.argv.find(a => a.startsWith('--' + n + '='));
const TODAY_ARG = arg('today');
const OVERRIDE_TO = arg('override-to')?.split('=')[1];
const REALLY = process.argv.includes('--really-send');
const today = TODAY_ARG ? new Date(TODAY_ARG.split('=')[1] + 'T12:00:00Z') : new Date();

if (REALLY && (!GMAIL_USER || !GMAIL_PASS)) {
  console.error('FALTA GMAIL_USER o GMAIL_APP_PASSWORD');
  process.exit(1);
}

console.log(`\n→ Supabase: ${URL}`);
console.log(`→ Fecha: ${today.toISOString().slice(0, 10)}${TODAY_ARG ? ' (simulada)' : ''}`);
console.log(`→ Modo: ${REALLY ? '🟢 ENVIANDO via Gmail SMTP' : '🟡 DRY-RUN'}`);
if (OVERRIDE_TO) console.log(`→ Override recipient: ${OVERRIDE_TO}`);
if (REALLY) console.log(`→ From: ${GMAIL_USER}`);
console.log('');

const supabase = createClient(URL, KEY, { db: { schema: 'pro_gestion' } });

const FINAL_STATUSES = new Set(['Finalizado', 'Entregado']);
const DIFF_TO_KIND = { 5:'5d',3:'3d',1:'1d',0:'due',[-1]:'overdue+1',[-3]:'overdue+3',[-7]:'overdue+7',[-14]:'overdue+14',[-30]:'overdue+30' };
function diffDays(s, t) {
  const d = new Date(s + 'T00:00:00Z');
  const u = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  return Math.round((d - u) / 86400000);
}
function subj(k, t) {
  if (k === 'due') return `Hoy vence: ${t}`;
  if (k.startsWith('overdue+')) return `Vencido hace ${k.replace('overdue+', '')} día(s): ${t}`;
  return `Faltan ${k.replace('d', '')} día(s) para entregar: ${t}`;
}
function esc(s) { return !s ? '' : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function html(k, p, due) {
  const over = k === 'due' || k.startsWith('overdue+');
  const color = over ? '#dc2626' : '#7c3aed';
  const headline = k === 'due' ? 'El proyecto vence hoy'
    : k.startsWith('overdue+') ? `Vencido hace ${k.replace('overdue+', '')} día(s)`
    : `Faltan ${k.replace('d', '')} día(s) para entregar`;
  return `<!doctype html><html><body style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#fafafa;margin:0;padding:24px;color:#18181b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:18px;overflow:hidden">
<tr><td style="background:${color};color:#fff;padding:18px 24px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:11px">Pro-Gestión · I+D</td></tr>
<tr><td style="padding:28px 24px">
<p style="font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:${color};margin:0 0 8px">${headline}</p>
<h1 style="font-size:24px;font-weight:900;margin:0 0 8px;color:#18181b">${esc(p.title)}</h1>
<p style="color:#52525b;margin:0 0 18px;font-size:14px">${esc(p.company || 'Sin empresa')}</p>
<table cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 18px;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Fecha proyectada</td><td style="padding:6px 0;text-align:right;font-weight:800;color:#18181b">${due}</td></tr>
<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Estado</td><td style="padding:6px 0;text-align:right;color:#18181b">${esc(p.status || '—')}</td></tr>
${p.client_lead ? `<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Dependencia</td><td style="padding:6px 0;text-align:right;color:#18181b">${esc(p.client_lead)}</td></tr>` : ''}
</table>
${p.goal ? `<p style="font-size:13px;color:#3f3f46;background:#f4f4f5;border-left:3px solid ${color};padding:10px 14px;border-radius:6px;margin:0 0 18px">${esc(p.goal)}</p>` : ''}
<p style="margin:0;font-size:12px;color:#71717a">Recordatorio automático. Pro-Gestión.</p>
</td></tr></table></body></html>`;
}

let transporter = null;
if (REALLY) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
}

async function main() {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, company, status, goal, client_lead, projected_end_date, notification_email, owner_id');

  const ownerIds = [...new Set((projects || []).map(p => p.owner_id).filter(Boolean))];
  const ownerInfo = {};
  if (ownerIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, email, notif_email_enabled').in('id', ownerIds);
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
      console.log(`  ⊘ sin email: ${p.title}`); skipped++; continue;
    }

    const finalTo = OVERRIDE_TO || recipient;
    const subject = subj(kind, p.title);
    const body = html(kind, p, p.projected_end_date);

    if (!REALLY) {
      console.log(`  ✉ [DRY] ${finalTo} ← "${subject}"`);
      sent++;
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from: `"Pro-Gestión I+D · Avisos" <${GMAIL_USER}>`,
        to: finalTo,
        subject,
        html: body,
      });
      console.log(`  ✓ ENVIADO ${finalTo} ← "${subject}" (msgid: ${info.messageId})`);
      await supabase.from('notification_log').insert({ project_id: p.id, kind, recipient: finalTo, error: null });
      sent++;
    } catch (e) {
      console.log(`  ✗ FALLÓ ${finalTo}: ${e.message}`);
      await supabase.from('notification_log').insert({ project_id: p.id, kind, recipient: finalTo, error: e.message });
      errors++;
    }
  }

  if (transporter) transporter.close();
  console.log(`\nResumen: ${sent} enviados${REALLY ? '' : ' (dry)'}, ${skipped} skip, ${errors} errores.`);
}

main().catch(e => { console.error(e); process.exit(1); });
