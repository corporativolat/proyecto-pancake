/*
 * Supabase Edge Function: process-notifications
 *
 * Cron cada 5 min (mig-32) recoge filas de `pro_gestion.notifications` y
 * manda al destinatario por su canal preferido (profiles.notif_channel):
 *   - 'email'     → Gmail SMTP, marca email_sent_at.
 *   - 'whatsapp'  → Twilio API, marca wa_sent_at. Si Twilio no está
 *                   configurado, cae a email.
 *   - 'both'      → ambos canales (cada uno independiente).
 *   - 'none'      → solo marca como procesada (no envía nada).
 *
 * Idempotencia: filtros `email_sent_at is null` / `wa_sent_at is null`
 * garantizan que cada canal se intenta una sola vez por notif. Si el envío
 * falla, NO marcamos el timestamp → reintenta en el próximo tick.
 *
 * Variables (configurar con `supabase secrets set`):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GMAIL_USER             (email cartero)
 *   - GMAIL_APP_PASSWORD     (16-char app password de Google)
 *   - PORTAL_BASE_URL        (opcional, default https://app.pancake.lat)
 *   - TWILIO_ACCOUNT_SID     (opcional; sin esto, WA cae a email)
 *   - TWILIO_AUTH_TOKEN
 *   - TWILIO_WHATSAPP_FROM   ej. "whatsapp:+14155238886" (sandbox)
 *                                 o tu número Twilio aprobado en producción.
 *
 * Deploy:
 *   supabase functions deploy process-notifications --no-verify-jwt
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Cuántas notifs procesa en cada tick. Evita timeouts si hay backlog.
const BATCH_SIZE = 50;
// Solo procesa notifs creadas en las últimas 24h para evitar reenvíos de
// historial viejo si alguien agrega columnas a posteriori.
const MAX_AGE_HOURS = 24;

// Normaliza a dígitos para wa.me / Twilio (E.164 sin +). Móvil CO de
// 10 dígitos empezando en 3 → prepende 57. Si no, deja como llegó.
function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("3")) return "57" + digits;
  return digits;
}

// Plantillas de texto plano para WhatsApp (no HTML).
const WA_BY_KIND: Record<string, (n: any) => string> = {
  project_status:           (n) => `Hola, te escribo del equipo Pancake. Hubo un cambio en el proyecto «${n.title}». Revisa el portal cuando puedas.`,
  doc_uploaded:             (n) => `Hola, subimos un documento al proyecto «${n.title}». ¿Lo revisas cuando puedas?`,
  doc_reviewed:             (n) => `Hola, ya revisamos un documento del proyecto «${n.title}». Te dejé el detalle en el portal.`,
  comment:                  (n) => `Hola, dejé un comentario en el proyecto «${n.title}». ¿Lo miras cuando tengas un momento?`,
  milestone:                (n) => `Hola, marcamos un hito en el proyecto «${n.title}». ¡Vamos avanzando!`,
  questionnaire_assigned:   (n) => `Hola, te envié un cuestionario para el proyecto «${n.title}». Por favor complétalo cuando puedas.`,
  questionnaire_reviewed:   (n) => `Hola, ya revisé tu cuestionario del proyecto «${n.title}». El resultado está en el portal.`,
  client_task_assigned:     (n) => `Hola, te asigné una tarea nueva en el proyecto «${n.title}». Revisa el portal.`,
  client_task_due_soon:     (n) => `Recordatorio: tienes una tarea próxima a vencer en el proyecto «${n.title}». ¿Cómo vas?`,
  client_task_overdue:      (n) => `Hola, tienes una tarea vencida en el proyecto «${n.title}». ¿Necesitas ayuda?`,
  client_task_reviewed:     (n) => `Hola, ya revisé tu entrega del proyecto «${n.title}». Te dejé feedback en el portal.`,
};

function buildWaText(n: any): string {
  const tpl = WA_BY_KIND[n.kind];
  if (tpl) return tpl(n);
  return `Pancake · ${n.title}${n.body ? `\n\n${n.body}` : ""}`;
}

// Plantilla de subject por kind. Si no está, usa notif.title tal cual.
const SUBJECT_BY_KIND: Record<string, (n: any) => string> = {
  project_status:           (n) => `Cambio de estado · ${n.title}`,
  doc_uploaded:             (n) => `Nuevo documento · ${n.title}`,
  doc_reviewed:             (n) => `Documento revisado · ${n.title}`,
  comment:                  (n) => `Nuevo comentario · ${n.title}`,
  milestone:                (n) => `Hito alcanzado · ${n.title}`,
  team_invitation:          (n) => `Invitación a equipo · ${n.title}`,
  questionnaire_assigned:   (n) => `Cuestionario asignado · ${n.title}`,
  questionnaire_submitted:  (n) => `Cuestionario enviado · ${n.title}`,
  questionnaire_reviewed:   (n) => `Cuestionario revisado · ${n.title}`,
  client_task_assigned:     (n) => `Nueva tarea · ${n.title}`,
  client_task_delivered:    (n) => `Tarea entregada · ${n.title}`,
  client_task_reviewed:     (n) => `Tarea revisada · ${n.title}`,
  client_task_due_soon:     (n) => `Tarea próxima a vencer · ${n.title}`,
  client_task_overdue:      (n) => `Tarea vencida · ${n.title}`,
  client_task_overdue_staff:(n) => `Tarea vencida (staff) · ${n.title}`,
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function buildHtml(n: any, recipientName: string | null, portalUrl: string): string {
  const link = n.link ? `${portalUrl.replace(/\/$/, "")}${n.link}` : portalUrl;
  const hello = recipientName ? `Hola ${esc(recipientName.split(" ")[0])},` : "Hola,";
  return `<!doctype html>
<html><body style="font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#fafafa;margin:0;padding:24px;color:#18181b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:18px;overflow:hidden">
<tr><td style="background:#7c3aed;color:#fff;padding:18px 24px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:11px">Pro-Gestión · Pancake</td></tr>
<tr><td style="padding:28px 24px">
<p style="margin:0 0 14px;font-size:14px;color:#52525b">${hello}</p>
<h1 style="font-size:22px;font-weight:900;margin:0 0 8px;color:#18181b">${esc(n.title)}</h1>
${n.body ? `<p style="font-size:14px;color:#3f3f46;margin:0 0 18px;line-height:1.5">${esc(n.body)}</p>` : ""}
<p style="margin:18px 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:800;padding:10px 18px;border-radius:10px;font-size:13px">Abrir en la app</a></p>
<p style="margin:24px 0 0;font-size:11px;color:#a1a1aa">Recibes este email porque tu canal de notificaciones está en "email". Cámbialo en tu perfil de la app.</p>
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

async function sendTwilioWhatsApp(toPhone: string, body: string, sid: string, token: string, from: string): Promise<{ ok: boolean; error?: string }> {
  const digits = normalizePhone(toPhone);
  if (!digits) return { ok: false, error: "invalid phone" };
  const formData = new URLSearchParams({
    From: from,
    To: `whatsapp:+${digits}`,
    Body: body,
  });
  const auth = btoa(`${sid}:${token}`);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `twilio ${res.status}: ${errText.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function handle(_req: Request): Promise<Response> {
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "");
  if (!gmailUser || !gmailPass) {
    return new Response(JSON.stringify({ error: "GMAIL_USER o GMAIL_APP_PASSWORD no configurados" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  const portalUrl = Deno.env.get("PORTAL_BASE_URL") || "https://app.pancake.lat";

  // Twilio opcional — si no está configurado, los notifs de canal whatsapp
  // caen a email (comportamiento previo).
  const twilioSid   = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const twilioFrom  = Deno.env.get("TWILIO_WHATSAPP_FROM");
  const twilioReady = !!(twilioSid && twilioToken && twilioFrom);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "pro_gestion" } as any }
  );

  const sinceIso = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString();

  const { data: pending, error: errPending } = await supabase
    .from("notifications")
    .select("id, profile_id, kind, title, body, link, project_id, created_at, email_sent_at, wa_sent_at")
    .or("email_sent_at.is.null,wa_sent_at.is.null")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (errPending) {
    return new Response(JSON.stringify({ error: errPending.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
  if (!pending || pending.length === 0) {
    return new Response(JSON.stringify({ ran_at: new Date().toISOString(), processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolver destinatarios en bulk para no hacer 50 round-trips.
  const profileIds = Array.from(new Set(pending.map(n => n.profile_id).filter(Boolean)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, email, contact_email, whatsapp, phone, notif_channel")
    .in("id", profileIds);
  const profByid: Record<string, any> = {};
  for (const p of profiles || []) profByid[p.id] = p;

  const smtp = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailPass },
    },
  });

  const results: any[] = [];
  const now = () => new Date().toISOString();

  for (const n of pending) {
    const prof = profByid[n.profile_id];
    const channel = prof?.notif_channel || "email";
    const email = prof?.contact_email || prof?.email || "";
    const wa    = prof?.whatsapp || prof?.phone || "";

    // 'none' → marca todo procesado y sigue.
    if (channel === "none") {
      await supabase.from("notifications")
        .update({ email_sent_at: now(), wa_sent_at: now(), send_error: null })
        .eq("id", n.id);
      results.push({ id: n.id, skipped: "channel=none" });
      continue;
    }

    // Qué canales debemos intentar para esta notif. Si el usuario eligió
    // 'whatsapp' pero Twilio no está configurado, caemos a email (no
    // dejamos al usuario sin notificación).
    const wantEmail = channel === "email" || channel === "both" || (channel === "whatsapp" && !twilioReady);
    const wantWa    = (channel === "whatsapp" || channel === "both") && twilioReady;

    const patch: any = {};
    const errs: string[] = [];

    // --- EMAIL ---
    if (wantEmail && !n.email_sent_at) {
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const subjectFn = SUBJECT_BY_KIND[n.kind];
        const subject = subjectFn ? subjectFn(n) : n.title;
        const html = buildHtml(n, prof?.name, portalUrl);
        try {
          await smtp.send({
            from: `Pro-Gestión · Pancake <${gmailUser}>`,
            to: email, subject, html, content: "text/html",
          });
          patch.email_sent_at = now();
        } catch (e) {
          errs.push(`email: ${(e as Error).message}`);
          // No marcamos → reintenta en próximo tick.
        }
      } else {
        // No hay email válido. Marcamos para no quedarnos en loop.
        patch.email_sent_at = now();
        errs.push("no recipient email");
      }
    }

    // --- WHATSAPP via TWILIO ---
    if (wantWa && !n.wa_sent_at) {
      if (wa) {
        const r = await sendTwilioWhatsApp(wa, buildWaText(n), twilioSid!, twilioToken!, twilioFrom!);
        if (r.ok) {
          patch.wa_sent_at = now();
        } else {
          errs.push(`wa: ${r.error}`);
        }
      } else {
        patch.wa_sent_at = now();
        errs.push("no whatsapp number");
      }
    }

    // Canales no deseados → marca para sacar de la cola y no re-procesar.
    if (!wantEmail && !n.email_sent_at) patch.email_sent_at = now();
    if (!wantWa    && !n.wa_sent_at)    patch.wa_sent_at    = now();

    patch.send_error = errs.length ? errs.join("; ") : null;
    await supabase.from("notifications").update(patch).eq("id", n.id);
    results.push({ id: n.id, kind: n.kind, channel, ...patch });
  }

  try { await smtp.close(); } catch { /* ignore */ }

  return new Response(JSON.stringify({
    ran_at: new Date().toISOString(),
    processed: results.length,
    results,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
}
