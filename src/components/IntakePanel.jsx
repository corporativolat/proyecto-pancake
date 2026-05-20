import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle, MessageSquare, FileText } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { getIntakeSchema, intakeProgress, BUSINESS_TYPE_LABEL } from '../lib/intakeSchemas.js';
import { approveIntakeForm, rejectIntakeForm, fetchIntakeForm } from '../lib/data.js';
import IntakeForm from './IntakeForm.jsx';

// Panel staff para revisar el cuestionario de intake de un proyecto.
// Modo siempre read-only del IntakeForm; el staff aprueba o rechaza.
//
// Si el proyecto aún no tiene business_type asignado, muestra ayuda.
export default function IntakePanel({ project }) {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const [intake, setIntake] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewComment, setReviewComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const row = await fetchIntakeForm(project.id);
      setIntake(row);
      setReviewComment(row?.review_comment || '');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`intake-staff-${project.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'intake_forms', filter: `project_id=eq.${project.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  if (loading) {
    return <div className="p-10 text-center text-sm text-ink-400">Cargando cuestionario…</div>;
  }

  if (!project.business_type) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h3 className="text-base font-black text-ink-800 mb-1">Sin tipo de negocio asignado</h3>
        <p className="text-sm text-ink-500 leading-relaxed">
          Asigna un tipo de negocio (infoproductor, e-commerce o servicios) al proyecto para que el cliente reciba el cuestionario de intake en su portal.
        </p>
      </div>
    );
  }

  if (!intake) {
    return (
      <div className="p-8 text-center text-sm text-ink-500">
        Aún no se ha creado el cuestionario. Se generará automáticamente al guardar el tipo de negocio.
      </div>
    );
  }

  const schema = getIntakeSchema(intake.business_type);
  const progress = intakeProgress(schema, intake.answers);

  const approve = async () => {
    setBusy(true);
    try {
      await approveIntakeForm(intake.id, profile.id, reviewComment.trim());
      showToast('Cuestionario aprobado', 'success');
      await load();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const trimmed = reviewComment.trim();
    if (!trimmed) {
      showToast('Escribe un comentario para que el cliente sepa qué corregir', 'error');
      return;
    }
    setBusy(true);
    try {
      await rejectIntakeForm(intake.id, profile.id, trimmed);
      showToast('Cuestionario devuelto al cliente', 'success');
      await load();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-4 flex-wrap pb-3 border-b border-ink-100">
        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-violet-700">Cuestionario del cliente · {BUSINESS_TYPE_LABEL[intake.business_type]}</div>
          <h3 className="text-base font-black truncate text-ink-800">{schema?.title || 'Cuestionario'}</h3>
          <div className="text-[11px] text-ink-500 mt-0.5">
            {progress.answered}/{progress.total} preguntas respondidas · {progress.percent}%
          </div>
        </div>
        <StatusBadge status={intake.status} />
      </header>

      {intake.status === 'borrador' && (
        <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-600 flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 flex-shrink-0 text-ink-400" />
          <span>El cliente aún no ha enviado el cuestionario. Puedes ver el avance en curso pero no aprobar hasta que envíe.</span>
        </div>
      )}

      {intake.status === 'aprobado' && intake.reviewed_at && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Aprobado el {new Date(intake.reviewed_at).toLocaleDateString()}.</span>
        </div>
      )}

      {intake.status === 'rechazado' && intake.review_comment && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-red-700 mb-1 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Devuelto con comentarios
          </div>
          <p className="text-sm text-red-900 italic leading-relaxed">&ldquo;{intake.review_comment}&rdquo;</p>
        </div>
      )}

      <IntakeForm
        schema={schema}
        answers={intake.answers}
        readOnly
        showProgress={false}
        accent="violet"
      />

      {(intake.status === 'enviado' || intake.status === 'aprobado' || intake.status === 'rechazado') && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-violet-700 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Comentario de revisión (opcional para aprobar, obligatorio para rechazar)
          </label>
          <textarea
            value={reviewComment}
            onChange={e => setReviewComment(e.target.value)}
            placeholder="Ej: Falta el módulo de objeciones detallado. Por favor completa el punto 5."
            className="input-light min-h-[80px] resize-y"
          />
          {intake.status === 'enviado' && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={reject} disabled={busy} className="btn-soft text-red-700 hover:bg-red-50 disabled:opacity-60">
                <XCircle className="w-3.5 h-3.5" /> Pedir cambios
              </button>
              <button onClick={approve} disabled={busy} className="btn-primary disabled:opacity-60">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar
              </button>
            </div>
          )}
          {intake.status === 'aprobado' && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={reject} disabled={busy} className="btn-soft text-red-700 hover:bg-red-50 disabled:opacity-60">
                <XCircle className="w-3.5 h-3.5" /> Reabrir con observaciones
              </button>
            </div>
          )}
          {intake.status === 'rechazado' && (
            <p className="text-[11px] text-violet-700 italic">
              El cliente puede editar y reenviar. Cuando lo haga, podrás aprobar o rechazar de nuevo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    borrador:  { label: 'Borrador',   cls: 'bg-ink-100 text-ink-600 border-ink-200',           Icon: Clock },
    enviado:   { label: 'Por revisar', cls: 'bg-blue-100 text-blue-700 border-blue-200',        Icon: AlertCircle },
    aprobado:  { label: 'Aprobado',    cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    rechazado: { label: 'Devuelto',    cls: 'bg-red-100 text-red-700 border-red-200',          Icon: XCircle }
  };
  const s = map[status] || map.borrador;
  const Icon = s.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${s.cls} flex-shrink-0`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}
