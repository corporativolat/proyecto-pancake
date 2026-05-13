import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileWarning, ArrowRight, X, AlertTriangle } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';
import { reduced } from '../lib/motion';

export default function PendingDocsBanner() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('pending-docs-dismissed') === '1'; } catch { return false; }
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!profile?.id || dismissed) return;
    let cancelled = false;
    (async () => {
      const { data: ps } = await supabase.from('projects').select('id').eq('client_id', profile.id);
      const ids = (ps || []).map(p => p.id);
      if (!ids.length) return;
      const { data: ds } = await supabase
        .from('documents')
        .select('id, name, status, project_id')
        .in('project_id', ids)
        .in('status', ['pendiente', 'rechazado']);
      if (!cancelled) setDocs(ds || []);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, dismissed]);

  useEffect(() => {
    if (dismissed || docs.length === 0 || reduced || !ref.current) return;
    gsap.fromTo(ref.current, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out' });
  }, [docs.length, dismissed]);

  if (dismissed || docs.length === 0) return null;

  const pendientes = docs.filter(d => d.status === 'pendiente').length;
  const rechazados = docs.filter(d => d.status === 'rechazado').length;
  const total = pendientes + rechazados;

  const close = () => {
    try { sessionStorage.setItem('pending-docs-dismissed', '1'); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <div ref={ref}
      className="relative mb-6 rounded-2xl overflow-hidden border border-amber-200/70 bg-gradient-to-br from-amber-50 via-amber-50/80 to-orange-50 shadow-sm">
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 animate-[gradient-shift_4s_ease_infinite] bg-[length:200%_100%]" />
      <button onClick={close}
        className="absolute top-3 right-3 w-7 h-7 rounded-lg text-amber-700/70 hover:text-amber-900 hover:bg-amber-100 flex items-center justify-center transition z-10"
        title="Cerrar">
        <X className="w-4 h-4" />
      </button>

      <div className="p-5 md:p-6 flex flex-col md:flex-row gap-5">
        <div className="flex md:flex-col items-start md:items-center gap-3 md:w-32 flex-shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-inner relative">
            <FileWarning className="w-7 h-7" />
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[11px] font-black flex items-center justify-center shadow-lg shadow-red-500/30 tabular">
              {total > 99 ? '99+' : total}
            </span>
          </div>
          <div className="md:text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Acción requerida</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-black text-base md:text-lg text-amber-900 mb-1 tracking-tight">Documentos pendientes</h3>
          <p className="text-[12px] text-amber-800 mb-3 leading-relaxed">
            Tienes <strong className="text-amber-900">{total}</strong> documento(s) por entregar
            {rechazados > 0 && <> · <span className="font-black text-red-700">{rechazados} requieren re-envío</span></>}
            . Súbelos cuando puedas para avanzar tu proyecto.
          </p>

          <ul className="space-y-1.5 mb-4 max-h-40 overflow-y-auto pr-2 scroller">
            {docs.slice(0, 5).map(d => (
              <li key={d.id} className="flex items-center gap-2.5 text-[12px] bg-white/60 backdrop-blur rounded-lg px-3 py-2 border border-amber-100">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${d.status === 'rechazado' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-amber-500'}`} />
                <span className="font-bold text-amber-900 truncate flex-1">{d.name}</span>
                {d.status === 'rechazado' && (
                  <span className="text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-700 px-1.5 py-0.5 rounded flex-shrink-0 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> Re-subir
                  </span>
                )}
              </li>
            ))}
            {docs.length > 5 && (
              <li className="text-[10px] text-amber-700 italic px-3">…y {docs.length - 5} más</li>
            )}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => navigate('/portal/documents')} className="btn-emerald text-xs">
              Ir a Documentos <ArrowRight className="w-3 h-3" />
            </button>
            <button onClick={close} className="btn-soft text-xs">Recordar luego</button>
          </div>
        </div>
      </div>
    </div>
  );
}
