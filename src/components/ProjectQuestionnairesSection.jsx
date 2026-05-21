import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Plus, CheckCircle2, XCircle, Clock, AlertCircle, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import { supabase } from '../lib/supabase';
import {
  fetchProjectQuestionnaires,
  deleteProjectQuestionnaire,
  questionnaireProgress
} from '../lib/questionnaires';
import SendQuestionnaireModal from './SendQuestionnaireModal.jsx';
import QuestionnairePanel from './QuestionnairePanel.jsx';
import Modal from './Modal.jsx';

// Lista de cuestionarios enviados a un proyecto + acción para enviar uno nuevo.
// Render para staff dentro de ProjectDetail.
export default function ProjectQuestionnairesSection({ project, editable }) {
  const { can } = useAuth();
  const showToast = useToast(s => s.show);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [reviewing, setReviewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchProjectQuestionnaires(project.id)); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  }, [project.id, showToast]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`pq-list-${project.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'project_questionnaires', filter: `project_id=eq.${project.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [project.id, load]);

  const remove = async (id) => {
    const ok = await askConfirm({ title: 'Eliminar cuestionario', message: 'Se borrarán también las respuestas del cliente. ¿Continuar?', danger: true });
    if (!ok) return;
    try {
      await deleteProjectQuestionnaire(id);
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('Cuestionario eliminado');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const canSend = editable || can?.('manageUsers');

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-ink-100 p-5 md:p-6 mt-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <ClipboardList className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-ink-800">Cuestionarios del cliente</h3>
            <p className="text-[11px] text-ink-500">Plantillas enviadas a este proyecto.</p>
          </div>
        </div>
        {canSend && (
          <button onClick={() => setShowSend(true)} className="btn-primary-sm">
            <Plus className="w-3.5 h-3.5" /> Enviar cuestionario
          </button>
        )}
      </div>

      {loading && <p className="text-xs text-ink-400 italic">Cargando…</p>}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 px-5 py-8 text-center">
          <p className="text-sm text-ink-500 mb-2">Todavía no has enviado ningún cuestionario.</p>
          {canSend && (
            <button onClick={() => setShowSend(true)} className="text-violet-700 text-xs font-bold hover:underline">
              Enviar el primero →
            </button>
          )}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map(q => {
            const prog = questionnaireProgress(q.body, q.answers);
            return (
              <div key={q.id} className="flex items-center gap-3 p-3 rounded-xl border border-ink-100 hover:border-violet-300 hover:bg-violet-50/40 transition group">
                <ClipboardList className="w-4 h-4 text-violet-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink-900 truncate">{q.title}</div>
                  <div className="text-[11px] text-ink-500 tabular">
                    {prog.answered}/{prog.total} respondidas · {prog.percent}%
                  </div>
                </div>
                <StatusBadge status={q.status} />
                <button
                  onClick={() => setReviewing(q.id)}
                  className="text-violet-700 hover:text-violet-900 text-[11px] font-bold inline-flex items-center gap-1"
                  title="Abrir"
                >
                  <Pencil className="w-3.5 h-3.5" /> Abrir
                </button>
                {canSend && (
                  <button
                    onClick={() => remove(q.id)}
                    className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showSend && (
        <SendQuestionnaireModal
          projectId={project.id}
          onClose={() => setShowSend(false)}
          onSent={() => load()}
        />
      )}

      {reviewing && (
        <Modal
          title="Revisar cuestionario"
          maxWidth="max-w-4xl"
          onClose={() => setReviewing(null)}
          footer={<button onClick={() => setReviewing(null)} className="btn-primary">Cerrar</button>}
        >
          <QuestionnairePanel instanceId={reviewing} onClose={() => setReviewing(null)} />
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    borrador:  { label: 'Borrador',    cls: 'bg-ink-100 text-ink-600',         Icon: Clock },
    enviado:   { label: 'Por revisar', cls: 'bg-blue-100 text-blue-700',       Icon: AlertCircle },
    aprobado:  { label: 'Aprobado',    cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
    rechazado: { label: 'Devuelto',    cls: 'bg-red-100 text-red-700',         Icon: XCircle }
  };
  const s = map[status] || map.borrador;
  const Icon = s.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${s.cls} flex-shrink-0`}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}
