import { useEffect, useState } from 'react';
import { Upload, FileText, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';

const STATUS = {
  pendiente:  { label: 'Pendiente', icon: Clock,        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  enviado:    { label: 'En revisión', icon: AlertCircle, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  aprobado:   { label: 'Aprobado',  icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rechazado:  { label: 'Rechazado', icon: XCircle,      cls: 'bg-red-50 text-red-700 border-red-200' }
};

export default function PortalDocuments() {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const [docs, setDocs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    const { data: ps } = await supabase.from('projects').select('id, title').eq('client_id', profile.id);
    setProjects(ps || []);
    const ids = (ps || []).map(p => p.id);
    if (!ids.length) { setDocs([]); setLoading(false); return; }
    const { data: ds } = await supabase
      .from('documents')
      .select('*')
      .in('project_id', ids)
      .order('created_at', { ascending: false });
    setDocs(ds || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const handleUpload = async (doc, file) => {
    if (!file) return;
    setBusyId(doc.id);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${doc.project_id}/${doc.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from('documents').update({
        file_path: path,
        status: 'enviado',
        uploaded_by: profile.id
      }).eq('id', doc.id);
      if (updErr) throw updErr;
      showToast('Documento enviado', 'success');
      await load();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="p-10 text-ink-400">Cargando…</div>;

  const grouped = projects.map(p => ({
    project: p,
    docs: docs.filter(d => d.project_id === p.id)
  })).filter(g => g.docs.length > 0);

  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Documentos</h1>
        <p className="text-sm text-ink-500 mt-1">Sube y revisa los documentos solicitados por proyecto.</p>
      </header>

      {grouped.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center text-ink-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No hay documentos solicitados.</p>
        </div>
      ) : grouped.map(g => (
        <div key={g.project.id} className="bg-white border rounded-2xl mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b bg-ink-50/50">
            <h2 className="font-black text-sm">{g.project.title}</h2>
          </div>
          <ul className="divide-y">
            {g.docs.map(d => {
              const s = STATUS[d.status] || STATUS.pendiente;
              return (
                <li key={d.id} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate flex items-center gap-2">
                      {d.name}
                      {d.required && <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-1.5 py-0.5 rounded">obligatorio</span>}
                    </div>
                    <div className={`inline-flex items-center gap-1.5 mt-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${s.cls}`}>
                      <s.icon className="w-3 h-3" /> {s.label}
                    </div>
                    {d.review_comment && (
                      <p className="text-[11px] text-ink-500 mt-2 italic">&ldquo;{d.review_comment}&rdquo;</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(d.status === 'pendiente' || d.status === 'rechazado') && (
                      <label className="btn-emerald cursor-pointer text-xs">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{busyId === d.id ? 'Subiendo…' : (d.status === 'rechazado' ? 'Re-subir' : 'Subir')}</span>
                        <input type="file" className="hidden" disabled={busyId === d.id}
                          onChange={e => handleUpload(d, e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
