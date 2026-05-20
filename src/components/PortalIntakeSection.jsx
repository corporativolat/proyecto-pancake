import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, Send, CheckCircle2, AlertTriangle, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { getIntakeSchema, intakeProgress, BUSINESS_TYPE_LABEL } from '../lib/intakeSchemas.js';
import { fetchIntakeForm, saveIntakeAnswers, submitIntakeForm } from '../lib/data.js';
import IntakeForm from './IntakeForm.jsx';

// Sección del portal cliente donde se completa el cuestionario base.
// Auto-guarda cada 1.2s tras dejar de escribir, y permite enviar para
// revisión cuando todos los `required` están respondidos.
//
// Si el proyecto no tiene business_type asignado, no se renderiza nada
// (el staff aún no lo ha definido).
export default function PortalIntakeSection({ project }) {
  const showToast = useToast(s => s.show);
  const [intake, setIntake] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const dirtyRef = useRef(false);
  const debounceRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchIntakeForm(project.id);
      setIntake(row);
      setAnswers(row?.answers || {});
      dirtyRef.current = false;
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [project.id, showToast]);

  useEffect(() => {
    if (!project?.business_type) { setLoading(false); return; }
    load();
    const ch = supabase
      .channel(`portal-intake-${project.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'intake_forms', filter: `project_id=eq.${project.id}` }, () => {
        // No sobrescribimos si el usuario tiene cambios sin guardar.
        if (!dirtyRef.current) load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [project?.business_type, project?.id, load]);

  // Autosave con debounce 1.2s.
  useEffect(() => {
    if (!intake) return;
    if (!dirtyRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // Solo guardamos si está editable
      if (intake.status !== 'borrador' && intake.status !== 'rechazado') return;
      try {
        setSaving(true);
        await saveIntakeAnswers(intake.id, answers);
        dirtyRef.current = false;
      } catch (e) {
        showToast('Error guardando: ' + e.message, 'error');
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, intake?.id, intake?.status]);

  if (!project?.business_type) return null;
  if (loading) {
    return (
      <div className="card-light p-5 mb-5">
        <p className="text-xs text-ink-400">Cargando cuestionario inicial…</p>
      </div>
    );
  }
  if (!intake) {
    // No debería pasar (el trigger lo crea), pero defendemos UX.
    return (
      <div className="card-light p-5 mb-5">
        <p className="text-xs text-ink-400">El cuestionario aún no está disponible. Pídele al equipo que lo active.</p>
      </div>
    );
  }

  const schema = getIntakeSchema(intake.business_type);
  const progress = intakeProgress(schema, answers);
  const readOnly = !(intake.status === 'borrador' || intake.status === 'rechazado');
  const canSubmit = !readOnly && progress.requiredMissing.length === 0 && progress.answered > 0;

  const handleChange = (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
    dirtyRef.current = true;
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      showToast('Faltan respuestas obligatorias', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await submitIntakeForm(intake.id, answers);
      dirtyRef.current = false;
      showToast('Cuestionario enviado — tu equipo lo revisará pronto', 'success');
      await load();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Color de la cabecera según estado
  const headerCls = {
    borrador:  'from-violet-50/60 border-violet-200',
    enviado:   'from-blue-50/60 border-blue-200',
    aprobado:  'from-emerald-50/60 border-emerald-200',
    rechazado: 'from-amber-50/60 border-amber-200'
  }[intake.status] || 'from-violet-50/60';

  return (
    <div className="card-light overflow-hidden mb-5" data-tour="intake">
      <div className={`px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r ${headerCls} to-transparent`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-black uppercase tracking-widest text-ink-700 flex items-center gap-2 flex-wrap">
              Cuestionario inicial
              <span className="text-ink-300">·</span>
              <span className="text-violet-700">{BUSINESS_TYPE_LABEL[intake.business_type]}</span>
            </h2>
            <p className="text-[11px] text-ink-500 mt-0.5">
              {intake.status === 'borrador'  && 'Completa esta información para que tu equipo arranque el bot.'}
              {intake.status === 'enviado'   && 'Tu equipo lo está revisando. Te avisaremos en cuanto haya feedback.'}
              {intake.status === 'aprobado'  && '¡Aprobado! Tu equipo ya está usando esta información.'}
              {intake.status === 'rechazado' && 'Tu equipo te dejó observaciones. Ajusta y reenvía.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saving && <span className="text-[10px] font-bold text-ink-400 italic">Guardando…</span>}
          {!saving && intake.status === 'borrador' && !dirtyRef.current && (
            <span className="text-[10px] font-bold text-emerald-600 italic flex items-center gap-1">
              <Save className="w-3 h-3" /> Guardado
            </span>
          )}
          <button onClick={() => setExpanded(e => !e)} className="btn-soft text-[10px]" title={expanded ? 'Colapsar' : 'Expandir'}>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span className="hidden md:inline">{expanded ? 'Colapsar' : 'Abrir'}</span>
          </button>
        </div>
      </div>

      {intake.status === 'rechazado' && intake.review_comment && (
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-0.5">Comentario del equipo</div>
            <p className="text-[12px] text-amber-900 italic leading-snug">&ldquo;{intake.review_comment}&rdquo;</p>
          </div>
        </div>
      )}

      {intake.status === 'aprobado' && (
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
          <p className="text-[12px] text-emerald-800 leading-snug">
            Tu cuestionario fue aprobado el {intake.reviewed_at ? new Date(intake.reviewed_at).toLocaleDateString() : ''}.
            Esta sección ahora es de solo lectura.
          </p>
        </div>
      )}

      {expanded && (
        <div className="p-5 space-y-4">
          <IntakeForm
            schema={schema}
            answers={answers}
            onChange={handleChange}
            readOnly={readOnly}
            showProgress={true}
            accent="emerald"
          />

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3 justify-end pt-3 border-t">
              <div className="text-[11px] text-ink-500 mr-auto">
                {progress.requiredMissing.length > 0
                  ? <span className="text-amber-700 font-bold">Faltan {progress.requiredMissing.length} obligatoria(s)</span>
                  : <span className="text-emerald-700 font-bold">Listo para enviar</span>}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="btn-emerald disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Enviando…' : 'Enviar para revisión'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
