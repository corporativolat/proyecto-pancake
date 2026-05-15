import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, CheckCircle2, XCircle, Clock, AlertCircle, Plus, X, Download } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { reduced } from '../../lib/motion';

const STATUS = {
  pendiente:  { label: 'Pendiente',  icon: Clock,        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  enviado:    { label: 'En revisión', icon: AlertCircle, cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  aprobado:   { label: 'Aprobado',   icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rechazado:  { label: 'Rechazado',  icon: XCircle,      cls: 'bg-red-100 text-red-700 border-red-200' }
};

const MAX_MB = 25;

export default function PortalDocuments() {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const [docs, setDocs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [adhocFor, setAdhocFor] = useState(null);
  const rootRef = useRef(null);

  const load = async () => {
    const { data: ps } = await supabase.from('projects').select('id, title, status').eq('client_id', profile.id);
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
    const ch = supabase
      .channel(`portal-docs-${profile.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'documents' }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'projects', filter: `client_id=eq.${profile.id}` }, () => { if (!cancelled) load(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    if (loading || reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-fade-h]', { y: 12, opacity: 0, duration: 0.5, ease: 'power3.out' });
      gsap.from('[data-fade-card]', { y: 18, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.07, delay: 0.1 });
    }, rootRef);
    return () => ctx.revert();
  }, [loading]);

  const uploadFile = async ({ doc, file, projectId, name }) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      showToast(`Archivo supera ${MAX_MB} MB`, 'error');
      return;
    }
    const opId = doc?.id || `adhoc-${projectId}`;
    setBusyId(opId);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      let docId = doc?.id;

      // Si es ad-hoc, primero crea la fila del documento
      if (!docId) {
        const finalName = name?.trim() || file.name.replace(/\.[^.]+$/, '');
        const { data: created, error: insErr } = await supabase
          .from('documents')
          .insert({
            project_id: projectId,
            name: finalName,
            kind: 'otro',
            status: 'pendiente',
            required: false,
            uploaded_by: profile.id
          })
          .select()
          .single();
        if (insErr) throw insErr;
        docId = created.id;
      }

      const path = `${projectId}/${docId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase.from('documents').update({
        file_path: path,
        status: 'enviado',
        uploaded_by: profile.id
      }).eq('id', docId);
      if (updErr) throw updErr;

      showToast('Documento enviado', 'success');
      setAdhocFor(null);
      await load();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const downloadOwn = async (doc) => {
    if (!doc.file_path) return;
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 300);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  if (loading) return <DocumentsSkeleton />;

  const grouped = projects.map(p => ({
    project: p,
    docs: docs.filter(d => d.project_id === p.id)
  }));

  return (
    <section ref={rootRef} className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl">
      <header className="mb-6" data-fade-h>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-ink-400 mb-2">Portal cliente</div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Documentos</h1>
        <p className="text-sm text-ink-500 mt-1">Sube los archivos de tu proyecto. Tu equipo los revisará.</p>
      </header>

      {projects.length === 0 ? (
        <div className="card-light p-12 text-center" data-fade-card>
          <div className="empty">
            <div className="icon-wrap"><FileText className="w-8 h-8 text-emerald-600" /></div>
            <h3 className="font-black text-sm mb-1 text-ink-700">Sin proyectos asignados</h3>
            <p className="text-xs text-ink-500 max-w-xs mx-auto">Cuando tu equipo te asigne un proyecto, podrás subir documentos aquí.</p>
          </div>
        </div>
      ) : grouped.map(g => (
        <div key={g.project.id} className="card-light overflow-hidden mb-5" data-fade-card>
          <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-emerald-50/40 to-transparent">
            <div className="min-w-0">
              <h2 className="font-black text-sm truncate">{g.project.title}</h2>
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mt-0.5">
                {g.docs.length} documento{g.docs.length !== 1 ? 's' : ''}
              </div>
            </div>
            <button onClick={() => setAdhocFor(g.project.id)} className="btn-emerald text-xs">
              <Plus className="w-3.5 h-3.5" /> Subir documento
            </button>
          </div>

          {adhocFor === g.project.id && (
            <AdhocUploader
              projectId={g.project.id}
              busy={busyId === `adhoc-${g.project.id}`}
              onCancel={() => setAdhocFor(null)}
              onSubmit={(file, name) => uploadFile({ file, projectId: g.project.id, name })}
            />
          )}

          {g.docs.length === 0 && adhocFor !== g.project.id ? (
            <div className="px-6 py-10 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs text-ink-500">Aún no has subido nada. Usa el botón <strong className="text-emerald-700">+ Subir documento</strong>.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {g.docs.map(d => {
                const s = STATUS[d.status] || STATUS.pendiente;
                const StIcon = s.icon;
                return (
                  <li key={d.id} className="px-5 py-4 flex items-start gap-4 flex-wrap hover:bg-ink-50 transition">
                    <div className="w-10 h-10 rounded-xl bg-ink-100 text-ink-600 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                        <span className="truncate">{d.name}</span>
                        {d.required && <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-1.5 py-0.5 rounded">obligatorio</span>}
                      </div>
                      <div className={`inline-flex items-center gap-1.5 mt-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${s.cls}`}>
                        <StIcon className="w-3 h-3" /> {s.label}
                      </div>
                      {d.review_comment && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <div className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-0.5">Comentario del equipo</div>
                          <p className="text-[11px] text-amber-900 italic leading-snug">&ldquo;{d.review_comment}&rdquo;</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {d.file_path && (
                        <button onClick={() => downloadOwn(d)} className="btn-soft text-xs" title="Ver archivo subido">
                          <Download className="w-3 h-3" />
                        </button>
                      )}
                      {(d.status === 'pendiente' || d.status === 'rechazado') && (
                        <label className="btn-emerald cursor-pointer text-xs">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{busyId === d.id ? 'Subiendo…' : (d.status === 'rechazado' ? 'Re-subir' : 'Subir')}</span>
                          <input type="file" className="hidden" disabled={busyId === d.id}
                            onChange={e => uploadFile({ doc: d, file: e.target.files?.[0], projectId: d.project_id })} />
                        </label>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

function AdhocUploader({ busy, onCancel, onSubmit }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [drag, setDrag] = useState(false);

  const onPick = (f) => {
    setFile(f);
    if (!name && f) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!file) return;
    onSubmit(file, name);
  };

  return (
    <form onSubmit={submit} className="border-b bg-gradient-to-br from-emerald-50/40 to-teal-50/40 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-emerald-700">Nuevo documento</h3>
        <button type="button" onClick={onCancel} className="text-ink-400 hover:text-ink-700 p-1 rounded-lg hover:bg-white transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      <label
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); onPick(e.dataTransfer.files?.[0]); }}
        className={`block cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/50'}`}
      >
        <input type="file" className="hidden" onChange={e => onPick(e.target.files?.[0])} />
        {file ? (
          <div>
            <FileText className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
            <div className="text-sm font-bold text-ink-800 truncate">{file.name}</div>
            <div className="text-[10px] font-mono text-ink-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</div>
            <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} className="text-[10px] font-bold text-emerald-700 hover:underline mt-2">Cambiar archivo</button>
          </div>
        ) : (
          <div>
            <Upload className="w-8 h-8 mx-auto text-emerald-600 mb-2" />
            <div className="text-sm font-bold text-ink-800">Arrastra un archivo o haz clic</div>
            <div className="text-[10px] text-ink-500 mt-1">Máx {MAX_MB} MB</div>
          </div>
        )}
      </label>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Nombre del documento</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Cédula representante legal" className="input-light" />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-soft flex-1 justify-center text-xs">Cancelar</button>
        <button type="submit" disabled={!file || busy} className="btn-emerald flex-1 justify-center text-xs disabled:opacity-60">
          {busy ? 'Subiendo…' : 'Enviar documento'}
        </button>
      </div>
    </form>
  );
}

function DocumentsSkeleton() {
  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl">
      <div className="h-3 w-32 shimmer-skel rounded mb-3" />
      <div className="h-10 w-64 shimmer-skel rounded-lg mb-2" />
      <div className="h-4 w-72 shimmer-skel rounded mb-8" />
      {[1, 2].map(i => (
        <div key={i} className="card-light p-5 mb-5 space-y-4">
          <div className="h-5 w-1/2 shimmer-skel rounded" />
          <div className="flex gap-3">
            <div className="w-10 h-10 shimmer-skel rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/5 shimmer-skel rounded" />
              <div className="h-3 w-24 shimmer-skel rounded" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
