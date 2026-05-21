import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Clock, AlertCircle, MessageSquare, FileText, Pencil, Eye } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import {
  questionnaireProgress,
  approveProjectQuestionnaire,
  rejectProjectQuestionnaire,
  fetchProjectQuestionnaire,
  updateProjectQuestionnaire
} from '../lib/questionnaires';
import QuestionnaireRenderer from './QuestionnaireRenderer.jsx';
import QuestionnaireEditor from './QuestionnaireEditor.jsx';

// Panel staff para revisar UN cuestionario (instancia) específica.
// Permite ver respuestas, editar el body del cuestionario, aprobar o rechazar.
export default function QuestionnairePanel({ instanceId }) {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const [pq, setPq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewComment, setReviewComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [editStructure, setEditStructure] = useState(false);
  // Debounce 800ms para no spamear el server con cada keystroke del editor.
  // pqIdRef permite flush al desmontar sin depender de `pq` (que puede ser null).
  const saveTimer = useRef(null);
  const pendingBodyRef = useRef(null);
  const pqIdRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const row = await fetchProjectQuestionnaire(instanceId);
      setPq(row);
      pqIdRef.current = row?.id || null;
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
      .channel(`pq-staff-${instanceId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'project_questionnaires', filter: `id=eq.${instanceId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  // Flush pendiente del editor al desmontar el panel: el último nextBody que
  // estaba en cola se persiste antes de que React limpie el árbol.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = pqIdRef.current;
    const body = pendingBodyRef.current;
    if (id && body) {
      pendingBodyRef.current = null;
      updateProjectQuestionnaire(id, { body }).catch(() => { /* best-effort */ });
    }
  }, []);

  if (loading) return <div className="p-10 text-center text-sm text-ink-400">Cargando cuestionario…</div>;
  if (!pq) return <div className="p-10 text-center text-sm text-ink-500">No se encontró el cuestionario.</div>;

  const progress = questionnaireProgress(pq.body, pq.answers);

  const approve = async () => {
    setBusy(true);
    try {
      await approveProjectQuestionnaire(pq.id, profile.id, reviewComment.trim());
      showToast('Cuestionario aprobado', 'success');
      await load();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  const reject = async () => {
    const trimmed = reviewComment.trim();
    if (!trimmed) { showToast('Escribe un comentario para que el cliente sepa qué corregir', 'error'); return; }
    setBusy(true);
    try {
      await rejectProjectQuestionnaire(pq.id, profile.id, trimmed);
      showToast('Cuestionario devuelto al cliente', 'success');
      await load();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  const saveBody = (nextBody) => {
    setPq(prev => ({ ...prev, body: nextBody }));
    pendingBodyRef.current = nextBody;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = pq.id;
    saveTimer.current = setTimeout(async () => {
      const body = pendingBodyRef.current;
      pendingBodyRef.current = null;
      try {
        await updateProjectQuestionnaire(id, { body });
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }, 800);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-4 flex-wrap pb-3 border-b border-ink-100">
        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-violet-700">Cuestionario del cliente</div>
          <input
            value={pq.title}
            onChange={e => setPq(prev => ({ ...prev, title: e.target.value }))}
            onBlur={() => updateProjectQuestionnaire(pq.id, { title: pq.title }).catch(e => showToast('Error: ' + e.message, 'error'))}
            className="text-base font-black text-ink-800 bg-transparent border-0 outline-none p-0 w-full"
          />
          <div className="text-[11px] text-ink-500 mt-0.5">
            {progress.answered}/{progress.total} preguntas respondidas · {progress.percent}%
          </div>
        </div>
        <StatusBadge status={pq.status} />
      </header>

      <div className="flex items-center justify-between bg-ink-50 rounded-xl px-3 py-2 border border-ink-100">
        <div className="text-[11px] text-ink-600">
          {editStructure ? 'Modo edición: cambia preguntas, opciones y formato.' : 'Vista de lectura con respuestas del cliente.'}
        </div>
        <button
          type="button"
          onClick={() => setEditStructure(m => !m)}
          className={`text-[11px] font-bold inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${editStructure ? 'bg-violet-600 text-white' : 'bg-white border border-ink-200 text-ink-700 hover:border-violet-400'}`}
        >
          {editStructure ? <><Eye className="w-3.5 h-3.5" /> Ver respuestas</> : <><Pencil className="w-3.5 h-3.5" /> Editar estructura</>}
        </button>
      </div>

      {pq.status === 'borrador' && (
        <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-600 flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 flex-shrink-0 text-ink-400" />
          <span>El cliente aún no ha enviado el cuestionario. Puedes ver el avance en curso pero no aprobar hasta que envíe.</span>
        </div>
      )}
      {pq.status === 'aprobado' && pq.reviewed_at && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Aprobado el {new Date(pq.reviewed_at).toLocaleDateString()}.</span>
        </div>
      )}
      {pq.status === 'rechazado' && pq.review_comment && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-red-700 mb-1 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Devuelto con comentarios
          </div>
          <p className="text-sm text-red-900 italic leading-relaxed">&ldquo;{pq.review_comment}&rdquo;</p>
        </div>
      )}

      {editStructure ? (
        <QuestionnaireEditor value={pq.body} onChange={saveBody} />
      ) : (
        <QuestionnaireRenderer body={pq.body} answers={pq.answers} readOnly showProgress={false} accent="violet" />
      )}

      {(pq.status === 'enviado' || pq.status === 'aprobado' || pq.status === 'rechazado') && (
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
          {pq.status === 'enviado' && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={reject} disabled={busy} className="btn-soft text-red-700 hover:bg-red-50 disabled:opacity-60">
                <XCircle className="w-3.5 h-3.5" /> Pedir cambios
              </button>
              <button onClick={approve} disabled={busy} className="btn-primary disabled:opacity-60">
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar
              </button>
            </div>
          )}
          {pq.status === 'aprobado' && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={reject} disabled={busy} className="btn-soft text-red-700 hover:bg-red-50 disabled:opacity-60">
                <XCircle className="w-3.5 h-3.5" /> Reabrir con observaciones
              </button>
            </div>
          )}
          {pq.status === 'rechazado' && (
            <p className="text-[11px] text-violet-700 italic">El cliente puede editar y reenviar. Cuando lo haga, podrás aprobar o rechazar de nuevo.</p>
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
