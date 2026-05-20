import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowRight, X, AlertTriangle } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { reduced } from '../lib/motion';
import { BUSINESS_TYPE_LABEL } from '../lib/intakeSchemas.js';

// Banner del portal cliente: avisa que hay cuestionarios de intake
// pendientes (status borrador o rechazado). Cliquear lleva al primer
// proyecto pendiente.
//
// Es independiente del banner de documentos para que ambos puedan
// convivir en el dashboard.
export default function IntakePendingBanner() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('pending-intake-dismissed') === '1'; } catch { return false; }
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!profile?.id || dismissed) return;
    let cancelled = false;
    (async () => {
      // Buscamos proyectos donde el cliente es el actual y traemos su intake
      // (si está en borrador/rechazado).
      const { data: ps } = await supabase
        .from('projects')
        .select('id, title, business_type')
        .eq('client_id', profile.id)
        .not('business_type', 'is', null);
      const projects = ps || [];
      if (projects.length === 0) { if (!cancelled) setRows([]); return; }
      const ids = projects.map(p => p.id);
      const { data: forms } = await supabase
        .from('intake_forms')
        .select('id, project_id, status')
        .in('project_id', ids)
        .in('status', ['borrador', 'rechazado']);
      const formsByProject = new Map((forms || []).map(f => [f.project_id, f]));
      const list = projects
        .map(p => ({ ...p, intake: formsByProject.get(p.id) }))
        .filter(p => p.intake);
      if (!cancelled) setRows(list);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, dismissed]);

  useEffect(() => {
    if (dismissed || rows.length === 0 || reduced || !ref.current) return;
    gsap.fromTo(ref.current, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
  }, [rows.length, dismissed]);

  if (dismissed || rows.length === 0) return null;

  const rejected = rows.filter(r => r.intake.status === 'rechazado').length;
  const drafts   = rows.length - rejected;

  const close = () => {
    try { sessionStorage.setItem('pending-intake-dismissed', '1'); } catch { /* noop */ }
    setDismissed(true);
  };

  const goFirst = () => {
    const first = rows.find(r => r.intake.status === 'rechazado') || rows[0];
    navigate('/portal/projects/' + first.id);
  };

  return (
    <div ref={ref}
      className="relative mb-6 rounded-2xl overflow-hidden border border-violet-200/70 bg-gradient-to-br from-violet-50 via-violet-50/80 to-fuchsia-50 shadow-sm">
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 animate-[gradient-shift_4s_ease_infinite] bg-[length:200%_100%]" />
      <button onClick={close}
        className="absolute top-3 right-3 w-7 h-7 rounded-lg text-violet-700/70 hover:text-violet-900 hover:bg-violet-100 flex items-center justify-center transition z-10"
        title="Cerrar">
        <X className="w-4 h-4" />
      </button>

      <div className="p-5 md:p-6 flex flex-col md:flex-row gap-5">
        <div className="flex md:flex-col items-start md:items-center gap-3 md:w-32 flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center shadow-inner relative">
            <ClipboardList className="w-7 h-7" />
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-[11px] font-black flex items-center justify-center shadow-lg tabular">
              {rows.length}
            </span>
          </div>
          <div className="md:text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Acción requerida</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-black text-base md:text-lg text-violet-900 mb-1 tracking-tight">Cuestionario(s) por completar</h3>
          <p className="text-[12px] text-violet-800 mb-3 leading-relaxed">
            Tienes <strong className="text-violet-900">{rows.length}</strong> cuestionario(s) inicial(es) por enviar
            {rejected > 0 && <> · <span className="font-black text-amber-700">{rejected} con observaciones</span></>}
            {drafts > 0 && rejected > 0 && <> · </>}
            {drafts > 0 && <span className="font-black">{drafts} en borrador</span>}
            . Completar el cuestionario nos permite arrancar la construcción de tu bot.
          </p>

          <ul className="space-y-1.5 mb-4 max-h-40 overflow-y-auto pr-2 scroller">
            {rows.slice(0, 5).map(r => (
              <li key={r.id} className="flex items-center gap-2.5 text-[12px] bg-white/60 backdrop-blur rounded-lg px-3 py-2 border border-violet-100">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.intake.status === 'rechazado' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-violet-500'}`} />
                <span className="font-bold text-violet-900 truncate flex-1">{r.title}</span>
                <span className="text-[10px] text-violet-600 italic truncate hidden md:inline">
                  {BUSINESS_TYPE_LABEL[r.business_type]}
                </span>
                {r.intake.status === 'rechazado' && (
                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex-shrink-0 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> Revisar
                  </span>
                )}
              </li>
            ))}
            {rows.length > 5 && (
              <li className="text-[10px] text-violet-700 italic px-3">…y {rows.length - 5} más</li>
            )}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={goFirst} className="btn-primary text-xs">
              Ir al cuestionario <ArrowRight className="w-3 h-3" />
            </button>
            <button onClick={close} className="btn-soft text-xs">Recordar luego</button>
          </div>
        </div>
      </div>
    </div>
  );
}
