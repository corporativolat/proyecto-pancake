/*
 * Supabase Edge Function: notify-deadlines
 *
 * Cron diario (mig-17) invoca esta función a las 09:00 UTC. Recorre proyectos
 * no finalizados y envía recordatorios por email cuando la fecha proyectada
 * cae en una ventana de notificación (5d / 3d / 1d antes, el día de
 * vencimiento, o post-vencido en días 1, 3, 7, 14, 30).
 *
 * Idempotencia: UNIQUE(project_id, kind) en notification_log impide reenviar
 * el mismo recordatorio.
 *
 * Envío: Gmail SMTP vía denomailer (sin dominio propio).
 *
 * Variables (configurar con `supabase secrets set`):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GMAIL_USER             ← cuenta Gmail remitente (con 2FA activado)
 *   - GMAIL_APP_PASSWORD     ← App Password de Google (16 chars)
 *
 * Deploy:
 *   supabase functions deploy notify-deadlines --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

type ReminderKind = "5d" | "3d" | "1d" | "due" | "overdue+1" | "overdue+3" | "overdue+7" | "overdue+14" | "overdue+30";

const DIFF_TO_KIND: Record<number, ReminderKind> = {
  5: "5d", 3: "3d", 1: "1d", 0: "due",
  [-1]: "overdue+1", [-3]: "overdue+3", [-7]: "overdue+7", [-14]: "overdue+14", [-30]: "overdue+30",
};

const FINAL_STATUSES = new Set(["Finalizado", "Entregado"]);

function diffDays(yyyyMmDd: string, today: Date): number {
  const due = new Date(yyyyMmDd + "T00:00:00Z");
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((due.getTime() - t.getTime()) / 86400000);
}

function buildSubject(kind: ReminderKind, title: string): string {
  if (kind === "due") return `Hoy vence: ${title}`;
  if (kind.startsWith("overdue+")) return `Vencido hace ${kind.replace("overdue+", "")} día(s): ${title}`;
  return `Faltan ${kind.replace("d", "")} día(s) para entregar: ${title}`;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildHtml(kind: ReminderKind, p: any, dueDate: string): string {
  const isOverdue = kind === "due" || kind.startsWith("overdue+");
  const color = isOverdue ? "#dc2626" : "#7c3aed";
  const headline = kind === "due" ? "El proyecto vence hoy"
    : kind.startsWith("overdue+") ? `Vencido hace ${kind.replace("overdue+", "")} día(s)`
    : `Faltan ${kind.replace("d", "")} día(s) para entregar`;
  return `<!doctype html>
<html><body style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#fafafa;margin:0;padding:24px;color:#18181b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:18px;overflow:hidden">
<tr><td style="background:${color};color:#fff;padding:18px 24px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:11px">Pro-Gestión · I+D</td></tr>
<tr><td style="padding:28px 24px">
<p style="font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:${color};margin:0 0 8px">${headline}</p>
<h1 style="font-size:24px;font-weight:900;margin:0 0 8px;color:#18181b">${esc(p.title)}</h1>
<p style="color:#52525b;margin:0 0 18px;font-size:14px">${esc(p.company || "Sin empresa")}</p>
<table cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 18px;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Fecha proyectada</td><td style="padding:6px 0;text-align:right;font-weight:800;color:#18181b">${dueDate}</td></tr>
<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Estado</td><td style="padding:6px 0;text-align:right;color:#18181b">${esc(p.status || "—")}</td></tr>
${p.client_lead ? `<tr><td style="padding:6px 0;color:#71717a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em">Dependencia</td><td style="padding:6px 0;text-align:right;color:#18181b">${esc(p.client_lead)}</td></tr>` : ""}
</table>
${p.goal ? `<p style="font-size:13px;color:#3f3f46;background:#f4f4f5;border-left:3px solid ${color};padding:10px 14px;border-radius:6px;margin:0 0 18px">${esc(p.goal)}</p>` : ""}
<p style="margin:0;font-size:12px;color:#71717a">Recordatorio automático. Pro-Gestión I+D.</p>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    return new Response(JSON.stringify({
      error: (e as Error).message,
      stack: (e as Error).stack?.split("\n").slice(0, 5),
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

async function handle(_req: Request): Promise<Response> {
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "");
  if (!gmailUser || !gmailPass) {
    return new Response(JSON.stringify({ error: "GMAIL_USER o GMAIL_APP_PASSWORD no configurados" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
    { db: { schema: "pro_gestion" } as any }
  );

  const today = new Date();

  const { data: projects, error: errProj } = await supabase
    .from("projects")
    .select("id, title, company, status, goal, client_lead, projected_end_date, notification_email, owner_id");

  if (errProj) {
    return new Response(JSON.stringify({ error: errProj.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const ownerIds = Array.from(new Set((projects || []).map((p) => p.owner_id).filter(Boolean)));
  const ownerInfo: Record<string, { email: string; enabled: boolean }> = {};
  if (ownerIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email, notif_email_enabled")
      .in("id", ownerIds as string[]);
    for (const r of profs || []) {
      ownerInfo[r.id] = { email: r.email, enabled: r.notif_email_enabled !== false };
    }
  }

  // SMTP client Gmail (TLS 465)
  const smtp = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailPass },
    },
  });

  const results: any[] = [];
  for (const p of projects || []) {
    if (!p.projected_end_date) { continue; }
    if (FINAL_STATUSES.has(p.status)) { continue; }

    const d = diffDays(p.projected_end_date, today);
    const kind = DIFF_TO_KIND[d];
    if (!kind) continue;

    let recipient = "";
    const override = p.notification_email && p.notification_email.trim();
    if (override) {
      recipient = override;
    } else if (p.owner_id && ownerInfo[p.owner_id]) {
      const info = ownerInfo[p.owner_id];
      if (!info.enabled) {
        results.push({ project: p.id, kind, skipped: "owner opted out" });
        continue;
      }
      if (info.email) recipient = info.email;
    }
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      results.push({ project: p.id, kind, skipped: "no recipient" });
      continue;
    }

    const { count } = await supabase
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("project_id", p.id)
      .eq("kind", kind);
    if ((count || 0) > 0) {
      results.push({ project: p.id, kind, skipped: "already sent" });
      continue;
    }

    const subject = buildSubject(kind, p.title);
    const html = buildHtml(kind, p, p.projected_end_date);

    try {
      await smtp.send({
        from: `Pro-Gestión I+D · Avisos <${gmailUser}>`,
        to: recipient,
        subject,
        html,
        content: "text/html",
      });
      await supabase.from("notification_log").insert({
        project_id: p.id, kind, recipient, error: null,
      });
      results.push({ project: p.id, kind, recipient, ok: true });
    } catch (e) {
      const errMsg = (e as Error).message;
      await supabase.from("notification_log").insert({
        project_id: p.id, kind, recipient, error: errMsg,
      });
      results.push({ project: p.id, kind, recipient, ok: false, error: errMsg });
    }
  }

  // denomailer 1.6.0 falla si nunca se envió (conexión lazy). Silencia.
  try { await smtp.close(); } catch { /* ignore */ }

  return new Response(JSON.stringify({ ran_at: today.toISOString(), results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
