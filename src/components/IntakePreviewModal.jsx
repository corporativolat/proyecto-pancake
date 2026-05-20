import { useState } from 'react';
import { X, ClipboardList, CheckCircle2, ChevronRight, AlertTriangle, FileQuestion } from 'lucide-react';
import { BUSINESS_TYPES, INTAKE_SCHEMAS } from '../lib/intakeSchemas.js';

// Modal de previsualización de cuestionarios de intake.
//
// Dos modos:
//   - mode="select"  (default): muestra las 3 opciones. Al pinchar una se
//     ve el detalle y abajo un botón "Asignar este cuestionario" que llama
//     a `onSelect(business_type)`. Pensado para usarse cuando el proyecto
//     aún no tiene business_type asignado.
//   - mode="view"    : recibe `businessType` y muestra solo el detalle de
//     ese cuestionario en read-only. Sin botón de asignar. Para inspeccionar
//     uno ya asignado.
//
// Props:
//   open          -> bool
//   onClose       -> () => void
//   mode          -> 'select' | 'view'
//   businessType  -> string (requerido si mode='view')
//   onSelect      -> (business_type) => Promise<void>  (mode='select')
export default function IntakePreviewModal({ open, onClose, mode = 'select', businessType, onSelect }) {
  const [picked, setPicked] = useState(mode === 'view' ? businessType : null);
  const [confirming, setConfirming] = useState(false);

  if (!open) return null;

  const schema = picked ? INTAKE_SCHEMAS[picked] : null;
  const totalQuestions = schema?.sections.reduce((acc, s) => acc + s.questions.length, 0) || 0;

  const confirm = async () => {
    if (!onSelect || !picked) return;
    setConfirming(true);
    try { await onSelect(picked); onClose(); }
    finally { setConfirming(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl border border-ink-200 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        <header className="px-6 py-4 border-b bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base tracking-tight">
                {mode === 'view' ? 'Cuestionario del cliente' : 'Cuestionario que se enviará al cliente'}
              </h3>
              <p className="text-[11px] text-white/70 leading-tight mt-0.5">
                {mode === 'view'
                  ? 'Estas son las preguntas que el cliente está respondiendo en su portal'
                  : 'El cliente verá estas preguntas en su portal y nos las enviará de vuelta al terminar.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Selector de tipo: solo en mode=select y cuando no hay uno picked todavía */}
        {mode === 'select' && (
          <div className="px-6 py-4 border-b bg-ink-50">
            <div className="text-[10px] font-black uppercase tracking-widest text-ink-500 mb-2">
              {picked ? '1. Cambiar tipo de negocio' : '1. Elige el tipo de negocio del cliente'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {BUSINESS_TYPES.map(bt => {
                const active = picked === bt.key;
                return (
                  <button
                    key={bt.key}
                    type="button"
                    onClick={() => setPicked(bt.key)}
                    className={`text-left rounded-xl border px-3 py-2.5 transition ${
                      active
                        ? 'border-violet-500 bg-violet-50 shadow-sm ring-2 ring-violet-200'
                        : 'border-ink-200 bg-white hover:border-violet-300'
                    }`}
                  >
                    <div className={`text-[11px] font-black uppercase tracking-widest ${active ? 'text-violet-700' : 'text-ink-700'}`}>
                      {bt.label}
                    </div>
                    <div className="text-[10px] text-ink-500 mt-0.5 leading-snug">{bt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Preview del schema escogido */}
        <div className="flex-1 overflow-y-auto scroller px-6 py-5">
          {!schema ? (
            <div className="text-center py-10 text-ink-400">
              <FileQuestion className="w-10 h-10 mx-auto mb-2 text-ink-300" />
              <p className="text-sm">Elige un tipo arriba para ver el cuestionario.</p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-violet-700 mb-1">
                  {mode === 'select' ? '2. Preguntas que recibirá el cliente' : 'Estructura del cuestionario'}
                </div>
                <h4 className="text-lg font-black tracking-tight text-ink-800">{schema.title}</h4>
                <p className="text-[12px] text-ink-500 mt-1 leading-relaxed">{schema.intro}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
                    {schema.sections.length} secciones
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-ink-100 text-ink-600 px-2 py-1 rounded-full">
                    {totalQuestions} preguntas
                  </span>
                </div>
              </div>

              <ol className="space-y-3">
                {schema.sections.map((sec, i) => (
                  <li key={i} className="rounded-xl border border-ink-100 bg-white">
                    <div className="px-4 py-2.5 border-b border-ink-100 bg-ink-50/50 flex items-center justify-between gap-2">
                      <div className="text-xs font-black text-ink-700 truncate">{sec.title}</div>
                      <span className="text-[10px] font-mono text-ink-500 flex-shrink-0">{sec.questions.length} preg.</span>
                    </div>
                    <ul className="px-4 py-2 divide-y divide-ink-50">
                      {sec.questions.map(q => (
                        <li key={q.key} className="py-1.5 flex items-start gap-2 text-[12px]">
                          <ChevronRight className="w-3 h-3 text-violet-400 flex-shrink-0 mt-1" />
                          <div className="flex-1 min-w-0">
                            <span className="text-ink-700 leading-snug">{q.label}</span>
                            {q.required && <span className="text-red-500 font-black ml-1" title="Obligatoria">*</span>}
                            <span className="ml-2 text-[10px] font-mono text-ink-400 uppercase">{q.type}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 border-t bg-ink-50/60 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          {mode === 'select' ? (
            <>
              <div className="flex items-start gap-2 text-[11px] text-violet-700 max-w-md">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>El cliente verá este cuestionario en su portal. Lo responderá ahí y nos lo enviará de vuelta cuando termine. Una vez enviado no se podrá cambiar el tipo.</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={onClose} className="btn-soft">Cancelar</button>
                <button
                  onClick={confirm}
                  disabled={!picked || confirming}
                  className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {confirming ? 'Asignando…' : 'Enviar este cuestionario al cliente'}
                </button>
              </div>
            </>
          ) : (
            <button onClick={onClose} className="btn-soft ml-auto">Cerrar</button>
          )}
        </footer>
      </div>
    </div>
  );
}
