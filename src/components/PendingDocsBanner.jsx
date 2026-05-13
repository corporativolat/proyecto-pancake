import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileWarning, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { supabase } from '../lib/supabase';

// Banner popup que aparece en el dashboard del cliente cuando hay
// documentos en estado 'pendiente' o 'rechazado'. Muestra checklist
// resumida y CTA a /portal/documents.
export default function PendingDocsBanner() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('pending-docs-dismissed') === '1'; } catch { return false; }
  });

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

  if (dismissed || docs.length === 0) return null;

  const pendientes = docs.filter(d => d.status === 'pendiente').length;
  const rechazados = docs.filter(d => d.status === 'rechazado').length;
  const total = pendientes + rechazados;

  const close = () => {
    try { sessionStorage.setItem('pending-docs-dismissed', '1'); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 relative">
      <button onClick={close} className="absolute top-3 right-3 text-amber-700 hover:text-amber-900"><X className="w-4 h-4" /></button>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
          <FileWarning className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-sm text-amber-900 mb-1">Documentos pendientes</h3>
          <p className="text-[12px] text-amber-800 mb-3 leading-relaxed">
            Tienes <strong>{total}</strong> documento(s) por entregar
            {rechazados > 0 && <> ({rechazados} requieren ser re-enviados)</>}.
            Súbelos cuando puedas para avanzar tu proyecto.
          </p>
          <ul className="space-y-1 mb-4 max-h-32 overflow-y-auto">
            {docs.slice(0, 5).map(d => (
              <li key={d.id} className="text-[11px] text-amber-900 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${d.status === 'rechazado' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <span className="font-bold">{d.name}</span>
                {d.status === 'rechazado' && <span className="text-[9px] uppercase tracking-widest bg-red-100 text-red-700 px-1.5 py-0.5 rounded">re-subir</span>}
              </li>
            ))}
            {docs.length > 5 && <li className="text-[10px] text-amber-700 italic">…y {docs.length - 5} más</li>}
          </ul>
          <button onClick={() => navigate('/portal/documents')} className="btn-emerald text-xs">
            Ir a Documentos <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
