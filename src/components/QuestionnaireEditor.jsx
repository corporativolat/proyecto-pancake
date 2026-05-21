import { useState, useRef, useEffect } from 'react';
import {
  Plus, X, ChevronUp, ChevronDown, Settings2, Trash2, ChevronsUpDown,
  Type as TypeIcon, AlignLeft, ListChecks, CheckSquare, ToggleLeft,
  HelpCircle, Sparkles
} from 'lucide-react';
import RichTextEditor from './RichTextEditor.jsx';
import { localId, ensureKeys } from '../lib/questionnaires';

const QUESTION_TYPES = [
  { value: 'text',        label: 'Texto corto',         icon: TypeIcon,    desc: 'Una línea de respuesta' },
  { value: 'textarea',    label: 'Texto largo',         icon: AlignLeft,   desc: 'Varios párrafos' },
  { value: 'select',      label: 'Selección única',     icon: ListChecks,  desc: 'Una opción de la lista' },
  { value: 'multiselect', label: 'Selección múltiple',  icon: CheckSquare, desc: 'Varias opciones a la vez' },
  { value: 'yesno',       label: 'Sí / No',             icon: ToggleLeft,  desc: 'Respuesta binaria' }
];
const TYPE_BY_VALUE = Object.fromEntries(QUESTION_TYPES.map(t => [t.value, t]));

// Editor estilo "Word" para el body de una plantilla o instancia.
//
// Props:
//   value     -> { sections: [{ title, description_html, questions: [...] }] }
//   onChange  -> (nextBody) => void
//   readOnly  -> bool (sólo preview; sin botones de edición)
export default function QuestionnaireEditor({ value, onChange, readOnly = false }) {
  const body = ensureKeys(value || { sections: [] });

  const update = (nextSections) => {
    if (readOnly) return;
    onChange?.({ ...body, sections: nextSections });
  };

  const addSection = () => {
    update([
      ...body.sections,
      { id: localId(), title: 'Nueva sección', description_html: '', questions: [] }
    ]);
  };

  const updateSection = (idx, patch) => {
    update(body.sections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };
  const removeSection = (idx) => update(body.sections.filter((_, i) => i !== idx));
  const moveSection = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= body.sections.length) return;
    const next = [...body.sections];
    [next[idx], next[j]] = [next[j], next[idx]];
    update(next);
  };

  const totalQs = body.sections.reduce((acc, s) => acc + (s.questions?.length || 0), 0);

  return (
    <div className="space-y-5">
      {!readOnly && (
        <div className="flex items-center justify-between flex-wrap gap-2 px-1">
          <div className="text-[11px] font-bold text-ink-500">
            <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 border border-violet-100 rounded-full px-2.5 py-1">
              <Sparkles className="w-3 h-3" />
              {body.sections.length} {body.sections.length === 1 ? 'sección' : 'secciones'} · {totalQs} pregunta{totalQs === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}

      {body.sections.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-violet-200 bg-gradient-to-br from-violet-50/40 to-white px-6 py-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mb-3">
            <Plus className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-ink-700 mb-1">Tu cuestionario está vacío</p>
          <p className="text-xs text-ink-500 mb-4">Empieza añadiendo una sección con preguntas.</p>
          {!readOnly && (
            <button type="button" onClick={addSection} className="btn-primary text-xs">
              <Plus className="w-3.5 h-3.5" /> Crear primera sección
            </button>
          )}
        </div>
      )}

      {body.sections.map((sec, sIdx) => (
        <SectionEditor
          key={sec.id || sIdx}
          section={sec}
          index={sIdx}
          total={body.sections.length}
          readOnly={readOnly}
          onChange={(patch) => updateSection(sIdx, patch)}
          onRemove={() => removeSection(sIdx)}
          onMove={(dir) => moveSection(sIdx, dir)}
        />
      ))}

      {!readOnly && body.sections.length > 0 && (
        <button
          type="button"
          onClick={addSection}
          className="w-full rounded-2xl border-2 border-dashed border-ink-200 hover:border-violet-400 hover:bg-violet-50/40 transition px-5 py-4 text-xs font-bold text-ink-500 hover:text-violet-700 flex items-center justify-center gap-2 group"
        >
          <span className="w-6 h-6 rounded-full bg-ink-100 group-hover:bg-violet-200 text-ink-500 group-hover:text-violet-700 flex items-center justify-center transition">
            <Plus className="w-3.5 h-3.5" />
          </span>
          Añadir otra sección
        </button>
      )}
    </div>
  );
}

function SectionEditor({ section, index, total, readOnly, onChange, onRemove, onMove }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showDescription, setShowDescription] = useState(!!section.description_html);

  const addQuestion = (type = 'text') => {
    const q = {
      key: localId(),
      type,
      label_html: '',
      help_html: '',
      required: false,
      options: (type === 'select' || type === 'multiselect') ? ['Opción 1'] : []
    };
    onChange({ questions: [...(section.questions || []), q] });
  };

  const updateQuestion = (qIdx, patch) => {
    onChange({ questions: section.questions.map((q, i) => i === qIdx ? { ...q, ...patch } : q) });
  };
  const removeQuestion = (qIdx) => onChange({ questions: section.questions.filter((_, i) => i !== qIdx) });
  const moveQuestion = (qIdx, dir) => {
    const j = qIdx + dir;
    if (j < 0 || j >= section.questions.length) return;
    const next = [...section.questions];
    [next[qIdx], next[j]] = [next[j], next[qIdx]];
    onChange({ questions: next });
  };

  const qCount = (section.questions || []).length;

  return (
    <section className="qz-section">
      <div className="qz-section-bar" />

      <header className="qz-section-header">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="qz-icon-btn qz-icon-btn-soft"
          title={collapsed ? 'Expandir sección' : 'Colapsar sección'}
        >
          <ChevronsUpDown className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 mb-0.5">
            Sección {index + 1}
          </div>
          <input
            value={section.title || ''}
            onChange={e => onChange({ title: e.target.value })}
            disabled={readOnly}
            placeholder="Título de la sección"
            className="w-full bg-transparent border-0 outline-none text-base md:text-lg font-black text-ink-900 placeholder:text-ink-300 disabled:opacity-70 p-0"
          />
        </div>

        <span className="qz-count-pill">{qCount} {qCount === 1 ? 'preg.' : 'preg.'}</span>

        {!readOnly && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => onMove(-1)} disabled={index === 0} className="qz-icon-btn" title="Subir sección">
              <ChevronUp className="w-4 h-4" />
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="qz-icon-btn" title="Bajar sección">
              <ChevronDown className="w-4 h-4" />
            </button>
            <button onClick={onRemove} className="qz-icon-btn qz-icon-btn-danger" title="Eliminar sección">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {!collapsed && (
        <div className="qz-section-body">
          {!readOnly && (
            <div className="mb-4">
              {showDescription || section.description_html ? (
                <div>
                  <label className="qz-label">
                    <span>Descripción de la sección</span>
                    <button
                      type="button"
                      onClick={() => { setShowDescription(false); onChange({ description_html: '' }); }}
                      className="text-[10px] font-bold text-ink-400 hover:text-red-500"
                    >
                      Quitar
                    </button>
                  </label>
                  <RichTextEditor
                    value={section.description_html || ''}
                    onChange={(html) => onChange({ description_html: html })}
                    placeholder="Texto introductorio opcional…"
                    minHeight={60}
                    compact
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDescription(true)}
                  className="text-[11px] font-bold text-violet-600 hover:text-violet-800 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" /> Añadir descripción a la sección
                </button>
              )}
            </div>
          )}

          {readOnly && section.description_html && (
            <RichTextEditor
              value={section.description_html}
              onChange={() => {}}
              minHeight={40}
              compact
            />
          )}

          <div className="space-y-4">
            {(section.questions || []).map((q, qIdx) => (
              <QuestionEditor
                key={q.key || qIdx}
                question={q}
                index={qIdx}
                total={section.questions.length}
                readOnly={readOnly}
                onChange={(patch) => updateQuestion(qIdx, patch)}
                onRemove={() => removeQuestion(qIdx)}
                onMove={(dir) => moveQuestion(qIdx, dir)}
              />
            ))}

            {qCount === 0 && (
              <div className="qz-empty">
                <p className="text-xs text-ink-400 italic">Esta sección aún no tiene preguntas.</p>
              </div>
            )}
          </div>

          {!readOnly && (
            <AddQuestionMenu onPick={addQuestion} />
          )}
        </div>
      )}
    </section>
  );
}

function QuestionEditor({ question, index, total, readOnly, onChange, onRemove, onMove }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(!!question.help_html);

  const setOption = (i, val) => onChange({ options: question.options.map((o, idx) => idx === i ? val : o) });
  const addOption = () => onChange({ options: [...(question.options || []), 'Opción ' + ((question.options?.length || 0) + 1)] });
  const removeOption = (i) => onChange({ options: question.options.filter((_, idx) => idx !== i) });

  const needsOptions = question.type === 'select' || question.type === 'multiselect';
  const typeInfo = TYPE_BY_VALUE[question.type] || QUESTION_TYPES[0];
  const TypeIco = typeInfo.icon;

  return (
    <div className="qz-question group">
      <div className="qz-question-rail">
        <div className="qz-question-num">{index + 1}</div>
        {!readOnly && (
          <div className="qz-question-rail-actions">
            <button onClick={() => onMove(-1)} disabled={index === 0} className="qz-icon-btn-tiny" title="Subir">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1} className="qz-icon-btn-tiny" title="Bajar">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={onRemove} className="qz-icon-btn-tiny qz-icon-btn-danger" title="Eliminar">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="qz-question-body">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="qz-type-chip">
            <TypeIco className="w-3.5 h-3.5" />
            <select
              value={question.type}
              onChange={e => {
                const t = e.target.value;
                const next = { type: t };
                if ((t === 'select' || t === 'multiselect') && (!question.options || question.options.length === 0)) {
                  next.options = ['Opción 1'];
                }
                onChange(next);
              }}
              disabled={readOnly}
              className="bg-transparent border-0 outline-none text-[11px] font-bold text-violet-800 cursor-pointer disabled:opacity-70"
            >
              {QUESTION_TYPES.map(qt => <option key={qt.value} value={qt.value}>{qt.label}</option>)}
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-600 select-none cursor-pointer bg-white border border-ink-200 rounded-full px-2.5 py-1 hover:border-violet-300 transition">
            <input
              type="checkbox"
              checked={!!question.required}
              onChange={e => onChange({ required: e.target.checked })}
              disabled={readOnly}
              className="w-3 h-3 accent-violet-600"
            />
            Obligatoria
          </label>

          {!readOnly && (
            <>
              {!showHelp && !question.help_html && (
                <button
                  type="button"
                  onClick={() => setShowHelp(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-500 hover:text-violet-700 bg-white border border-ink-200 rounded-full px-2.5 py-1 transition hover:border-violet-300"
                  title="Añadir texto de ayuda"
                >
                  <HelpCircle className="w-3 h-3" /> Ayuda
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSettings(s => !s)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 border transition ${
                  showSettings
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-ink-500 border-ink-200 hover:text-violet-700 hover:border-violet-300'
                }`}
                title="Avanzado"
              >
                <Settings2 className="w-3 h-3" /> Avanzado
              </button>
            </>
          )}
        </div>

        <RichTextEditor
          value={question.label_html || ''}
          onChange={(html) => onChange({ label_html: html })}
          placeholder="Escribe aquí la pregunta…"
          minHeight={56}
        />

        {(showHelp || question.help_html) && (
          <div className="mt-3 pl-3 border-l-2 border-violet-200">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-black text-violet-600 uppercase tracking-widest flex items-center gap-1.5">
                <HelpCircle className="w-3 h-3" /> Texto de ayuda
              </label>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => { setShowHelp(false); onChange({ help_html: '' }); }}
                  className="text-[10px] font-bold text-ink-400 hover:text-red-500"
                >
                  Quitar
                </button>
              )}
            </div>
            <RichTextEditor
              value={question.help_html || ''}
              onChange={(html) => onChange({ help_html: html })}
              placeholder="Aclaración, ejemplo, contexto…"
              minHeight={40}
              compact
            />
          </div>
        )}

        {needsOptions && (
          <div className="mt-3">
            <label className="qz-label">
              <span>Opciones</span>
              <span className="text-[10px] font-mono text-ink-400">{question.options?.length || 0}</span>
            </label>
            <div className="space-y-1.5">
              {(question.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2 group/opt">
                  <span className="w-6 h-6 rounded-md bg-ink-100 text-ink-500 text-[10px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <input
                    value={opt}
                    onChange={e => setOption(i, e.target.value)}
                    disabled={readOnly}
                    placeholder={`Opción ${i + 1}`}
                    className="input-light flex-1 text-sm py-1.5"
                  />
                  {!readOnly && (
                    <button onClick={() => removeOption(i)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover/opt:opacity-100 transition" title="Quitar opción">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-violet-700 hover:text-violet-900 px-2.5 py-1.5 rounded-lg hover:bg-violet-50 transition"
                >
                  <Plus className="w-3 h-3" /> Añadir opción
                </button>
              )}
            </div>
          </div>
        )}

        {showSettings && !readOnly && (
          <div className="mt-3 pt-3 border-t border-ink-100 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="qz-label">Identificador (key)</label>
              <input
                value={question.key || ''}
                onChange={e => onChange({ key: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })}
                className="input-light text-xs font-mono"
                placeholder="auto"
              />
              <p className="text-[10px] text-ink-400 mt-1 leading-snug">
                Identificador interno para guardar las respuestas. Cambia sólo si sabes lo que haces — alterarlo en una plantilla viva puede hacer perder respuestas existentes.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddQuestionMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative mt-4" ref={ref}>
      {open ? (
        <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-violet-600">Elige el tipo de pregunta</h4>
            <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {QUESTION_TYPES.map(qt => {
              const Icon = qt.icon;
              return (
                <button
                  key={qt.value}
                  type="button"
                  onClick={() => { onPick(qt.value); setOpen(false); }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-ink-200 hover:border-violet-400 hover:bg-violet-50 transition text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-ink-900">{qt.label}</div>
                    <div className="text-[11px] text-ink-500 leading-snug">{qt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border-2 border-dashed border-violet-200 hover:border-violet-400 hover:bg-violet-50/60 transition px-5 py-3 text-xs font-bold text-violet-700 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Añadir pregunta
        </button>
      )}
    </div>
  );
}

