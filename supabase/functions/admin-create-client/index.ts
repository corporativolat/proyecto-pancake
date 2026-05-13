/*
 * Edge Function: admin-create-client
 *
 * Crea una cuenta de cliente. Solo admin/super_admin pueden invocarla.
 *
 * Flujo:
 *  1. Valida el Bearer token del caller -> debe pertenecer a un staff con
 *     `manageClients`.
 *  2. Crea el usuario en auth.users con `supabase.auth.admin.createUser`
 *     (email + password temporal).
 *  3. El trigger `pro_gestion.handle_new_user` inserta la fila de profile.
 *  4. Actualiza el profile recién creado: role='cliente', name, phone, company.
 *
 * Variables (configurar con `supabase secrets set`):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy:
 *   supabase functions deploy admin-create-client
 *
 * Payload:
 *   POST /functions/v1/admin-create-client
 *   { email, password, name, phone?, company? }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "missing env" }, 500);

  // 1. Autenticar caller
  const authHeader = req.headers.get("Authorization") || "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!callerToken) return json({ error: "missing bearer" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: callerInfo, error: callerErr } = await admin.auth.getUser(callerToken);
  if (callerErr || !callerInfo?.user) return json({ error: "invalid token" }, 401);

  const { data: callerProfile } = await admin
    .schema("pro_gestion")
    .from("profiles")
    .select("role")
    .eq("id", callerInfo.user.id)
    .maybeSingle();

  if (!callerProfile || !["admin", "super_admin"].includes(callerProfile.role)) {
    return json({ error: "forbidden" }, 403);
  }

  // 2. Validar payload
  let payload: { email?: string; password?: string; name?: string; phone?: string; company?: string };
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { email, password, name, phone, company } = payload;
  if (!email || !password || !name) return json({ error: "email, password y name son requeridos" }, 400);
  if (password.length < 8) return json({ error: "password mínimo 8 chars" }, 400);

  // 3. Crear usuario
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createErr || !created?.user) return json({ error: createErr?.message || "createUser failed" }, 400);

  // 4. Actualizar profile (rol cliente + datos)
  const { error: updErr } = await admin
    .schema("pro_gestion")
    .from("profiles")
    .update({ role: "cliente", name, phone: phone || null, company: company || null })
    .eq("id", created.user.id);

  if (updErr) {
    // intentar limpiar el auth user si no se pudo marcar como cliente
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "no se pudo actualizar profile: " + updErr.message }, 500);
  }

  return json({
    id: created.user.id,
    email: created.user.email,
    name,
    role: "cliente",
  }, 201);
});
