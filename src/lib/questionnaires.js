import { supabase } from './supabase';
import { htmlToPlainText } from '../components/RichTextView.jsx';

// =============================================================
// PLATFORMS
// =============================================================
export async function fetchPlatforms({ activeOnly = false } = {}) {
  let q = supabase.from('platforms').select('*').order('position', { ascending: true }).order('name');
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createPlatform(payload) {
  const { data, error } = await supabase.from('platforms').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlatform(id, patch) {
  const { error } = await supabase.from('platforms').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deletePlatform(id) {
  const { error } = await supabase.from('platforms').delete().eq('id', id);
  if (error) throw error;
}

// =============================================================
// QUESTIONNAIRE TEMPLATES
// =============================================================
export async function fetchQuestionnaireTemplates({ platformId = null, activeOnly = false } = {}) {
  let q = supabase
    .from('questionnaire_templates')
    .select('*')
    .order('position', { ascending: true })
    .order('name');
  if (platformId) q = q.eq('platform_id', platformId);
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchQuestionnaireTemplate(id) {
  const { data, error } = await supabase.from('questionnaire_templates').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createQuestionnaireTemplate(payload) {
  const { data, error } = await supabase.from('questionnaire_templates').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateQuestionnaireTemplate(id, patch) {
  const { error } = await supabase.from('questionnaire_templates').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteQuestionnaireTemplate(id) {
  const { error } = await supabase.from('questionnaire_templates').delete().eq('id', id);
  if (error) throw error;
}

// =============================================================
// PROJECT QUESTIONNAIRES (instancias)
// =============================================================
export async function fetchProjectQuestionnaires(projectId) {
  const { data, error } = await supabase
    .from('project_questionnaires')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchProjectQuestionnaire(id) {
  const { data, error } = await supabase.from('project_questionnaires').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Envía un cuestionario a un proyecto: snapshot del body de la plantilla.
// title/body iniciales = plantilla; admin puede editarlos antes de notificar al cliente.
export async function sendQuestionnaireToProject({ projectId, templateId, overrideTitle = null, overrideBody = null, createdBy = null }) {
  const tpl = await fetchQuestionnaireTemplate(templateId);
  if (!tpl) throw new Error('Plantilla no encontrada');
  const payload = {
    project_id: projectId,
    template_id: tpl.id,
    platform_id: tpl.platform_id,
    title: overrideTitle || tpl.name,
    body: overrideBody || tpl.body || { sections: [] },
    answers: {},
    status: 'borrador',
    created_by: createdBy || null
  };
  const { data, error } = await supabase.from('project_questionnaires').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// Staff edita el cuestionario antes de que el cliente lo conteste (o después).
export async function updateProjectQuestionnaire(id, patch) {
  const { error } = await supabase.from('project_questionnaires').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProjectQuestionnaire(id) {
  const { error } = await supabase.from('project_questionnaires').delete().eq('id', id);
  if (error) throw error;
}

// Cliente guarda parcialmente respuestas (autosave). No cambia status.
export async function saveQuestionnaireAnswers(id, answers) {
  const { error } = await supabase.from('project_questionnaires').update({ answers }).eq('id', id);
  if (error) throw error;
}

// Cliente envía para revisión.
export async function submitProjectQuestionnaire(id, answers) {
  const { error } = await supabase
    .from('project_questionnaires')
    .update({ answers, status: 'enviado', submitted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Staff aprueba.
export async function approveProjectQuestionnaire(id, reviewerId, comment = '') {
  const { error } = await supabase
    .from('project_questionnaires')
    .update({
      status: 'aprobado',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_comment: comment || ''
    })
    .eq('id', id);
  if (error) throw error;
}

// Staff rechaza (devuelve al cliente).
export async function rejectProjectQuestionnaire(id, reviewerId, comment) {
  const { error } = await supabase
    .from('project_questionnaires')
    .update({
      status: 'rechazado',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_comment: comment || ''
    })
    .eq('id', id);
  if (error) throw error;
}

// Staff reabre un cuestionario aprobado para que el cliente lo edite.
export async function reopenProjectQuestionnaire(id, reviewerId, comment) {
  return rejectProjectQuestionnaire(id, reviewerId, comment);
}

// =============================================================
// HELPERS de schema
// =============================================================

// Recorre todas las preguntas de un body y cuenta respondidas/required missing.
// Acepta tanto body de template como instance (misma forma).
export function questionnaireProgress(body, answers) {
  if (!body || !Array.isArray(body.sections)) {
    return { total: 0, answered: 0, percent: 0, requiredMissing: [] };
  }
  const ans = answers || {};
  let total = 0;
  let answered = 0;
  const requiredMissing = [];
  for (const sec of body.sections) {
    for (const q of (sec.questions || [])) {
      total++;
      const v = ans[q.key];
      const filled = (() => {
        if (v === null || v === undefined) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'string') return v.trim().length > 0;
        return true;
      })();
      if (filled) answered++;
      if (q.required && !filled) requiredMissing.push(q.key);
    }
  }
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);
  return { total, answered, percent, requiredMissing };
}

// Genera un id corto local (uso: nuevas preguntas/secciones en el editor).
// Usa crypto.randomUUID (~122 bits) si está disponible, fallback a doble
// Math.random (~82 bits) — más colisiones-resistente que 8 chars (audit M2).
export function localId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'q_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
  } catch { /* ignore */ }
  const a = Math.random().toString(36).slice(2, 10);
  const b = Math.random().toString(36).slice(2, 10);
  return 'q_' + a + b;
}

// Asegura que cada sección/pregunta tenga un `key` (necesario para los answers).
// Si no, asigna uno aleatorio. Se aplica al cargar un body o crear preguntas.
export function ensureKeys(body) {
  if (!body || !Array.isArray(body.sections)) return { sections: [] };
  return {
    ...body,
    sections: body.sections.map(sec => ({
      ...sec,
      questions: (sec.questions || []).map(q => ({
        ...q,
        key: q.key && q.key.trim() ? q.key : localId()
      }))
    }))
  };
}

// Etiqueta plana (texto) de una pregunta — para chips/listados breves.
export function questionPlainLabel(q, maxLen = 80) {
  if (!q) return '';
  return htmlToPlainText(q.label_html || '', maxLen) || '(pregunta sin texto)';
}
