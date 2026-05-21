import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Flag, FileText, MessageSquare, Upload, Plus, X, Download, CheckCircle2, XCircle, Clock, AlertCircle, Layers, Truck, PlayCircle, MapPin, ListTodo, AlertTriangle, BarChart3 } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { reduced } from '../../lib/motion';
import { calcPhaseProgress, calcProjectProgress, taskProgress } from '../../lib/utils';
import { listClientTasks, deliverClientTask, signedUrlForTaskFile, priorityMeta, statusMeta, dueRelative } from '../../lib/clientTasks';
import PortalIntakeSection from '../../components/PortalIntakeSection.jsx';
import GanttCanvas from '../../components/Gantt.jsx';

const STATUS_COLOR = {
  'No iniciado':  'bg-ink-100 text-ink-600',
  'En progreso':  'bg-violet-100 text-violet-700',
  'Pausado':      'bg-amber-100 text-amber-700',
  'En revisión':  'bg-blue-100 text-blue-700',
  'Finalizado':   'bg-emerald-100 text-emerald-700'
};

const DOC_STATUS = {
  pendiente:  { label: 'Pendiente',  icon: Clock,        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  enviado:    { label: 'En revisión', icon: AlertCircle, cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  aprobado:   { label: 'Aprobado',   icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rechazado:  { label: 'Rechazado',  icon: XCircle,      cls: 'bg-red-100 text-red-700 border-red-200' }
};

const MAX_MB = 25;

export default function PortalProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);

  const [project, setProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [docs, setDocs] = useState([]);
  const [clientTasks, setClientTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const rootRef = useRef(null);
  const ganttScrollRef = useRef(null);

  const load = async () => {
    const [{ data: pj }, { data: ph }, { data: ms }, { data: ds }, ctRaw] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('phases').select('id, name, position, start_week, start_day, duration_weeks, duration_days, tasks(id, name, progress, completed, position, start_week, start_day, duration)').eq('project_id', id).order('position'),
      supabase.from('milestones').select('id, name, target_date, completed, color').eq('project_id', id).order('target_date'),
      supabase.from('documents').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      listClientTasks(id).catch(() => [])
    ]);
    setProject(pj);
    setPhases((ph || []).map(p => ({
      ...p,
      tasks: (p.tasks || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0)),
    })));
    setMilestones(ms || []);
    setDocs(ds || []);
    setClientTasks(ctRaw || []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    const ch = supabase
      .channel(`portal-pj-${id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'client_tasks', filter: `project_id=eq.${id}` }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'projects', filter: `id=eq.${id}` }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'phases', filter: `project_id=eq.${id}` }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'tasks' }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'milestones', filter: `project_id=eq.${id}` }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'documents', filter: `project_id=eq.${id}` }, () => { if (!cancelled) load(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (loading || reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-fade-h]', { y: 12, opacity: 0, duration: 0.5, ease: 'power3.out' });
      gsap.from('[data-fade-card]', { y: 16, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08, delay: 0.1 });
    }, rootRef);
    return () => ctx.revert();
  }, [loading]);

  const uploadFile = async ({ doc, file, name }) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { showToast(`Archivo supera ${MAX_MB} MB`, 'error'); return; }
    const opId = doc?.id || 'adhoc';
    setBusyId(opId);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      let docId = doc?.id;

      if (!docId) {
        const finalName = name?.trim() || file.name.replace(/\.[^.]+$/, '');
        const { data: created, error: insErr } = await supabase
          .from('documents')
          .insert({
            project_id: id,
            name: finalName,
            kind: 'otro',
            status: 'pendiente',
            required: false,
            uploaded_by: profile.id
          })
          .select().single();
        if (insErr) throw insErr;
        docId = created.id;
      }

      const path = `${id}/${docId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase.from('documents').update({
        file_path: path,
        status: 'enviado',
        uploaded_by: profile.id
      }).eq('id', docId);
      if (updErr) throw updErr;

      showToast('Documento enviado', 'success');
      setAdhocOpen(false);
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

  const deliverTask = async ({ task, file }) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) { showToast(`Archivo supera ${MAX_MB} MB`, 'error'); return; }
    setBusyId('ct-' + task.id);
    try {
      await deliverClientTask({ task, file });
      showToast('Entrega enviada — tu equipo fue notificado', 'success');
      await load();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const downloadTaskFile = async (task) => {
    if (!task.file_path) return;
    try {
      const url = await signedUrlForTaskFile(task.file_path, 300);
      window.open(url, '_blank', 'noopener');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  if (loading) return <DetailSkeleton />;
  if (!project) return (
    <div className="p-10">
      <button onClick={() => navigate('/portal/projects')} className="text-emerald-700 font-bold text-sm flex items-center gap-2 mb-4"><ArrowLeft className="w-4 h-4" /> Volver</button>
      <p className="text-ink-400">Proyecto no encontrado o sin acceso.</p>
    </div>
  );

  return (
    <section ref={rootRef} className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl">
      <button onClick={() => navigate('/portal/projects')} className="text-ink-500 font-bold text-xs flex items-center gap-2 mb-4 hover:text-ink-700"><ArrowLeft className="w-3.5 h-3.5" /> Proyectos</button>

      <header className="mb-6" data-fade-h>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-ink-400 mb-2">Portal cliente · Proyecto</div>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex-1">{project.title}</h1>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full ${STATUS_COLOR[project.status] || 'bg-ink-100 text-ink-600'}`}>{project.status}</span>
        </div>
        {project.goal && <p className="text-sm text-ink-600 leading-relaxed">{project.goal}</p>}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-ink-500 flex-wrap font-mono">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {project.start_date || 'Sin inicio'}</span>
          <span>→</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {project.projected_end_date || 'Sin fin'}</span>
        </div>
        {(() => {
          const overall = calcProjectProgress({ phases, manual_progress: project.manual_progress });
          return (
            <div className="flex items-center gap-3 mt-3 max-w-md">
              <span className="text-[10px] font-black uppercase tracking-widest text-ink-400">Avance</span>
              <div className="flex-1 bg-ink-100 h-2 rounded-full overflow-hidden">
                <div className="progress-fill h-full" style={{ width: overall + '%' }} />
              </div>
              <span className="text-xs font-black text-emerald-600 tabular w-10 text-right">{overall}%</span>
            </div>
          );
        })()}
      </header>

      <TimelineSection project={project} milestones={milestones} />

      <PortalIntakeSection project={project} />

      <div className="card-light p-5 mb-5" data-fade-card>
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 mb-3 flex items-center gap-2"><Flag className="w-3.5 h-3.5" /> Hitos</h2>
        {milestones.length === 0 ? (
          <p className="text-xs text-ink-400">Sin hitos definidos.</p>
        ) : (
          <ul className="space-y-2">
            {milestones.map(m => (
              <li key={m.id} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.completed ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-ink-300'}`} />
                <span className={`flex-1 ${m.completed ? 'line-through text-ink-400' : 'font-bold'}`}>{m.name}</span>
                <span className="text-[11px] text-ink-400 tabular font-mono">{m.target_date || ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-light overflow-hidden mb-5" data-fade-card>
        <div className="px-5 py-4 border-b bg-gradient-to-r from-emerald-50/40 to-transparent">
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5" /> Etapas y actividades
          </h2>
        </div>
        {phases.length === 0 ? (
          <p className="px-5 py-6 text-xs text-ink-400">Sin etapas definidas todavía.</p>
        ) : (
          <div className="divide-y">
            {phases.map((ph, i) => {
              const prog = calcPhaseProgress(ph);
              const tasks = ph.tasks || [];
              return (
                <div key={ph.id} className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <span className="font-bold text-sm flex-1 min-w-0 truncate">{ph.name}</span>
                    <span className="text-[11px] font-black tabular text-emerald-700">{prog}%</span>
                  </div>
                  <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden mb-3">
                    <div className="progress-fill h-full" style={{ width: prog + '%' }} />
                  </div>
                  {tasks.length === 0 ? (
                    <p className="text-[11px] text-ink-400 italic pl-9">Sin actividades.</p>
                  ) : (
                    <ul className="space-y-1.5 pl-9">
                      {tasks.map(tk => {
                        const tp = taskProgress(tk);
                        const done = tp === 100;
                        return (
                          <li key={tk.id} className="flex items-center gap-2.5 text-sm">
                            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-ink-300'}`}>
                              {done && <CheckCircle2 className="w-3 h-3" />}
                            </span>
                            <span className={`flex-1 min-w-0 truncate ${done ? 'line-through text-ink-400' : 'text-ink-700'}`}>{tk.name}</span>
                            <div className="w-16 h-1 bg-ink-100 rounded-full overflow-hidden flex-shrink-0">
                              <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-violet-500'}`} style={{ width: tp + '%' }} />
                            </div>
                            <span className="text-[10px] font-bold tabular text-ink-400 w-8 text-right">{tp}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card-light overflow-hidden mb-5" data-fade-card>
        <div className="px-5 py-4 border-b bg-gradient-to-r from-violet-50/40 to-transparent">
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" /> Diagrama de flujo
          </h2>
          <p className="text-[10px] text-ink-400 mt-1">Vista cronológica de etapas y actividades del proyecto.</p>
        </div>
        {phases.length === 0 ? (
          <p className="px-5 py-6 text-xs text-ink-400">Aún no hay etapas para mostrar.</p>
        ) : (
          <div ref={ganttScrollRef} className="bg-white overflow-auto scroller-pro" style={{ height: 560 }}>
            <GanttCanvas
              project={{ ...project, phases, milestones }}
              editable={false}
              scrollerRef={ganttScrollRef}
            />
          </div>
        )}
      </div>

      <ClientTasksSection
        tasks={clientTasks}
        busyId={busyId}
        onDeliver={deliverTask}
        onDownload={downloadTaskFile}
      />

      <div className="card-light overflow-hidden mb-5" data-fade-card>
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-emerald-50/40 to-transparent">
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> Documentos
            <span className="text-ink-300">·</span>
            <span className="text-ink-400">{docs.length}</span>
          </h2>
          <button onClick={() => setAdhocOpen(o => !o)} className="btn-emerald text-xs">
            <Plus className="w-3.5 h-3.5" /> Subir documento
          </button>
        </div>

        {adhocOpen && (
          <AdhocUploader busy={busyId === 'adhoc'} onCancel={() => setAdhocOpen(false)} onSubmit={(file, name) => uploadFile({ file, name })} />
        )}

        {docs.length === 0 && !adhocOpen ? (
          <div className="px-6 py-10 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-xs text-ink-500">Sube los archivos que tu equipo necesita para avanzar el proyecto.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {docs.map(d => {
              const s = DOC_STATUS[d.status] || DOC_STATUS.pendiente;
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
                          onChange={e => uploadFile({ doc: d, file: e.target.files?.[0] })} />
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {project.observation && (
        <div className="card-light p-5 border-amber-200 bg-amber-50/40" data-fade-card>
          <h2 className="text-xs font-black uppercase tracking-widest text-amber-700 mb-2 flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> Observaciones</h2>
          <p className="text-sm text-amber-900 leading-relaxed italic">{project.observation}</p>
        </div>
      )}
    </section>
  );
}

function TimelineSection({ project, milestones }) {
  const today = new Date().toISOString().split('T')[0];

  const events = [];
  if (project.start_date) events.push({ kind: 'start', date: project.start_date, label: 'Inicio del proyecto', Icon: PlayCircle, color: 'violet' });
  milestones.forEach(m => {
    if (m.target_date) events.push({ kind: 'milestone', date: m.target_date, label: m.name, Icon: Flag, color: m.completed ? 'emerald' : 'blue', done: m.completed });
  });
  if (project.projected_end_date) events.push({ kind: 'end', date: project.projected_end_date, label: 'Fin proyectado', Icon: MapPin, color: 'amber' });
  if (project.delivery_date) events.push({ kind: 'delivery', date: project.delivery_date, label: 'Fecha de entrega', Icon: Truck, color: 'emerald' });
  events.sort((a, b) => a.date.localeCompare(b.date));

  // Inserta marcador HOY en su lugar cronológico si cae en rango
  if (project.start_date && project.projected_end_date && today >= project.start_date && today <= project.projected_end_date) {
    const idx = events.findIndex(e => e.date > today);
    const todayMarker = { kind: 'today', date: today, label: 'Hoy', Icon: Calendar, color: 'red', isToday: true };
    if (idx === -1) events.push(todayMarker);
    else events.splice(idx, 0, todayMarker);
  }

  // Barra de progreso entre start y end
  let pct = 0;
  if (project.start_date && project.projected_end_date) {
    const s = new Date(project.start_date).getTime();
    const e = new Date(project.projected_end_date).getTime();
    const t = Date.now();
    if (e > s) pct = Math.max(0, Math.min(100, ((t - s) / (e - s)) * 100));
  }

  if (events.length === 0) {
    return (
      <div className="card-light p-5 mb-5" data-fade-card>
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 mb-3 flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Línea de tiempo</h2>
        <p className="text-xs text-ink-400">Sin fechas registradas todavía.</p>
      </div>
    );
  }

  return (
    <div className="card-light overflow-hidden mb-5" data-fade-card>
      <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-emerald-50/40 to-transparent">
        <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" /> Línea de tiempo
        </h2>
        {project.start_date && project.projected_end_date && (
          <div className="flex items-center gap-2 min-w-[180px] flex-1 md:flex-initial md:w-64">
            <div className="flex-1 bg-ink-100 h-1.5 rounded-full overflow-hidden">
              <div className="progress-fill h-full" style={{ width: pct + '%' }} />
            </div>
            <span className="text-[10px] font-black tabular text-emerald-700 w-12 text-right">{pct.toFixed(0)}%</span>
          </div>
        )}
      </div>

      <ul className="p-5 space-y-3">
        {events.map((ev, i) => <TimelineRow key={i} ev={ev} today={today} />)}
      </ul>
    </div>
  );
}

const TL_COLOR = {
  violet:  'bg-violet-100 text-violet-700 ring-violet-500/30',
  blue:    'bg-blue-100 text-blue-700 ring-blue-500/30',
  emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-500/30',
  amber:   'bg-amber-100 text-amber-700 ring-amber-500/30',
  red:     'bg-red-100 text-red-700 ring-red-500/30'
};

function TimelineRow({ ev, today }) {
  const { Icon, label, date, color, done, isToday } = ev;
  const isPast = date < today;
  const relative = relativeDay(date, today);

  return (
    <li className={`flex items-start gap-3 ${isToday ? 'bg-red-50/60 border border-red-200 rounded-xl p-2 -mx-2' : ''}`}>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ring-2 ${TL_COLOR[color] || TL_COLOR.violet} ${isToday ? 'animate-pulse' : ''}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-bold ${done ? 'line-through text-ink-400' : ''} ${isToday ? 'text-red-700' : ''}`}>{label}</span>
          {done && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">cumplido</span>}
          {isPast && !done && !isToday && ev.kind === 'milestone' && (
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">pasado</span>
          )}
        </div>
        <div className="text-[11px] text-ink-400 mt-0.5 font-mono flex items-center gap-2">
          <span>{date}</span>
          <span className="text-ink-300">·</span>
          <span className={isToday ? 'text-red-600 font-bold' : ''}>{relative}</span>
        </div>
      </div>
    </li>
  );
}

function relativeDay(date, today) {
  if (date === today) return 'hoy';
  const d = new Date(date).getTime();
  const t = new Date(today).getTime();
  const days = Math.round((d - t) / (1000 * 60 * 60 * 24));
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  if (days > 0) return `en ${days} días`;
  return `hace ${Math.abs(days)} días`;
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

function ClientTasksSection({ tasks, busyId, onDeliver, onDownload }) {
  if (!tasks || tasks.length === 0) return null;

  const open = tasks.filter(t => t.status !== 'aprobado');
  const done = tasks.filter(t => t.status === 'aprobado');
  const urgent = open.filter(t => t.priority === 'urgente' || (t.due_date && dueRelative(t.due_date)?.overdue));

  return (
    <div className="card-light overflow-hidden mb-5" data-fade-card>
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-violet-50/40 to-transparent">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <ListTodo className="w-3.5 h-3.5" /> Tareas solicitadas por tu equipo
            {open.length > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 bg-violet-600 text-white rounded-full">
                {open.length} abiertas
              </span>
            )}
          </h2>
          <p className="text-[10px] text-ink-400 mt-0.5">Tu equipo te pide estos materiales para avanzar el proyecto. Sube el archivo desde aquí.</p>
        </div>
      </div>

      {urgent.length > 0 && (
        <div className="px-5 py-3 bg-red-50/70 border-b border-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-[11px] text-red-800 font-bold">
            Tienes {urgent.length} tarea{urgent.length === 1 ? '' : 's'} {urgent.length === 1 ? 'urgente o vencida' : 'urgentes o vencidas'}. Envíalas pronto para no detener tu proyecto.
          </p>
        </div>
      )}

      <ul className="divide-y">
        {[...open, ...done].map(t => (
          <ClientTaskRow key={t.id} task={t} busy={busyId === 'ct-' + t.id} onDeliver={onDeliver} onDownload={onDownload} />
        ))}
      </ul>
    </div>
  );
}

function ClientTaskRow({ task, busy, onDeliver, onDownload }) {
  const pm = priorityMeta(task.priority);
  const sm = statusMeta(task.status);
  const due = dueRelative(task.due_date);
  const canDeliver = task.status === 'pendiente' || task.status === 'rechazado' || task.status === 'en_progreso';
  return (
    <li className="px-5 py-4 hover:bg-ink-50 transition">
      <div className="flex items-start gap-4 flex-wrap">
        <div className={`w-10 h-10 rounded-xl ${pm.cls} border flex items-center justify-center flex-shrink-0`}>
          <ListTodo className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
            <span className="truncate">{task.title}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${pm.cls}`}>{pm.label}</span>
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${sm.cls}`}>{sm.label}</span>
          </div>
          {task.description && <p className="text-[12px] text-ink-500 mt-1 leading-relaxed">{task.description}</p>}
          {task.due_date && (
            <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-bold ${due?.overdue ? 'text-red-600' : due?.soon ? 'text-amber-700' : 'text-ink-500'}`}>
              {due?.overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              <span className="font-mono">Entrega: {task.due_date}</span>
              <span>·</span>
              <span>{due?.label}</span>
            </div>
          )}
          {task.status === 'rechazado' && task.review_comment && (
            <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <div className="text-[9px] font-black uppercase tracking-widest text-red-700 mb-0.5">Necesita correcciones</div>
              <p className="text-[11px] text-red-900 italic leading-snug">&ldquo;{task.review_comment}&rdquo;</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {task.file_path && (
            <button onClick={() => onDownload(task)} className="btn-soft text-xs" title="Ver archivo enviado">
              <Download className="w-3 h-3" /> {task.status === 'rechazado' ? 'Anterior' : 'Ver'}
            </button>
          )}
          {canDeliver && (
            <label className="btn-emerald cursor-pointer text-xs">
              <Upload className="w-3.5 h-3.5" />
              <span>{busy ? 'Subiendo…' : (task.status === 'rechazado' ? 'Re-enviar' : 'Entregar')}</span>
              <input type="file" className="hidden" disabled={busy}
                onChange={e => onDeliver({ task, file: e.target.files?.[0] })} />
            </label>
          )}
        </div>
      </div>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl">
      <div className="h-4 w-24 shimmer-skel rounded mb-4" />
      <div className="h-3 w-40 shimmer-skel rounded mb-3" />
      <div className="h-10 w-80 shimmer-skel rounded-lg mb-2" />
      <div className="h-4 w-2/3 shimmer-skel rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {[1, 2].map(i => (
          <div key={i} className="card-light p-5 space-y-3">
            <div className="h-4 w-1/3 shimmer-skel rounded" />
            <div className="h-3 w-full shimmer-skel rounded" />
            <div className="h-3 w-3/4 shimmer-skel rounded" />
          </div>
        ))}
      </div>
      <div className="card-light p-5 space-y-3">
        <div className="h-4 w-1/4 shimmer-skel rounded" />
        <div className="h-12 w-full shimmer-skel rounded" />
      </div>
    </section>
  );
}
