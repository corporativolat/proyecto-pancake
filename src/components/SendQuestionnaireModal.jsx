import { useEffect, useState } from 'react';
import { ClipboardList, Send, Eye, Pencil } from 'lucide-react';
import Modal from './Modal.jsx';
import QuestionnaireEditor from './QuestionnaireEditor.jsx';
import { fetchPlatforms, fetchQuestionnaireTemplates, sendQuestionnaireToProject } from '../lib/questionnaires';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth.jsx';

// Modal de 3 pasos:
//   1) Elegir plataforma (chips)
//   2) Elegir plantilla (lista)
//   3) Preview + opcional edición del body antes de enviar
//
// Al enviar crea una instancia en project_questionnaires con snapshot del body.
export default function SendQuestionnaireModal({ projectId, onClose, onSent }) {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const [step, setStep] = useState(1);
  const [platforms, setPlatforms] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platformId, setPlatformId] = useState(null);
  const [template, setTemplate] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pls, tps] = await Promise.all([fetchPlatforms({ activeOnly: true }), fetchQuestionnaireTemplates({ activeOnly: true })]);
        setPlatforms(pls);
        setTemplates(tps);
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const pickPlatform = (id) => { setPlatformId(id); setStep(2); };
  const pickTemplate = (tpl) => {
    setTemplate(tpl);
    setTitle(tpl.name);
    setBody(tpl.body || { sections: [] });
    setStep(3);
  };
  const back = () => {
    if (step === 3) { setStep(2); setTemplate(null); setEditMode(false); }
    else if (step === 2) { setStep(1); setPlatformId(null); }
  };

  const send = async () => {
    if (!template) return;
    setSending(true);
    try {
      const instance = await sendQuestionnaireToProject({
        projectId,
        templateId: template.id,
        overrideTitle: title.trim() || template.name,
        overrideBody: body,
        createdBy: profile?.id
      });
      showToast('Cuestionario enviado al cliente', 'success');
      onSent?.(instance);
      onClose();
    } catch (e) {
      showToast('Error al enviar: ' + e.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const platformTemplates = platformId ? templates.filter(t => t.platform_id === platformId) : [];
  const platform = platforms.find(p => p.id === platformId);

  const footer = (
    <>
      {step > 1 && (
        <button onClick={back} className="btn-ghost" disabled={sending}>Atrás</button>
      )}
      <button onClick={onClose} className="btn-ghost" disabled={sending}>Cancelar</button>
      {step === 3 && (
        <button onClick={send} disabled={sending} className="btn-primary">
          <Send className="w-3.5 h-3.5" />
          {sending ? 'Enviando…' : 'Enviar al cliente'}
        </button>
      )}
    </>
  );

  return (
    <Modal title="Enviar cuestionario" maxWidth="max-w-5xl" onClose={onClose} footer={footer}>
      {/* Stepper */}
      <div className="flex items-center justify-center gap-2 mb-5">
        {['Plataforma', 'Plantilla', 'Revisar y enviar'].map((label, idx) => {
          const num = idx + 1;
          const active = step === num;
          const done = step > num;
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                active ? 'bg-violet-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-ink-200 text-ink-500'
              }`}>{done ? '✓' : num}</div>
              <span className={`text-[11px] font-bold ${active ? 'text-violet-700' : 'text-ink-500'}`}>{label}</span>
              {num < 3 && <span className="w-6 h-px bg-ink-200 mx-1" />}
            </div>
          );
        })}
      </div>

      {loading && <p className="text-xs text-ink-400 italic text-center py-8">Cargando…</p>}

      {!loading && step === 1 && (
        <div>
          <p className="text-xs text-ink-500 mb-4">Elige a qué plataforma pertenece el cuestionario que vas a enviar.</p>
          {platforms.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              No hay plataformas creadas. Pide a un admin que cree al menos una en Admin → Plataformas.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {platforms.map(p => {
                const count = templates.filter(t => t.platform_id === p.id).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPlatform(p.id)}
                    disabled={count === 0}
                    className="flex items-center gap-3 p-4 rounded-2xl border border-ink-200 hover:border-violet-400 hover:bg-violet-50 transition text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-sm overflow-hidden" style={{ background: p.color + '22', color: p.color }}>
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        : <span>{p.icon || '🔹'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-ink-900 truncate">{p.name}</div>
                      {p.description && <div className="text-[11px] text-ink-500 truncate">{p.description}</div>}
                    </div>
                    <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full tabular">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && step === 2 && (
        <div>
          <p className="text-xs text-ink-500 mb-4">
            Plataforma: <strong className="text-violet-700">{platform?.name}</strong>. Elige la plantilla a enviar.
          </p>
          {platformTemplates.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              Esta plataforma no tiene plantillas. Crea una en Admin → Plantillas de cuestionarios.
            </p>
          ) : (
            <div className="space-y-2">
              {platformTemplates.map(tpl => {
                const qCount = (tpl.body?.sections || []).reduce((acc, s) => acc + (s.questions?.length || 0), 0);
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => pickTemplate(tpl)}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl border border-ink-200 hover:border-violet-400 hover:bg-violet-50 transition text-left"
                  >
                    <ClipboardList className="w-5 h-5 text-violet-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-ink-900">{tpl.name}</div>
                      {tpl.description && <div className="text-[11px] text-ink-500 truncate">{tpl.description}</div>}
                    </div>
                    <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full tabular">{qCount} preg.</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && step === 3 && template && (
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1.5 block">Título de este envío</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input-light text-sm font-bold"
              placeholder={template.name}
            />
            <p className="text-[10px] text-ink-400 mt-1">Lo verá el cliente. Por defecto usa el nombre de la plantilla.</p>
          </div>

          <div className="flex items-center justify-between bg-ink-50 rounded-xl px-4 py-3 border border-ink-100">
            <div className="text-[11px] text-ink-600">
              <strong className="text-ink-900">{template.name}</strong> · plantilla original.
              Se enviará una <strong>copia editable</strong>: cambios aquí no afectan la plantilla.
            </div>
            <button
              type="button"
              onClick={() => setEditMode(m => !m)}
              className={`text-[11px] font-bold inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${editMode ? 'bg-violet-600 text-white' : 'bg-white border border-ink-200 text-ink-700 hover:border-violet-400'}`}
            >
              {editMode ? <><Eye className="w-3.5 h-3.5" /> Solo ver</> : <><Pencil className="w-3.5 h-3.5" /> Editar antes de enviar</>}
            </button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto scroller pr-1">
            <QuestionnaireEditor
              value={body || { sections: [] }}
              onChange={setBody}
              readOnly={!editMode}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
