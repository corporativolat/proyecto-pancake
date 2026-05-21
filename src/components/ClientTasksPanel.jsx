import { useEffect, useRef, useState } from 'react';
import { ListTodo, Plus, Download, Check, XCircle, MessageSquare, Trash2, Clock, AlertTriangle, Link as LinkIcon, FileUp } from 'lucide-react';
import gsap from 'gsap';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import { reduced } from '../lib/motion';
import Modal from './Modal.jsx';
import {
  listClientTasks, createClientTask, deleteClientTask,
  reviewClientTask, signedUrlForTaskFile,
  priorityMeta, statusMeta, dueRelative,
  CLIENT_TASK_TYPES, TASK_TYPE_LABEL, TASK_TYPE_HELP, looksLikeUrl
} from '../lib/clientTasks';

const FILTERS = [
  ['all',         'Todas'],
  ['pendiente',   'Pendientes'],
  ['en_progreso', 'En progreso'],
  ['entregado',   'Por revisar'],
  ['aprobado',    'Aprobadas'],
  ['rechazado',   'Rechazadas']
];

export default function ClientTasksPanel({ project }) {
  const { profile, can } = useAuth();
  const showToast = useToast(s => s.show);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const rootRef = useRef(null);

  // Solo admin/gerente/owner/created_by puede borrar tareas (espejo de
  // client_tasks_delete en mig-24).
  const canDelete = !!profile && (
    can('editAll') ||
    project.owner_id === profile.id ||
    project.created_by === profile.id
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await listClientTasks(project.id);
      setTasks(data);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`ctasks-panel-${project.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'client_tasks', filter: `project_id=eq.${project.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (loading || reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-fade-task]', { y: 12, opacity: 0, duration: 0.4, ease: 'power3.out', stagger: 0.05 });
    }, rootRef);
    return () => ctx.revert();
  }, [loading, tasks.length]);

  const pendingReview = tasks.filter(t => t.status === 'entregado').length;
  const filtered = tasks.filter(t => filter === 'all' || t.status === filter);

  const download = async (t) => {
    if (!t.file_path) { showToast('Aún sin archivo', 'info'); return; }
    try {
      const url = await signedUrlForTaskFile(t.file_path, 300);
      window.open(url, '_blank', 'noopener');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const approve = async (t) => {
    const ok = await askConfirm({ title: 'Aprobar entrega', message: `Aprobar la tarea "${t.title}". El cliente recibirá una notificación.` });
    if (!ok) return;
    try {
      await reviewClientTask({ id: t.id, approved: true });
      showToast('Tarea aprobada', 'success');
      // No esperar al realtime: refrescar directamente para feedback inmediato.
      load();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const removeTask = async (t) => {
    const ok = await askConfirm({ title: 'Eliminar tarea', message: `Eliminar "${t.title}". No se podrá deshacer.`, danger: true });
    if (!ok) return;
    try {
      await deleteClientTask(t.id);
      showToast('Tarea eliminada', 'success');
      load();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  if (!project.client_id) {
    return (
      <section className="card-light p-6">
        <div className="empty">
          <div className="icon-wrap"><ListTodo className="w-8 h-8 text-violet-600" /></div>
          <h3 className="font-black text-sm mb-1 text-ink-700">Sin cliente asignado</h3>
          <p className="text-xs text-ink-500 max-w-sm mx-auto">Asigna un cliente a este proyecto para poder solicitarle tareas y documentos directamente desde aquí.</p>
        </div>
      </section>
    );
  }

  return (
    <section ref={rootRef} className="card-light overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-violet-50/40 to-transparent">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-ink-500 flex items-center gap-2">
            <ListTodo className="w-3.5 h-3.5" /> Tareas del cliente
            {pendingReview > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 bg-violet-600 text-white rounded-full">
                {pendingReview} por revisar
              </span>
            )}
          </h2>
          <p className="text-[10px] text-ink-400 mt-0.5">Pídele al cliente lo que necesitas para avanzar. Ve el estado de cada solicitud y aprueba/rechaza al recibir.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary-sm">
          <Plus className="w-3.5 h-3.5" /> Nueva tarea
        </button>
      </div>

      <div className="px-5 py-3 border-b flex gap-1 flex-wrap">
        {FILTERS.map(([k, l]) => {
          const n = k === 'all' ? tasks.length : tasks.filter(t => t.status === k).length;
          return (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full transition ${filter === k ? 'bg-violet-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}>
              {l} {n > 0 && <span className="opacity-60">({n})</span>}
            </button>
          );
        })}
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
            <ListTodo className="w-6 h-6" />
          </div>
          <p className="text-xs text-ink-500">
            {filter === 'all' ? 'Aún no le has pedido nada al cliente.' : 'Sin tareas en este filtro.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {filtered.map(t => {
            const pm = priorityMeta(t.priority);
            const sm = statusMeta(t.status);
            const due = dueRelative(t.due_date);
            const type = t.task_type || 'file';
            const isText = type === 'text';
            const TypeIcon = isText ? LinkIcon : FileUp;
            const typeCls = isText
              ? 'bg-sky-50 text-sky-700 border-sky-200'
              : 'bg-ink-50 text-ink-600 border-ink-200';
            return (
              <li key={t.id} data-fade-task className="px-5 py-4 hover:bg-ink-50 transition">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className={`w-10 h-10 rounded-xl ${pm.cls} border flex items-center justify-center flex-shrink-0`}>
                    <ListTodo className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                      <span className="truncate">{t.title}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${pm.cls}`}>{pm.label}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${typeCls}`}>
                        <TypeIcon className="w-2.5 h-2.5" /> {TASK_TYPE_LABEL[type] || type}
                      </span>
                    </div>
                    {t.description && <p className="text-[12px] text-ink-500 mt-1 leading-relaxed">{t.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${sm.cls}`}>{sm.label}</span>
                      {t.due_date && (
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${due?.overdue ? 'text-red-600' : due?.soon ? 'text-amber-700' : 'text-ink-500'}`}>
                          {due?.overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span className="font-mono">{t.due_date}</span> · {due?.label}
                        </span>
                      )}
                      {t.delivered_at && (
                        <span className="text-[10px] text-ink-400 font-mono">entregado {new Date(t.delivered_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    {isText && t.response_text && (
                      <div className="mt-2 bg-sky-50/60 border border-sky-200 rounded-lg px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-widest text-sky-700 mb-1 flex items-center gap-1">
                          <LinkIcon className="w-2.5 h-2.5" /> Respuesta del cliente
                        </div>
                        {looksLikeUrl(t.response_text) ? (
                          <a href={t.response_text.startsWith('http') ? t.response_text : `https://${t.response_text}`}
                             target="_blank" rel="noopener noreferrer"
                             className="text-[12px] font-bold text-sky-700 underline break-all hover:text-sky-800">
                            {t.response_text}
                          </a>
                        ) : (
                          <p className="text-[12px] text-sky-900 whitespace-pre-wrap break-words">{t.response_text}</p>
                        )}
                      </div>
                    )}
                    {t.review_comment && (
                      <div className="mt-2 bg-red-50/60 border border-red-200 rounded-lg px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-widest text-red-700 mb-0.5 flex items-center gap-1">
                          <MessageSquare className="w-2.5 h-2.5" /> Comentario al rechazar
                        </div>
                        <p className="text-[11px] text-red-900 italic leading-snug">&ldquo;{t.review_comment}&rdquo;</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    {!isText && t.file_path && (
                      <button onClick={() => download(t)} className="btn-soft text-xs" title="Descargar archivo">
                        <Download className="w-3 h-3" /> Ver
                      </button>
                    )}
                    {t.status === 'entregado' && (
                      <>
                        <button onClick={() => approve(t)} className="btn-emerald text-xs">
                          <Check className="w-3 h-3" /> Aprobar
                        </button>
                        <button onClick={() => setRejecting(t)} className="btn-danger text-xs">
                          <XCircle className="w-3 h-3" /> Rechazar
                        </button>
                      </>
                    )}
                    {canDelete && (t.status === 'pendiente' || t.status === 'rechazado') && (
                      <button onClick={() => removeTask(t)} className="btn-soft text-xs" title="Eliminar">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showNew && (
        <NewClientTaskModal
          project={project}
          onClose={() => setShowNew(false)}
          onDone={() => { setShowNew(false); showToast('Tarea creada — el cliente fue notificado', 'success'); load(); }}
        />
      )}

      {rejecting && (
        <RejectModal
          task={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => { setRejecting(null); showToast('Tarea rechazada', 'success'); load(); }}
        />
      )}
    </section>
  );
}

function NewClientTaskModal({ project, onClose, onDone }) {
  const showToast = useToast(s => s.show);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('media');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [taskType, setTaskType] = useState('file');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { showToast('Escribe un título', 'error'); return; }
    if (!project.client_id) { showToast('El proyecto no tiene cliente asignado', 'error'); return; }
    if (dueDate && startDate && dueDate < startDate) { showToast('La fecha de entrega no puede ser anterior a la fecha de inicio', 'error'); return; }
    setBusy(true);
    try {
      await createClientTask({
        project_id: project.id,
        assigned_to: project.client_id,
        title: title.trim(),
        description: description.trim(),
        priority,
        start_date: startDate || null,
        due_date: dueDate || null,
        task_type: taskType
      });
      onDone();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title="Nueva tarea para el cliente" onClose={onClose} footer={<></>} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Tipo de entrega</label>
          <div className="grid grid-cols-2 gap-2">
            {CLIENT_TASK_TYPES.map(tp => {
              const active = taskType === tp;
              const Icon = tp === 'text' ? LinkIcon : FileUp;
              return (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setTaskType(tp)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition ${active
                    ? 'border-violet-500 bg-violet-50/70 shadow-sm'
                    : 'border-ink-200 hover:border-ink-300 bg-white'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${active ? 'text-violet-600' : 'text-ink-500'}`} />
                    <span className={`text-xs font-black ${active ? 'text-violet-700' : 'text-ink-700'}`}>
                      {TASK_TYPE_LABEL[tp]}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-ink-500 leading-snug">{TASK_TYPE_HELP[tp]}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Título *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder={taskType === 'text'
              ? 'Ej: Compártenos el enlace de Drive con tus fotos del local'
              : 'Ej: Enviar cédula del representante legal'}
            className="input-light w-full" />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">¿Por qué la necesitas?</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder={taskType === 'text'
              ? 'Ej: Sube las fotos a una carpeta de Drive y compártela con permisos de lectura. Pega aquí el enlace.'
              : 'Ej: Necesitamos validar la identidad antes de firmar el contrato. PDF escaneado, ambas caras.'}
            className="input-light h-24 resize-none w-full" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Prioridad</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="input-light w-full">
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Inicio</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-light w-full" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Entrega</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input-light w-full" />
          </div>
        </div>

        <div className="bg-violet-50/60 border border-violet-200 rounded-xl px-4 py-3 text-[11px] text-violet-900">
          <strong className="font-black">El cliente recibirá:</strong> una notificación en el portal con el título, la descripción, la prioridad y la fecha de entrega. {taskType === 'text'
            ? 'Para responder pegará un enlace o un texto desde el portal.'
            : 'Verá la tarea también en su calendario y podrá subir el archivo desde allí.'}
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-soft flex-1 justify-center">Cancelar</button>
          <button type="submit" disabled={busy} className="btn-primary flex-1 justify-center disabled:opacity-60">
            {busy ? 'Creando…' : 'Solicitar al cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RejectModal({ task, onClose, onDone }) {
  const showToast = useToast(s => s.show);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) { showToast('Explica qué corregir', 'error'); return; }
    setBusy(true);
    try {
      await reviewClientTask({ id: task.id, approved: false, comment: comment.trim() });
      onDone();
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Rechazar: ${task.title}`} onClose={onClose} footer={<></>}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-ink-500 leading-relaxed">
          El cliente recibirá una notificación y podrá re-enviar el archivo. Explica qué corregir.
        </p>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1 block">Motivo / instrucciones *</label>
          <textarea required value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Ej: El archivo está borroso. Adjunta un escaneo en alta resolución."
            className="input-light h-28 resize-none w-full" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-soft flex-1 justify-center">Cancelar</button>
          <button type="submit" disabled={busy} className="btn-danger flex-1 justify-center disabled:opacity-60">
            {busy ? 'Rechazando…' : 'Rechazar entrega'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
