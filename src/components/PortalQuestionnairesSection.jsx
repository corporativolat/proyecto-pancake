import { useEffect, useState, useCallback, useRef } from 'react';
import { ClipboardList, CheckCircle2, XCircle, Clock, AlertCircle, Send } from 'lucide-react';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import {
  fetchProjectQuestionnaires,
  saveQuestionnaireAnswers,
  submitProjectQuestionnaire,
  questionnaireProgress
} from '../lib/questionnaires';
import QuestionnaireRenderer from './QuestionnaireRenderer.jsx';
import Modal from './Modal.jsx';

// Sección del portal cliente: muestra todos los cuestionarios del proyecto.
// Solo lo que el cliente debe ver/llenar (todas las instancias creadas por staff).
export default function PortalQuestionnairesSection({ project }) {
  const showToast = useToast(s => s.show);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchProjectQuestionnaires(project.id)); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  }, [project.id, showToast]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`portal-pq-${project.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'project_questionnaires', filter: `project_id=eq.${project.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [project.id, load]);

  if (loading) return null;
  if (items.length === 0) return null;

  const pending = items.filter(q => q.status === 'borrador' || q.status === 'rechazado');

  return (
    <div className="card-light overflow-hidden mb-5" data-fade-card>
      <div className="px-5 py-4 border-b bg-gradient-to-r from-emerald-50/40 to-transparent">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5" /> Cuestionarios
          {pending.length > 0 && (
            <span className="text-[10px] font-black px-1.5 py-0.5 bg-violet-600 text-white rounded-full">
              {pending.length} pendiente{pending.length === 1 ? '' : 's'}
            </span>
          )}
        </h2>
        <p className="text-[10px] text-ink-400 mt-0.5">
          Responde los cuestionarios que tu equipo necesita para configurar tu proyecto.
        </p>
      </div>

      <ul className="divide-y">
        {items.map(q => {
          const prog = questionnaireProgress(q.body, q.answers);
          return (
            <li key={q.id} className="px-5 py-4 hover:bg-ink-50 transition cursor-pointer" onClick={() => setActiveId(q.id)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-ink-900 truncate">{q.title}</div>
                  <div className="text-[11px] text-ink-500 tabular mt-0.5">
                    {prog.answered}/{prog.total} respondidas · {prog.percent}%
                  </div>
                  {q.status === 'rechazado' && q.review_comment && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-widest text-red-700 mb-0.5">Tu equipo pide cambios</div>
                      <p className="text-[11px] text-red-900 italic leading-snug">&ldquo;{q.review_comment}&rdquo;</p>
                    </div>
                  )}
                </div>
                <StatusBadge status={q.status} />
              </div>
            </li>
          );
        })}
      </ul>

      {activeId && (
        <PortalFillerModal
          id={activeId}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}

function PortalFillerModal({ id, onClose }) {
  const showToast = useToast(s => s.show);
  const [pq, setPq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef(null);
  // Inicializa con el serialized del estado vacío para que el primer tick
  // del autosave (antes de que la fila cargue) no dispare un save innecesario.
  const lastSavedRef = useRef(JSON.stringify({}));
  const initialLoadedRef = useRef(false);

  // Carga inicial + realtime: si el staff aprueba/rechaza mientras el modal
  // está abierto, traemos el row actualizado para apagar el autosave a tiempo
  // y avisar al cliente con una notificación visual.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('project_questionnaires').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setPq(data);
        if (!initialLoadedRef.current) {
          // Solo en la primera carga sobrescribimos las respuestas locales.
          // En cargas siguientes (realtime), mantenemos lo que el cliente
          // está escribiendo para no perder edición.
          setAnswers(data?.answers || {});
          lastSavedRef.current = JSON.stringify(data?.answers || {});
          initialLoadedRef.current = true;
        }
      } catch (e) {
        if (!cancelled) showToast('Error: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const ch = supabase
      .channel(`portal-pq-fill-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'pro_gestion', table: 'project_questionnaires', filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [id, showToast]);

  // Autosave 1.2s después del último cambio (solo en estados editables).
  // Si el status cambió a no editable mientras escribíamos (realtime), el
  // autosave queda inactivo. Cualquier intento residual la RLS lo rechaza.
  useEffect(() => {
    if (!pq) return;
    if (pq.status !== 'borrador' && pq.status !== 'rechazado') return;
    const serialized = JSON.stringify(answers);
    if (serialized === lastSavedRef.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveQuestionnaireAnswers(pq.id, answers);
        lastSavedRef.current = serialized;
      } catch (e) {
        // Si la RLS lo rechaza (status cambió desde el servidor), avisamos
        // y dejamos que la próxima carga realtime ponga el modal en sólo
        // lectura. Pero NO seguimos golpeando el server con reintentos.
        const isRlsDenial = (e?.code === '42501') || (typeof e?.message === 'string' && /row-level security|policy/i.test(e.message));
        if (isRlsDenial) {
          showToast('El cuestionario fue revisado por tu equipo. Recargando…', 'info');
          lastSavedRef.current = serialized; // congela
        } else {
          showToast('Error al guardar: ' + e.message, 'error');
        }
      }
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [answers, pq, showToast]);

  const editable = pq && (pq.status === 'borrador' || pq.status === 'rechazado');
  const progress = pq ? questionnaireProgress(pq.body, answers) : { total: 0, answered: 0, percent: 0, requiredMissing: [] };

  const submit = async () => {
    if (!pq) return;
    if (progress.requiredMissing.length > 0) {
      showToast(`Faltan ${progress.requiredMissing.length} pregunta(s) obligatoria(s)`, 'error');
      return;
    }
    setBusy(true);
    try {
      await submitProjectQuestionnaire(pq.id, answers);
      showToast('Cuestionario enviado — tu equipo lo revisará', 'success');
      onClose();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }));

  const footer = (
    <>
      <button onClick={onClose} className="btn-ghost" disabled={busy}>Cerrar</button>
      {editable && (
        <button
          onClick={submit}
          disabled={busy || progress.requiredMissing.length > 0}
          className="btn-emerald disabled:opacity-60"
          title={progress.requiredMissing.length > 0 ? `Faltan ${progress.requiredMissing.length} obligatorias` : 'Enviar para revisión'}
        >
          <Send className="w-3.5 h-3.5" />
          {busy ? 'Enviando…' : 'Enviar para revisión'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      title={pq?.title || 'Cuestionario'}
      maxWidth="max-w-4xl"
      onClose={onClose}
      footer={footer}
    >
      {loading && <p className="text-xs text-ink-400 italic text-center py-8">Cargando…</p>}

      {!loading && pq && (
        <div className="space-y-4">
          {pq.status === 'rechazado' && pq.review_comment && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-red-700 mb-1 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> Tu equipo pide cambios
              </div>
              <p className="text-sm text-red-900 italic leading-relaxed">&ldquo;{pq.review_comment}&rdquo;</p>
            </div>
          )}

          {pq.status === 'aprobado' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Cuestionario aprobado. Ya no puedes editarlo, pero queda como referencia.</span>
            </div>
          )}

          {pq.status === 'enviado' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>En revisión por tu equipo. Te avisaremos cuando lo aprueben o te pidan cambios.</span>
            </div>
          )}

          <QuestionnaireRenderer
            body={pq.body}
            answers={answers}
            onChange={setAnswer}
            readOnly={!editable}
            accent="emerald"
          />
        </div>
      )}
    </Modal>
  );
}

function StatusBadge({ status }) {
  const map = {
    borrador:  { label: 'Por responder', cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Clock },
    enviado:   { label: 'En revisión',   cls: 'bg-blue-100 text-blue-700 border-blue-200',    Icon: AlertCircle },
    aprobado:  { label: 'Aprobado',      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    rechazado: { label: 'Cambios',       cls: 'bg-red-100 text-red-700 border-red-200',       Icon: XCircle }
  };
  const s = map[status] || map.borrador;
  const Icon = s.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${s.cls} flex-shrink-0`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}
