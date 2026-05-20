import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { intakeProgress } from '../lib/intakeSchemas.js';

// Render genérico del cuestionario de intake.
//
// Props:
//   schema      -> objeto retornado por getIntakeSchema(business_type)
//   answers     -> { [questionKey]: string | string[] }
//   onChange    -> (key, value) => void   (ignorado si readOnly)
//   readOnly    -> bool: si true, muestra los inputs deshabilitados
//   showProgress-> bool: si true, muestra barra de avance arriba
//   accent      -> 'violet' | 'emerald' (color de acento)
//
// IMPORTANTE: el componente no llama a Supabase. Es responsabilidad
// del padre persistir `answers` con saveIntakeAnswers().
export default function IntakeForm({
  schema,
  answers,
  onChange,
  readOnly = false,
  showProgress = true,
  accent = 'violet'
}) {
  const progress = useMemo(() => intakeProgress(schema, answers), [schema, answers]);

  if (!schema) {
    return (
      <div className="rounded-2xl border border-ink-200 bg-ink-50 px-5 py-6 text-center text-sm text-ink-500">
        Selecciona un tipo de negocio para ver el cuestionario.
      </div>
    );
  }

  const set = (key, value) => { if (!readOnly && onChange) onChange(key, value); };

  const accentText = accent === 'emerald' ? 'text-emerald-700' : 'text-violet-700';
  const accentBg   = accent === 'emerald' ? 'bg-emerald-500'   : 'bg-violet-600';
  const accentSoft = accent === 'emerald' ? 'bg-emerald-50 border-emerald-100' : 'bg-violet-50 border-violet-100';

  return (
    <div className="space-y-6">
      {schema.intro && (
        <p className={`text-[12px] leading-relaxed px-4 py-2.5 rounded-xl border ${accentSoft} ${accentText}`}>
          {schema.intro}
        </p>
      )}

      {showProgress && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-ink-500 w-20">Avance</span>
          <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
            <div className={`h-full ${accentBg} transition-all duration-500`} style={{ width: progress.percent + '%' }} />
          </div>
          <span className={`text-xs font-black tabular w-24 text-right ${accentText}`}>
            {progress.answered}/{progress.total} · {progress.percent}%
          </span>
        </div>
      )}

      {schema.sections.map((sec, sIdx) => (
        <section key={sIdx} className="rounded-2xl border border-ink-100 bg-white shadow-sm overflow-hidden">
          <header className={`px-5 py-3 border-b ${accentSoft}`}>
            <h3 className={`text-xs font-black uppercase tracking-widest ${accentText}`}>{sec.title}</h3>
          </header>
          <div className="p-5 space-y-4">
            {sec.questions.map(q => (
              <Field key={q.key} q={q} value={answers?.[q.key]} onChange={(v) => set(q.key, v)} readOnly={readOnly} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Field({ q, value, onChange, readOnly }) {
  const filled = (() => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  })();

  return (
    <div>
      <div className="flex items-start gap-2 mb-1.5">
        <label className="flex-1 text-[12px] font-bold text-ink-700 leading-snug">
          {q.label}
          {q.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {filled && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />}
      </div>
      {q.help && <p className="text-[11px] text-ink-400 italic mb-2 leading-snug">{q.help}</p>}
      <Input q={q} value={value} onChange={onChange} readOnly={readOnly} />
    </div>
  );
}

function Input({ q, value, onChange, readOnly }) {
  const baseCls = 'input-light';
  switch (q.type) {
    case 'textarea':
      return (
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={q.placeholder || ''}
          className={`${baseCls} min-h-[80px] resize-y disabled:opacity-80 disabled:bg-ink-50`}
        />
      );

    case 'select':
      return (
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={readOnly}
          className={`${baseCls} disabled:opacity-80 disabled:bg-ink-50`}
        >
          <option value="">— Seleccionar —</option>
          {(q.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );

    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (opt) => {
        if (readOnly) return;
        const next = arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt];
        onChange(next);
      };
      return (
        <div className="flex flex-wrap gap-1.5">
          {(q.options || []).map(opt => {
            const active = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={readOnly}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition ${
                  active
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-violet-400 hover:text-violet-700'
                } disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:border-ink-200`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    case 'yesno':
      return (
        <div className="flex gap-2">
          {['Sí', 'No'].map(opt => {
            const active = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => !readOnly && onChange(opt)}
                disabled={readOnly}
                className={`text-[11px] font-bold px-4 py-1.5 rounded-lg border transition ${
                  active
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-ink-600 border-ink-200 hover:border-violet-400'
                } disabled:opacity-70 disabled:cursor-not-allowed`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );

    case 'text':
    default:
      return (
        <input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={readOnly}
          placeholder={q.placeholder || ''}
          className={`${baseCls} disabled:opacity-80 disabled:bg-ink-50`}
        />
      );
  }
}
