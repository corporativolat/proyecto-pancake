import { useEffect, useState, useRef } from 'react';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth.jsx';

// Tour ligero: spotlight + tooltip anclado a un selector CSS.
// Cada paso: { selector, title, body, placement }
// Persiste avance en profiles.onboarding_step y onboarding_completed.
export default function OnboardingTour({ steps, storageKey = 'portal-tour-skipped', onClose }) {
  const { profile, refresh } = useAuth();
  const [idx, setIdx] = useState(profile?.onboarding_step || 0);
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (idx >= steps.length) return;
    const target = document.querySelector(steps[idx].selector);
    if (!target) { setRect(null); return; }
    const r = target.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [idx, steps]);

  useEffect(() => {
    const onResize = () => {
      const target = document.querySelector(steps[idx]?.selector);
      if (target) {
        const r = target.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [idx, steps]);

  const persistStep = async (newStep, done = false) => {
    if (!profile?.id) return;
    try {
      await supabase.from('profiles').update({
        onboarding_step: newStep,
        onboarding_completed: done,
        onboarding_seen_at: new Date().toISOString()
      }).eq('id', profile.id);
      await refresh();
    } catch { /* silencioso: si falla solo no recordamos avance */ }
  };

  const next = async () => {
    if (idx >= steps.length - 1) return finish();
    const ni = idx + 1;
    setIdx(ni);
    persistStep(ni);
  };
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const finish = async () => {
    await persistStep(steps.length, true);
    if (onClose) onClose();
  };
  const skip = async () => {
    try { localStorage.setItem(storageKey, '1'); } catch { /* noop */ }
    await persistStep(idx, true);
    if (onClose) onClose();
  };

  if (idx >= steps.length) return null;
  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  // Tooltip position: debajo del rect si hay espacio, encima si no.
  let tipTop = (rect?.top ?? window.innerHeight / 2) + (rect?.height ?? 0) + 14;
  let tipLeft = (rect?.left ?? window.innerWidth / 2) + (rect?.width ?? 0) / 2;
  const tipWidth = 320;
  if (tipTop + 200 > window.innerHeight) {
    tipTop = (rect?.top ?? 0) - 200 - 14;
  }
  tipLeft = Math.max(16, Math.min(window.innerWidth - tipWidth - 16, tipLeft - tipWidth / 2));

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Capa oscura con hueco (spotlight) */}
      <div className="absolute inset-0 bg-black/60 transition-opacity pointer-events-auto" onClick={() => {}} style={{
        clipPath: rect
          ? `polygon(
              0 0, 100% 0, 100% 100%, 0 100%, 0 0,
              ${rect.left - 8}px ${rect.top - 8}px,
              ${rect.left - 8}px ${rect.top + rect.height + 8}px,
              ${rect.left + rect.width + 8}px ${rect.top + rect.height + 8}px,
              ${rect.left + rect.width + 8}px ${rect.top - 8}px,
              ${rect.left - 8}px ${rect.top - 8}px
            )`
          : undefined
      }} />
      {/* Marco del spotlight */}
      {rect && (
        <div className="absolute border-2 border-emerald-400 rounded-2xl pointer-events-none animate-pulse"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }} />
      )}
      {/* Tooltip */}
      <div ref={tooltipRef}
        className="absolute bg-white rounded-2xl shadow-2xl p-5 pointer-events-auto"
        style={{ top: tipTop, left: tipLeft, width: tipWidth }}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-black text-sm">{step.title}</h3>
          <button onClick={skip} className="text-ink-300 hover:text-ink-600"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[12px] text-ink-600 leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold text-ink-400 tabular">{idx + 1} / {steps.length}</div>
          <div className="flex gap-2">
            {idx > 0 && (
              <button onClick={prev} className="btn-soft text-[11px]"><ArrowLeft className="w-3 h-3" /> Atrás</button>
            )}
            {isLast ? (
              <button onClick={finish} className="btn-emerald text-[11px]"><Check className="w-3 h-3" /> Terminar</button>
            ) : (
              <button onClick={next} className="btn-emerald text-[11px]">Siguiente <ArrowRight className="w-3 h-3" /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
