import { useEffect, useRef, useState } from 'react';
import { FileText, Download, Check, XCircle, Clock, AlertCircle, CheckCircle2, MessageSquare, User } from 'lucide-react';
import gsap from 'gsap';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import { reduced } from '../lib/motion';
import Modal from './Modal.jsx';

const STATUS = {
  pendiente:  { label: 'Pendiente',  icon: Clock,        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  enviado:    { label: 'Por revisar', icon: AlertCircle, cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  aprobado:   { label: 'Aprobado',   icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rechazado:  { label: 'Rechazado',  icon: XCircle,      cls: 'bg-red-100 text-red-700 border-red-200' }
};

export default function ClientDocsPanel({ projectId }) {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const profiles = useStore(s => s.profiles);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | enviado | aprobado | rechazado | pendiente
  const [rejecting, setRejecting] = useState(null);
  const rootRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    setDocs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`docs-panel-${projectId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'documents', filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (loading || reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-fade-doc]', { y: 12, opacity: 0, duration: 0.4, ease: 'power3.out', stagger: 0.05 });
    }, rootRef);
    return () => ctx.revert();
  }, [loading, docs.length]);

  const filtered = docs.filter(d => filter === 'all' || d.status === filter);
  const pendingReview = docs.filter(d => d.status === 'enviado').length;

  const download = async (d) => {
    if (!d.file_path) { showToast('Aún sin archivo subido', 'info'); return; }
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.file_path, 300);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const approve = async (d) => {
    const ok = await askConfirm({
      title: 'Aprobar documento',
      message: `Marcar "${d.name}" como aprobado. El cliente recibirá una notificación.`
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from('documents').update({
        status: 'aprobado',
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_comment: null
      }).eq('id', d.id);
      if (error) throw error;
      showToast('Documento aprobado', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  return (
    <section ref={rootRef} className="card-light overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-violet-50/40 to-transparent">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> Documentos del cliente
            {pendingReview > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 bg-blue-600 text-white rounded-full">
                {pendingReview} por revisar
              </span>
            )}
          </h2>
          <p className="text-[10px] text-ink-400 mt-0.5">El cliente sube archivos desde su portal. Aquí los revisas y apruebas o rechazas.</p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {[['all', `Todos (${docs.length})`], ['enviado', `Por revisar (${pendingReview})`], ['aprobado', 'Aprobados'], ['rechazado', 'Rechazados'], ['pendiente', 'Pendientes']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full transition ${filter === k ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-5 space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="flex gap-3">
              <div className="w-10 h-10 rounded-xl shimmer-skel" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 shimmer-skel rounded" />
                <div className="h-3 w-1/4 shimmer-skel rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-ink-100 text-ink-400 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
          <p className="text-xs text-ink-500">
            {filter === 'all' ? 'El cliente no ha subido documentos todavía.' : 'Sin documentos en este filtro.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {filtered.map(d => {
            const s = STATUS[d.status] || STATUS.pendiente;
            const StIcon = s.icon;
            const uploader = profiles.find(p => p.id === d.uploaded_by);
            return (
              <li key={d.id} data-fade-doc className="px-5 py-4 hover:bg-ink-50 transition">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                      <span className="truncate">{d.name}</span>
                      {d.required && <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-1.5 py-0.5 rounded">obligatorio</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${s.cls}`}>
                        <StIcon className="w-3 h-3" /> {s.label}
                      </span>
                      {uploader && (
                        <span className="text-[10px] text-ink-500 flex items-center gap-1">
                          <User className="w-3 h-3" /> {uploader.name}
                        </span>
                      )}
                      <span className="text-[10px] text-ink-400 font-mono tabular">{formatDate(d.created_at)}</span>
                    </div>
                    {d.review_comment && (
                      <div className="mt-2 bg-red-50/60 border border-red-200 rounded-lg px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-widest text-red-700 mb-0.5 flex items-center gap-1">
                          <MessageSquare className="w-2.5 h-2.5" /> Comentario al rechazar
                        </div>
                        <p className="text-[11px] text-red-900 italic leading-snug">&ldquo;{d.review_comment}&rdquo;</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {d.file_path && (
                      <button onClick={() => download(d)} className="btn-soft text-xs" title="Descargar">
                        <Download className="w-3 h-3" /> Ver
                      </button>
                    )}
                    {d.status === 'enviado' && (
                      <>
                        <button onClick={() => approve(d)} className="btn-emerald text-xs">
                          <Check className="w-3 h-3" /> Aprobar
                        </button>
                        <button onClick={() => setRejecting(d)} className="btn-danger text-xs">
                          <XCircle className="w-3 h-3" /> Rechazar
                        </button>
                      </>
                    )}
                    {d.status === 'aprobado' && (
                      <button onClick={() => setRejecting(d)} className="text-[10px] font-bold text-ink-400 hover:text-red-600 transition">
                        Revertir
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rejecting && (
        <RejectModal doc={rejecting} reviewerId={profile.id} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); showToast('Documento rechazado', 'success'); }} />
      )}
    </section>
  );
}

function RejectModal({ doc, reviewerId, onClose, onDone }) {
  const showToast = useToast(s => s.show);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) { showToast('Escribe un comentario para el cliente', 'error'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('documents').update({
        status: 'rechazado',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        review_comment: comment.trim()
      }).eq('id', doc.id);
      if (error) throw error;
      onDone();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Rechazar: ${doc.name}`} onClose={onClose} footer={<></>}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-ink-500 leading-relaxed">
          El cliente recibirá una notificación y deberá re-subir el documento. Incluye un comentario explicando qué corregir.
        </p>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Motivo / instrucciones *</label>
          <textarea required value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Ej: La cédula está borrosa. Adjunta una versión escaneada legible."
            className="input-light h-28 resize-none w-full" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-soft flex-1 justify-center">Cancelar</button>
          <button type="submit" disabled={busy} className="btn-danger flex-1 justify-center disabled:opacity-60">
            {busy ? 'Rechazando…' : 'Rechazar documento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days}d`;
  return d.toLocaleDateString();
}
