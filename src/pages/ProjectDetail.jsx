import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar, Maximize2, Minimize2, FileText, Trash2, X, Plus, Map, ChevronLeft, ChevronRight, User, Download, ChevronUp, ChevronDown, Flag, ListChecks } from 'lucide-react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { calcPhaseProgress, calcProjectProgress, STATUSES, PROJECT_FIELD_HELP, PROJECT_CATEGORY_HELP } from '../lib/utils';
import Avatar from '../components/Avatar.jsx';
import Comments from '../components/Comments.jsx';
import { animateBars, confetti, reduced } from '../lib/motion';
import { updateProject, deleteProjectById, setProjectMember, createPhase, updatePhase, deletePhase, createTask, updateTask, deleteTask, reorderPhases, createMilestone, updateMilestone, deleteMilestone } from '../lib/data';
import { uploadAttachment, removeAttachmentFile } from '../lib/storage';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import Modal from '../components/Modal.jsx';
import { downloadCronograma } from '../lib/exporters';

if (typeof window !== 'undefined') gsap.registerPlugin(Draggable);

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projects = useStore(s => s.projects);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const refreshProjects = useStore(s => s.refreshProjects);
  const patchProject = useStore(s => s.patchProject);
  const { profile, can } = useAuth();
  const { t } = useT();
  const showToast = useToast(s => s.show);
  const [editingTask, setEditingTask] = useState(null);
  const [showFull, setShowFull] = useState(false);
  const [showExec, setShowExec] = useState(false);
  const [mobileTab, setMobileTab] = useState('roadmap'); // 'roadmap' | 'gantt'
  const [roadmapPopup, setRoadmapPopup] = useState(false);
  const headerRef = useRef(null);
  const phasesScrollRef = useRef(null);
  const ganttScrollRef = useRef(null);

  const scrollGantt = (deltaWeeks) => {
    const sc = ganttScrollRef.current;
    if (!sc) return;
    const target = sc.scrollLeft + deltaWeeks * 196;
    if (reduced) { sc.scrollLeft = target; return; }
    gsap.to(sc, { scrollLeft: target, duration: 0.45, ease: 'power3.inOut' });
  };

  const project = projects.find(p => p.id === id);
  const editable = !!project && (can('editAll') || project.owner_id === profile?.id);

  const debounceRef = useRef({});
  const debouncedUpdate = useCallback((field, value) => {
    patchProject(id, { [field]: value });
    clearTimeout(debounceRef.current[field]);
    debounceRef.current[field] = setTimeout(async () => {
      try { await updateProject(id, { [field]: value }); }
      catch (e) { showToast(t('pj.errorSaving') + e.message); }
    }, 500);
  }, [id, patchProject, showToast, t]);

  // (Eliminado el toggle de .shrink en scroll: clipaba el título/botones cuando
  // el header crecía con los campos oficiales nuevos. El header ahora mantiene
  // su altura natural y la sección Hoja de Ruta scrolea libremente.)

  if (!project) return <div className="flex-1 flex items-center justify-center text-ink-400">{t('pj.notFound')}</div>;

  const projProg = calcProjectProgress(project);

  const handleNewPhase = async () => {
    try {
      const pos = (project.phases?.length || 0);
      await createPhase(id, pos);
      await refreshProjects();
    } catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };

  const handleDelete = async () => {
    const ok = await askConfirm({ title: t('pj.confirm.deleteProjectTitle'), message: t('pj.confirm.deleteProjectMsg'), danger: true });
    if (!ok) return;
    try {
      await deleteProjectById(id);
      await refreshProjects();
      showToast(t('pj.toast.removed'));
      navigate('/projects');
    } catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };

  const toggleMember = async (userId, isOwner, isMember) => {
    if (isOwner || !editable) return;
    try {
      await setProjectMember(id, userId, !isMember);
      await refreshProjects();
    } catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };

  return (
    <section className="flex-1 flex flex-col overflow-hidden bg-white relative">
      <div ref={headerRef} className="pj-header px-4 py-4 md:px-10 md:py-6 border-b bg-white z-20 flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 mb-4 md:mb-5">
          <div className="flex-1 max-w-4xl min-w-0">
            <input
              type="text" value={project.title} disabled={!editable}
              onChange={e => debouncedUpdate('title', e.target.value)}
              title={PROJECT_FIELD_HELP.title}
              className="pj-title text-2xl md:text-3xl font-black border-none focus:ring-0 w-full bg-transparent p-0 text-ink-900 tracking-tight outline-none"
              placeholder={t('pj.titlePlaceholder')}
            />
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <input
                type="text" value={project.company || ''} disabled={!editable}
                onChange={e => debouncedUpdate('company', e.target.value)}
                title={PROJECT_FIELD_HELP.company}
                className="text-sm font-bold border-none focus:ring-0 text-ink-400 bg-transparent w-auto outline-none"
                placeholder={t('pj.companyPlaceholder')}
              />
              <span className="text-ink-200">·</span>
              <select value={project.category_id || ''} disabled={!editable}
                onChange={e => debouncedUpdate('category_id', e.target.value)}
                title={(() => {
                  const c = categories.find(x => x.id === project.category_id);
                  return c ? `Tipo: ${c.name} — ${PROJECT_CATEGORY_HELP[c.name] || PROJECT_FIELD_HELP.category_id}` : PROJECT_FIELD_HELP.category_id;
                })()}
                className="text-[10px] font-bold uppercase tracking-widest bg-violet-50 text-violet-700 px-3 py-1 rounded-full border-none focus:ring-2 focus:ring-violet-500 outline-none">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="text-ink-200">·</span>
              <div className="flex items-center gap-2" title={PROJECT_FIELD_HELP.start_date}>
                <Calendar className="w-3 h-3 text-ink-400" />
                <input type="date" value={project.start_date || ''} disabled={!editable}
                  onChange={e => debouncedUpdate('start_date', e.target.value)}
                  className="text-[10px] font-bold border-none bg-ink-100 rounded px-2 py-1 text-ink-600 focus:ring-2 focus:ring-violet-500 outline-none" />
              </div>
            </div>
            {(() => {
              const c = categories.find(x => x.id === project.category_id);
              const help = c ? PROJECT_CATEGORY_HELP[c.name] : null;
              if (!c || !help) return null;
              return (
                <p className="mt-2 text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5 leading-snug inline-block">
                  <span className="font-bold">{c.name}:</span> {help}
                </p>
              );
            })()}
          </div>
          <div className="flex gap-2 items-start flex-wrap">
            <div className="flex flex-col items-start lg:items-end mr-2 flex-1 lg:flex-initial">
              <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">{t('pj.progress')}</span>
              <div className="flex items-center gap-2 w-full lg:w-auto">
                <div className="flex-1 lg:w-32 bg-ink-100 h-2 rounded-full overflow-hidden">
                  <div className="progress-fill h-full transition-all duration-700" style={{ width: projProg + '%' }} />
                </div>
                <span className="text-sm font-black text-violet-600 tabular">{projProg}%</span>
              </div>
            </div>
            <button onClick={() => setShowFull(true)} className="btn-soft"><Maximize2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('pj.expand')}</span></button>
            <button onClick={() => setShowExec(true)} className="btn-soft"><FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('pj.report')}</span></button>
            {can('deleteProject') && <button onClick={handleDelete} className="btn-danger"><Trash2 className="w-3.5 h-3.5" /></button>}
            <button onClick={() => navigate('/projects')} className="btn-dark"><X className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('pj.back')}</span></button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 pj-extra">
          <div className="md:col-span-2">
            <DetailLabel label={t('pj.objectiveLabel')} help={PROJECT_FIELD_HELP.goal} />
            <textarea value={project.goal || ''} disabled={!editable} onChange={e => debouncedUpdate('goal', e.target.value)} className="input-light h-20 resize-none" placeholder={t('pj.objectivePlaceholder')} />
          </div>
          <div className="space-y-3">
            <div>
              <DetailLabel label={t('pj.responsibleLabel')} help={PROJECT_FIELD_HELP.owner_id} />
              <select value={project.owner_id || ''} disabled={!editable} onChange={e => debouncedUpdate('owner_id', e.target.value || null)} className="input-light">
                <option value="">{project.owner_label ? `(sin cuenta) ${project.owner_label}` : '—'}</option>
                {profiles.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {!project.owner_id && (
                <input
                  type="text"
                  value={project.owner_label || ''}
                  disabled={!editable}
                  onChange={e => debouncedUpdate('owner_label', e.target.value)}
                  placeholder="Nombre del responsable (texto libre)"
                  className="input-light mt-1.5 text-[11px]"
                />
              )}
            </div>
            <div>
              <DetailLabel label={t('pj.status')} help={PROJECT_FIELD_HELP.status} />
              <select value={project.status} disabled={!editable} onChange={e => debouncedUpdate('status', e.target.value)} className="input-light">
                {STATUSES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <DetailLabel label={t('pj.observationsLabel')} help={PROJECT_FIELD_HELP.observation} />
            <textarea value={project.observation || ''} disabled={!editable} onChange={e => debouncedUpdate('observation', e.target.value)} className="w-full bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-[11px] font-medium italic text-amber-900 outline-none h-24 resize-none focus:ring-2 focus:ring-amber-500" placeholder={t('pj.observationsPlaceholder')} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 pj-extra mt-4">
          <div>
            <DetailLabel label={t('pj.dependencyLabel')} help={PROJECT_FIELD_HELP.client_lead} />
            <input type="text" value={project.client_lead || ''} disabled={!editable} onChange={e => debouncedUpdate('client_lead', e.target.value)} placeholder={t('pj.dependencyPlaceholder')} className="input-light" />
          </div>
          <div>
            <DetailLabel label={t('pj.projectedEnd')} help={PROJECT_FIELD_HELP.projected_end_date} />
            <input type="date" value={project.projected_end_date || ''} disabled={!editable} onChange={e => debouncedUpdate('projected_end_date', e.target.value || null)} className="input-light" />
          </div>
          <div>
            <DetailLabel label={t('pj.deliveryDate')} help={PROJECT_FIELD_HELP.delivery_date} />
            <input type="date" value={project.delivery_date || ''} disabled={!editable} onChange={e => debouncedUpdate('delivery_date', e.target.value || null)} className="input-light" />
          </div>
          <div>
            <DetailLabel label={t('pj.contractLabel')} help={PROJECT_FIELD_HELP.contract_url} />
            <div className="flex gap-2">
              <input type="text" value={project.contract_url || ''} disabled={!editable} onChange={e => debouncedUpdate('contract_url', e.target.value)} placeholder={t('pj.contractPlaceholder')} className="input-light flex-1" />
              {project.contract_url && /^https?:\/\//i.test(project.contract_url) && (
                <a href={project.contract_url} target="_blank" rel="noreferrer" className="btn-soft text-[10px]" title={t('pj.openContract')}>↗</a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pj-extra">
          <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{t('pj.team')}</label>
          <div className="flex flex-wrap gap-2">
            {profiles.map(u => {
              const isOwner = project.owner_id === u.id;
              const isMember = (project.member_ids || []).includes(u.id);
              const cls = isOwner ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md' : isMember ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-100 text-ink-500';
              return (
                <button key={u.id} onClick={() => toggleMember(u.id, isOwner, isMember)} disabled={isOwner || !editable}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition flex items-center gap-2 ${cls} ${(!editable || isOwner) ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 hover:shadow-md'}`}>
                  <Avatar user={u} size={20} />
                  {u.name}{isOwner ? ' ' + t('pj.leaderTag') : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs solo en móvil. >=md ambos paneles se muestran lado a lado. */}
      <div className="md:hidden flex border-b bg-white flex-shrink-0 sticky top-0 z-10">
        <button
          onClick={() => setMobileTab('roadmap')}
          className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition ${mobileTab === 'roadmap' ? 'text-violet-700 border-b-2 border-violet-600 bg-violet-50/50' : 'text-ink-400'}`}
        >
          <Map className="w-3.5 h-3.5" /> {t('pj.tab.roadmap')}
        </button>
        <button
          onClick={() => setMobileTab('gantt')}
          className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition ${mobileTab === 'gantt' ? 'text-violet-700 border-b-2 border-violet-600 bg-violet-50/50' : 'text-ink-400'}`}
        >
          <Calendar className="w-3.5 h-3.5" /> {t('pj.tab.gantt')}
        </button>
      </div>

      {(() => {
        const movePhase = async (pIdx, dir) => {
          const arr = [...project.phases];
          const swapIdx = pIdx + dir;
          if (swapIdx < 0 || swapIdx >= arr.length) return;
          [arr[pIdx], arr[swapIdx]] = [arr[swapIdx], arr[pIdx]];
          const items = arr.map((p, i) => ({ id: p.id, position: i }));
          try { await reorderPhases(items); await refreshProjects(); }
          catch (e) { showToast('Error: ' + e.message, 'error'); }
        };
        const roadmapContent = (
          <>
            {project.phases?.map((ph, pIdx) => (
              <PhaseCard key={ph.id} phase={ph} pIdx={pIdx} total={project.phases.length} project={project} editable={editable} profiles={profiles} onChange={refreshProjects} onEditTask={(tk) => setEditingTask({ ...tk, phaseId: ph.id })} onMove={(dir) => movePhase(pIdx, dir)} />
            ))}
            <MilestonesPanel project={project} editable={editable} onChange={refreshProjects} />
            <Comments projectId={project.id} />
          </>
        );

        if (showFull) return null;
        return (
          <>
            <div className="flex-1 overflow-hidden flex min-h-0">
              <div className={`${mobileTab === 'roadmap' ? 'flex' : 'hidden'} md:flex w-full md:w-[680px] lg:w-[760px] md:border-r flex-col bg-ink-50/40 min-h-0 min-w-0`}>
                <div className="p-4 bg-white border-b flex justify-between items-center gap-2">
                  <span className="font-black text-[10px] text-ink-400 uppercase tracking-widest flex items-center gap-2 min-w-0">
                    <Map className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{t('pj.roadmap')}</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setRoadmapPopup(true)}
                      className="btn-soft text-[10px] py-1.5 px-2.5"
                      title={t('pj.expandRoadmap')}
                    >
                      <Maximize2 className="w-3 h-3" /> <span className="hidden sm:inline">{t('pj.expandRoadmap')}</span>
                    </button>
                    {editable && <button onClick={handleNewPhase} className="btn-primary-sm"><Plus className="w-3 h-3" /> {t('pj.phase')}</button>}
                  </div>
                </div>
                {roadmapPopup ? (
                  <div className="flex-1 flex items-center justify-center p-6 text-center">
                    <div className="space-y-3 max-w-xs">
                      <div className="inline-flex w-12 h-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                        <Maximize2 className="w-5 h-5" />
                      </div>
                      <p className="text-[12px] font-bold text-ink-700">{t('pj.expandedOpen')}</p>
                      <p className="text-[11px] text-ink-500 leading-snug">{t('pj.expandedDesc')}</p>
                      <button onClick={() => setRoadmapPopup(false)} className="btn-soft text-[11px]">
                        {t('pj.dockPanel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div ref={phasesScrollRef} className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 md:space-y-5 scroller pb-32">
                    {roadmapContent}
                  </div>
                )}
              </div>
              <div className={`${mobileTab === 'gantt' ? 'block' : 'hidden'} md:block flex-1 relative min-h-0 min-w-0`}>
                <div ref={ganttScrollRef} className="absolute inset-0 bg-white overflow-auto scroller-pro">
                  <GanttCanvas project={project} editable={editable} onChange={refreshProjects} onEditTask={(tk, phaseId) => setEditingTask({ ...tk, phaseId })} scrollerRef={ganttScrollRef} />
                </div>
                <button
                  type="button"
                  onClick={() => scrollGantt(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:scale-110 active:scale-95 transition flex items-center justify-center"
                  title={t('pj.full.prevWeek')}
                  aria-label={t('pj.full.prevWeek')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollGantt(1)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-40 w-9 h-9 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:scale-110 active:scale-95 transition flex items-center justify-center"
                  title={t('pj.full.nextWeek')}
                  aria-label={t('pj.full.nextWeek')}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {roadmapPopup && (
              <RoadmapPopup onClose={() => setRoadmapPopup(false)}>
                <div className="px-4 pt-4 pb-3 border-b bg-white flex justify-between items-center gap-2 flex-shrink-0">
                  <span className="font-black text-[11px] text-ink-500 uppercase tracking-widest flex items-center gap-2 min-w-0">
                    <Map className="w-3.5 h-3.5 flex-shrink-0" /> <span className="truncate">{t('pj.roadmap')} · {project.title}</span>
                  </span>
                  {editable && <button onClick={handleNewPhase} className="btn-primary-sm flex-shrink-0"><Plus className="w-3 h-3" /> {t('pj.phase')}</button>}
                </div>
                <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-5 scroller bg-ink-50/40 min-h-0">
                  {roadmapContent}
                </div>
              </RoadmapPopup>
            )}
          </>
        );
      })()}

      {editingTask && (
        <TaskModal
          task={editingTask}
          profiles={profiles}
          onClose={() => setEditingTask(null)}
          onSave={async (patch) => {
            try { await updateTask(editingTask.id, patch); await refreshProjects(); setEditingTask(null); showToast(t('pj.toast.saved')); }
            catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
          }}
          onDelete={async () => {
            const ok = await askConfirm({ title: t('pj.deleteTaskTitle'), message: t('pj.deleteTaskMsg'), danger: true });
            if (!ok) return;
            try { await deleteTask(editingTask.id); await refreshProjects(); setEditingTask(null); showToast(t('pj.toast.deleted')); }
            catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
          }}
        />
      )}

      {showFull && <FullGanttModal project={project} profiles={profiles} editable={editable} onChange={refreshProjects} onEditTask={(tk, phaseId) => setEditingTask({ ...tk, phaseId })} onClose={() => setShowFull(false)} />}
      {showExec && <ExecModal project={project} profiles={profiles} onClose={() => setShowExec(false)} />}
    </section>
  );
}

function PhaseCard({ phase, pIdx, total, project, editable, profiles, onChange, onEditTask, onMove }) { // eslint-disable-line no-unused-vars
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const prog = calcPhaseProgress(phase);

  const handleAddTask = async () => {
    try {
      await createTask(phase.id, {
        name: 'Nueva Actividad', completed: false, assignee_id: project.owner_id, duration: 2, start_week: phase.start_week, start_day: 1, obs: '', position: phase.tasks?.length || 0
      });
      await onChange();
    } catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };

  const toggleTask = async (task, e) => {
    try {
      await updateTask(task.id, { completed: !task.completed });
      if (!task.completed) {
        const host = e.currentTarget.closest('.relative') || e.currentTarget.parentElement;
        confetti(host, '#10b981');
      }
      await onChange();
    } catch (ex) { showToast(t('pj.errorPrefix') + ex.message, 'error'); }
  };

  const patchPhase = async (fieldOrPatch, value) => {
    const patch = typeof fieldOrPatch === 'string' ? { [fieldOrPatch]: value } : fieldOrPatch;
    try { await updatePhase(phase.id, patch); await onChange(); }
    catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };

  const removePhase = async () => {
    const ok = await askConfirm({ title: t('pj.deletePhaseTitle'), message: t('pj.deletePhaseMsg'), danger: true });
    if (!ok) return;
    try { await deletePhase(phase.id); await onChange(); }
    catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };

  return (
    <div className="bg-white border border-ink-100 rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition">
      <div className="p-4 bg-gradient-to-r from-ink-50 to-white border-b flex justify-between items-center">
        <div className="flex-1 min-w-0">
          <input defaultValue={phase.name} disabled={!editable} onBlur={e => e.target.value !== phase.name && patchPhase('name', e.target.value)} className="font-bold text-ink-900 bg-transparent border-none p-0 focus:ring-0 w-full text-sm tracking-tight mb-1.5 outline-none" />
          <div className="flex gap-3 flex-wrap">
            <NumLabel label={t('pj.startWeek')} value={phase.start_week} max={8} disabled={!editable} onSave={v => patchPhase('start_week', v)} />
            <NumLabel label={t('pj.startDayShort')} value={phase.start_day || 1} max={7} disabled={!editable} onSave={v => patchPhase('start_day', v)} />
            <NumLabel
              label={t('pj.durationDaysShort')}
              value={phase.duration_days != null ? phase.duration_days : (phase.duration_weeks || 1) * 7}
              max={56}
              disabled={!editable}
              onSave={v => patchPhase({ duration_days: v, duration_weeks: Math.max(1, Math.min(8, Math.ceil(v / 7))) })}
            />
          </div>
        </div>
        {editable && (
          <div className="flex flex-col">
            <button onClick={() => onMove(-1)} disabled={pIdx === 0} className="p-1 text-ink-300 hover:text-violet-600 disabled:opacity-30 transition"><ChevronUp className="w-3 h-3" /></button>
            <button onClick={() => onMove(1)} disabled={pIdx === total - 1} className="p-1 text-ink-300 hover:text-violet-600 disabled:opacity-30 transition"><ChevronDown className="w-3 h-3" /></button>
          </div>
        )}
        {editable && <button onClick={removePhase} className="p-2 text-ink-300 hover:text-red-500 transition ml-1"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
      <div className="divide-y divide-ink-100">
        {phase.tasks?.map((tk) => {
          const assignee = profiles.find(u => u.id === tk.assignee_id);
          return (
            <div key={tk.id} onClick={() => onEditTask(tk)} className="p-3 hover:bg-violet-50/40 transition flex items-center gap-3 cursor-pointer group relative">
              <input type="checkbox" checked={tk.completed} onClick={e => e.stopPropagation()} onChange={(e) => toggleTask(tk, e)} className="rounded text-violet-600 h-4 w-4 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {tk.priority === 'urgent' && <span className="text-[8px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded uppercase">!URG</span>}
                  {tk.priority === 'high' && <span className="text-[8px] font-black text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded uppercase">ALT</span>}
                  {tk.priority === 'low' && <span className="text-[8px] font-black text-ink-500 bg-ink-100 px-1.5 py-0.5 rounded uppercase">BAJA</span>}
                  <div className={`text-[12px] font-semibold truncate ${tk.completed ? 'line-through text-ink-400' : 'text-ink-700'}`}>{tk.name}</div>
                </div>
                <div className="flex gap-2 text-[10px] font-semibold text-ink-400 items-center mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    {assignee ? <Avatar user={assignee} size={14} /> : <User className="w-3 h-3" />}
                    {assignee?.name || t('common.unassigned')}
                  </span>
                  <span className="text-ink-200">•</span>
                  <span className="tabular">S{tk.start_week} D{tk.start_day}</span>
                  <span className="text-ink-200">•</span>
                  <span className="tabular">{tk.duration}d</span>
                  {tk.subtasks?.length > 0 && <><span className="text-ink-200">•</span><span className="tabular flex items-center gap-0.5"><ListChecks className="w-2.5 h-2.5" />{tk.subtasks.filter(s => s.completed).length}/{tk.subtasks.length}</span></>}
                  {tk.attachments?.length > 0 && <><span className="text-ink-200">•</span><span className="tabular">📎{tk.attachments.length}</span></>}
                  {tk.tags?.length > 0 && tk.tags.map(tg => <span key={tg} className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">#{tg}</span>)}
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-ink-300 opacity-0 group-hover:opacity-100 transition" />
            </div>
          );
        })}
      </div>
      {editable && <button onClick={handleAddTask} className="w-full py-2.5 text-[11px] font-bold text-violet-600 hover:bg-violet-50 transition border-t border-ink-100 flex items-center justify-center gap-1.5">
        <Plus className="w-3 h-3" /> {t('pj.activity')}
      </button>}
      <div className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[11px] font-bold text-white flex justify-between items-center">
        <span>{t('pj.compliance')}</span>
        <span className="flex items-center gap-2">
          <div className="w-12 h-1 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: prog + '%' }} />
          </div>
          <span className="tabular">{prog}%</span>
        </span>
      </div>
    </div>
  );
}

function DetailLabel({ label, help }) {
  return (
    <>
      <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1 block">{label}</label>
      {help && <p className="text-[10px] text-ink-400 italic mb-1.5 leading-snug">{help}</p>}
    </>
  );
}

function NumLabel({ label, value, max, disabled, onSave }) {
  const { t } = useT();
  const [v, setV] = useState(value);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const lastSavedRef = useRef(value);

  useEffect(() => { setV(value); lastSavedRef.current = value; }, [value]);
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleChange = (raw) => {
    const n = parseInt(raw);
    const clamped = Math.min(max, Math.max(1, isNaN(n) ? 1 : n));
    setV(clamped);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (clamped !== lastSavedRef.current) {
        lastSavedRef.current = clamped;
        onSave(clamped);
        if (inputRef.current && !reduced) {
          gsap.fromTo(
            inputRef.current,
            { boxShadow: '0 0 0 0 rgba(124,58,237,0.65)' },
            { boxShadow: '0 0 0 8px rgba(124,58,237,0)', duration: 0.6, ease: 'power2.out' }
          );
        }
      }
    }, 350);
  };

  const bump = (delta) => {
    if (disabled) return;
    handleChange(String(v + delta));
  };

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={disabled || v <= 1}
          className="w-5 h-6 flex items-center justify-center text-ink-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('pj.decrease')}
        >−</button>
        <input
          ref={inputRef}
          type="number" min="1" max={max} value={v} disabled={disabled}
          onChange={e => handleChange(e.target.value)}
          className="text-[12px] w-12 font-bold bg-ink-100 text-ink-900 border border-ink-200 rounded-md px-2 py-0.5 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none tabular disabled:opacity-60 text-center"
        />
        <button
          type="button"
          onClick={() => bump(1)}
          disabled={disabled || v >= max}
          className="w-5 h-6 flex items-center justify-center text-ink-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
          title={t('pj.increase')}
        >+</button>
      </div>
    </div>
  );
}

function GanttCanvas({ project, editable, onChange, onEditTask, scrollerRef }) {
  const { t } = useT();
  const headerRef = useRef(null);
  const bodyRef = useRef(null);
  const [activeWeek, setActiveWeek] = useState(1);

  const scrollToWeek = (weekIdx) => {
    const scroller = scrollerRef?.current;
    if (!scroller) return;
    const targetX = weekIdx * 196;
    if (reduced) { scroller.scrollLeft = targetX; return; }
    gsap.to(scroller, { scrollLeft: targetX, duration: 0.55, ease: 'power3.inOut' });
  };

  useEffect(() => {
    const scroller = scrollerRef?.current;
    if (!scroller) return;
    const onScroll = () => {
      const w = Math.round(scroller.scrollLeft / 196) + 1;
      setActiveWeek(Math.max(1, Math.min(8, w)));
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [scrollerRef]);

  useEffect(() => {
    const scroller = scrollerRef?.current;
    if (!scroller) return;
    let isDown = false, startX = 0, startScrollLeft = 0;
    const onDown = (e) => {
      const target = e.target;
      if (target.closest('.task-bar') || target.closest('[data-no-pan]') || target.closest('button') || target.closest('input') || target.closest('a')) return;
      isDown = true;
      startX = e.pageX;
      startScrollLeft = scroller.scrollLeft;
      scroller.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!isDown) return;
      scroller.scrollLeft = startScrollLeft - (e.pageX - startX);
    };
    const onUp = () => { isDown = false; scroller.style.cursor = ''; };
    scroller.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      scroller.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scrollerRef]);


  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.querySelectorAll('.gantt-today, .gantt-milestone').forEach(n => n.remove());
    if (project.start_date) {
      const start = new Date(project.start_date);
      const today = new Date();
      const diffDays = Math.round((today - start) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 56) {
        const line = document.createElement('div');
        line.className = 'gantt-today';
        line.style.left = (diffDays * 28) + 'px';
        bodyRef.current.appendChild(line);
      }
      // milestones
      (project.milestones || []).forEach(m => {
        const dDays = Math.round((new Date(m.target_date) - start) / (1000 * 60 * 60 * 24));
        if (dDays < 0 || dDays > 56) return;
        const flag = document.createElement('div');
        flag.className = 'gantt-milestone';
        flag.style.left = (dDays * 28) + 'px';
        flag.style.background = m.color || '#f59e0b';
        flag.dataset.name = m.name;
        flag.dataset.completed = m.completed ? '1' : '0';
        if (m.completed) flag.style.opacity = '0.45';
        bodyRef.current.appendChild(flag);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.start_date, project.phases?.length, project.milestones?.length]);

  useEffect(() => {
    if (reduced || !bodyRef.current) return;
    const bars = bodyRef.current.querySelectorAll('.task-bar');
    if (!bars.length || bars.length > 25) return;
    gsap.fromTo(bars, { scaleX: 0, transformOrigin: '0% 50%', opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.02 });
  }, [project.phases]);

  return (
    <div style={{ width: 1568 }}>
      <div ref={headerRef} className="sticky top-0 z-30">
        <div className="flex bg-gradient-to-r from-ink-950 to-violet-900 text-white relative" style={{ width: 1568 }}>
          {Array.from({ length: 8 }).map((_, s) => {
            const isActive = activeWeek === s + 1;
            return (
              <button
                key={s}
                type="button"
                data-week-header="1"
                onClick={() => scrollToWeek(s)}
                className={`flex-shrink-0 border-r border-white/5 text-[10px] font-bold text-center py-3 tracking-wide transition-all relative outline-none ${isActive ? 'bg-violet-600/40 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                style={{ width: 196 }}
                title={`${t('pj.week')} ${s + 1}`}
              >
                {t('pj.week')} {s + 1}
                {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-10 bg-fuchsia-400 rounded-full" />}
              </button>
            );
          })}
        </div>
        <div className="flex bg-white border-b" style={{ width: 1568 }}>
          {Array.from({ length: 56 }).map((_, d) => {
            const isWeekend = (d % 7 === 5 || d % 7 === 6);
            const days = t('pj.daysShort').split(',');
            return <div key={d} className={`flex-shrink-0 h-9 flex items-center justify-center text-[9px] border-r font-semibold ${isWeekend ? 'bg-ink-50 text-ink-400' : 'text-ink-300'}`} style={{ width: 28 }}>{days[d % 7]}</div>;
          })}
        </div>
      </div>
      <div ref={bodyRef} className="relative" style={{ width: 1568 }}>
        {project.phases?.map((ph, pIdx) => (
          <GanttRow key={ph.id} phase={ph} pIdx={pIdx} editable={editable} onChange={onChange} onEditTask={(tk) => onEditTask(tk, ph.id)} />
        ))}
      </div>
    </div>
  );
}

function GanttRow({ phase, pIdx, editable, onChange, onEditTask }) { // eslint-disable-line no-unused-vars
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const rowRef = useRef(null);
  const rectRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const mountedRef = useRef(false);
  const dragMoved = useRef(false);
  const startDay = phase.start_day || 1;
  const durationDays = phase.duration_days != null ? phase.duration_days : (phase.duration_weeks || 1) * 7;
  const fLeft = (((phase.start_week - 1) * 7) + (startDay - 1)) * 28;
  const fWidth = durationDays * 28;
  const TOTAL_WIDTH = 8 * 7 * 28;
  const DAY_PX = 28;

  useEffect(() => {
    if (!rectRef.current) return;
    if (!mountedRef.current || reduced) {
      mountedRef.current = true;
      rectRef.current.style.left = fLeft + 'px';
      rectRef.current.style.width = fWidth + 'px';
      return;
    }
    gsap.to(rectRef.current, { left: fLeft, width: fWidth, x: 0, duration: 0.55, ease: 'power3.out' });
  }, [fLeft, fWidth]);

  useEffect(() => {
    if (!editable || !rectRef.current || reduced) return;
    const rect = rectRef.current;

    const moveDrag = Draggable.create(rect, {
      type: 'x',
      bounds: rowRef.current,
      cursor: 'grab',
      activeCursor: 'grabbing',
      edgeResistance: 0.65,
      dragClickables: false,
      onDragStart() { rect.style.zIndex = 5; dragMoved.current = false; },
      onDrag() { dragMoved.current = true; },
      onDragEnd: async () => {
        const dx = moveDrag[0].x;
        const newLeftRaw = Math.max(0, Math.min(TOTAL_WIDTH - fWidth, fLeft + dx));
        const newLeftSnap = Math.round(newLeftRaw / DAY_PX) * DAY_PX;
        const dayIndex = newLeftSnap / DAY_PX;
        const newWeek = Math.min(8, Math.max(1, Math.floor(dayIndex / 7) + 1));
        const newDay = Math.min(7, Math.max(1, (dayIndex % 7) + 1));
        gsap.to(rect, { x: 0, left: newLeftSnap, duration: 0.3, ease: 'power3.out' });
        if (newWeek === phase.start_week && newDay === startDay) return;
        try { await updatePhase(phase.id, { start_week: newWeek, start_day: newDay }); await onChange(); }
        catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
      }
    });

    let startW = fWidth;
    const resizeDrag = resizeHandleRef.current ? Draggable.create(resizeHandleRef.current, {
      type: 'x',
      cursor: 'ew-resize',
      onPress(e) { e.stopPropagation(); startW = rect.offsetWidth; },
      onDrag() {
        const newW = Math.max(DAY_PX, Math.min(TOTAL_WIDTH - parseFloat(rect.style.left || 0), startW + this.x));
        rect.style.width = newW + 'px';
        gsap.set(resizeHandleRef.current, { x: 0 });
      },
      onDragEnd: async () => {
        const days = Math.max(1, Math.min(56, Math.round(rect.offsetWidth / DAY_PX)));
        gsap.to(rect, { width: days * DAY_PX, duration: 0.3, ease: 'power3.out' });
        if (days === durationDays) return;
        const weeks = Math.max(1, Math.min(8, Math.ceil(days / 7)));
        try { await updatePhase(phase.id, { duration_days: days, duration_weeks: weeks }); await onChange(); }
        catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
      }
    }) : null;

    return () => {
      moveDrag.forEach(d => d.kill());
      if (resizeDrag) resizeDrag.forEach(d => d.kill());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, phase.id, fLeft, fWidth, startDay, durationDays]);

  return (
    <div ref={rowRef} className="flex h-[280px] border-b relative items-start pt-10 gantt-grid" style={{ width: TOTAL_WIDTH }}>
      <div
        ref={rectRef}
        data-no-pan="phase-rect"
        className={`absolute h-[200px] rounded-3xl bg-gradient-to-br from-violet-50/70 to-fuchsia-50/40 border-2 border-dashed border-violet-200 z-0 ${editable ? 'cursor-grab hover:border-violet-400 hover:from-violet-100/80 hover:to-fuchsia-100/50 transition-colors' : ''}`}
        style={{ left: fLeft, width: fWidth, willChange: 'transform' }}
        title={editable ? `${phase.name} · ${t('pj.dragHint')}` : phase.name}
      >
        {editable && (
          <>
            <div className="absolute left-3 top-3 text-[10px] font-black text-violet-700/70 uppercase tracking-widest pointer-events-none select-none">
              {phase.name}
            </div>
            <div
              ref={resizeHandleRef}
              data-no-pan="resize"
              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-violet-500/30 rounded-r-3xl transition-colors flex items-center justify-center group"
              title={t('pj.resizeHint')}
            >
              <div className="w-0.5 h-8 bg-violet-400/60 group-hover:bg-violet-600 rounded-full transition-colors" />
            </div>
          </>
        )}
      </div>
      {phase.tasks?.map((tk, tIdx) => (
        <GanttBar key={tk.id} task={tk} tIdx={tIdx} rowRef={rowRef} editable={editable} onChange={onChange} onEditTask={onEditTask} />
      ))}
    </div>
  );
}

function GanttBar({ task, tIdx, rowRef, editable, onChange, onEditTask }) {
  const showToast = useToast(s => s.show);
  const barRef = useRef(null);
  const handleRef = useRef(null);
  const dragMoved = useRef(false);

  const left = (((task.start_week - 1) * 7) + (task.start_day - 1)) * 28;
  const width = task.duration * 28;
  const top = 50 + (tIdx * 44);

  useEffect(() => {
    if (!editable || !barRef.current || reduced) return;
    const bar = barRef.current;
    const handle = handleRef.current;

    const moveDrag = Draggable.create(bar, {
      type: 'x', bounds: rowRef.current, inertia: false,
      cursor: 'grabbing', edgeResistance: 0.7,
      dragClickables: false,
      onDragStart() { bar.style.zIndex = 60; dragMoved.current = false; },
      onDrag() { dragMoved.current = true; },
      onDragEnd: async () => {
        const dx = moveDrag[0].x;
        const newLeftPx = Math.max(0, Math.round((left + dx) / 28) * 28);
        const dayIndex = newLeftPx / 28;
        const newWeek = Math.min(8, Math.max(1, Math.floor(dayIndex / 7) + 1));
        const newDay = Math.min(7, Math.max(1, (dayIndex % 7) + 1));
        gsap.to(bar, { x: newLeftPx - left, duration: 0.25, ease: 'power3.out' });
        try { await updateTask(task.id, { start_week: newWeek, start_day: newDay }); await onChange(); }
        catch (e) { showToast('Error: ' + e.message, 'error'); }
      }
    });

    let startW = width;
    const resizeDrag = handle ? Draggable.create(handle, {
      type: 'x', cursor: 'ew-resize',
      onPress(e) { e.stopPropagation(); startW = bar.offsetWidth; },
      onDrag() { const newW = Math.max(28, startW + this.x); bar.style.width = newW + 'px'; gsap.set(handle, { x: 0 }); },
      onDragEnd: async () => {
        const days = Math.max(1, Math.round(bar.offsetWidth / 28));
        bar.style.width = (days * 28) + 'px';
        try { await updateTask(task.id, { duration: days }); await onChange(); }
        catch (e) { showToast('Error: ' + e.message, 'error'); }
      }
    }) : null;

    return () => {
      if (moveDrag[0]) moveDrag[0].kill();
      if (resizeDrag && resizeDrag[0]) resizeDrag[0].kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, left, width, editable, onChange, rowRef]);

  const handleClick = (e) => {
    if (dragMoved.current) { dragMoved.current = false; return; }
    if (e.target.classList.contains('resize-handle')) return;
    onEditTask(task);
  };

  return (
    <div ref={barRef} onClick={handleClick}
      className={`task-bar absolute h-9 rounded-xl shadow-lg flex items-center px-3 overflow-visible border border-white/40 z-10 text-white ${editable ? 'cursor-grab' : 'cursor-pointer'}`}
      style={{ left, width, top, background: task.completed ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
      <span className="text-[10px] font-bold truncate flex-1">{task.name}</span>
      {editable && <div ref={handleRef} className="resize-handle"></div>}
    </div>
  );
}

function TaskModal({ task, profiles, onClose, onSave, onDelete }) {
  const { profile: currentProfile } = useAuth();
  const { t: tr } = useT();
  const showToast = useToast(s => s.show);
  const [t, setT] = useState({ ...task, subtasks: task.subtasks || [], tags: task.tags || [], priority: task.priority || 'normal', attachments: task.attachments || [] });
  const [newSub, setNewSub] = useState('');
  const [newTag, setNewTag] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const clampDuration = (v) => Math.max(1, Math.min(56, parseInt(v) || 1));
  const clampWeek = (v) => Math.max(1, Math.min(8, parseInt(v) || 1));
  const clampDay = (v) => Math.max(1, Math.min(7, parseInt(v) || 1));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast(tr('pj.task.sizeError'), 'error'); return; }
    setUploading(true);
    try {
      const att = await uploadAttachment(currentProfile.id, task.id, file);
      setT({ ...t, attachments: [...t.attachments, att] });
    } catch (ex) { showToast(tr('pj.errorPrefix') + ex.message, 'error'); }
    finally { setUploading(false); fileRef.current.value = ''; }
  };
  const removeAtt = async (att) => {
    const ok = await askConfirm({ title: tr('pj.task.removeAtt'), message: tr('pj.confirmGeneric'), danger: true });
    if (!ok) return;
    await removeAttachmentFile(att.url).catch(() => {});
    setT({ ...t, attachments: t.attachments.filter(a => a.url !== att.url) });
  };
  const fmtSize = (b) => b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + 'KB' : (b / 1048576).toFixed(1) + 'MB';

  const addSub = () => { if (!newSub.trim()) return; setT({ ...t, subtasks: [...t.subtasks, { id: crypto.randomUUID(), name: newSub.trim(), completed: false }] }); setNewSub(''); };
  const togSub = (id) => setT({ ...t, subtasks: t.subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s) });
  const delSub = (id) => setT({ ...t, subtasks: t.subtasks.filter(s => s.id !== id) });
  const addTag = () => { const v = newTag.trim().replace(/^#/, ''); if (!v || t.tags.includes(v)) return; setT({ ...t, tags: [...t.tags, v] }); setNewTag(''); };
  const delTag = (tg) => setT({ ...t, tags: t.tags.filter(x => x !== tg) });

  return (
    <Modal title={tr('pj.task.title')} onClose={onClose} maxWidth="max-w-3xl"
      footer={(
        <>
          <button onClick={onDelete} className="btn-danger mr-auto"><Trash2 className="w-3.5 h-3.5" /></button>
          <button onClick={onClose} className="btn-ghost">{tr('common.cancel')}</button>
          <button onClick={() => onSave({ name: t.name, assignee_id: t.assignee_id || null, duration: clampDuration(t.duration), start_week: clampWeek(t.start_week), start_day: clampDay(t.start_day), obs: t.obs, subtasks: t.subtasks, tags: t.tags, priority: t.priority, attachments: t.attachments })} className="btn-primary">{tr('common.save')}</button>
        </>
      )}>
      <Field label={tr('pj.task.name')}><input value={t.name} onChange={e => setT({ ...t, name: e.target.value })} className="input-light" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={tr('pj.task.assignee')}>
          <select value={t.assignee_id || ''} onChange={e => setT({ ...t, assignee_id: e.target.value })} className="input-light">
            <option value="">{tr('common.unassigned')}</option>
            {profiles.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label={tr('pj.task.duration')}><input type="number" min="1" max="56" value={t.duration} onChange={e => setT({ ...t, duration: e.target.value })} onBlur={e => setT(s => ({ ...s, duration: clampDuration(e.target.value) }))} className="input-light" /></Field>
        <Field label={tr('pj.task.priority')}>
          <select value={t.priority} onChange={e => setT({ ...t, priority: e.target.value })} className="input-light">
            <option value="low">{tr('pj.task.priorityLow')}</option>
            <option value="normal">{tr('pj.task.priorityNormal')}</option>
            <option value="high">{tr('pj.task.priorityHigh')}</option>
            <option value="urgent">{tr('pj.task.priorityUrgent')}</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('pj.task.startWeek')}><input type="number" min="1" max="8" value={t.start_week} onChange={e => setT({ ...t, start_week: e.target.value })} onBlur={e => setT(s => ({ ...s, start_week: clampWeek(e.target.value) }))} className="input-light" /></Field>
        <Field label={tr('pj.task.startDay')}><input type="number" min="1" max="7" value={t.start_day} onChange={e => setT({ ...t, start_day: e.target.value })} onBlur={e => setT(s => ({ ...s, start_day: clampDay(e.target.value) }))} className="input-light" /></Field>
      </div>

      <Field label={tr('pj.task.tags')}>
        <div className="flex flex-wrap gap-2 mb-2">
          {t.tags.map(tg => (
            <span key={tg} className="bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1">
              #{tg}
              <button onClick={() => delTag(tg)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder={tr('pj.task.addTag')} className="input-light flex-1" />
          <button onClick={addTag} className="btn-soft"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      </Field>

      <Field label={`${tr('pj.task.subtasks')} (${t.subtasks.filter(s => s.completed).length}/${t.subtasks.length})`}>
        <div className="space-y-1.5 mb-2">
          {t.subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 group">
              <input type="checkbox" checked={s.completed} onChange={() => togSub(s.id)} className="rounded text-violet-600 h-4 w-4" />
              <span className={`flex-1 text-[12px] ${s.completed ? 'line-through text-ink-400' : ''}`}>{s.name}</span>
              <button onClick={() => delSub(s.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSub())} placeholder={tr('pj.task.newSub')} className="input-light flex-1" />
          <button onClick={addSub} className="btn-soft"><Plus className="w-3.5 h-3.5" /></button>
        </div>
      </Field>

      <Field label={`${tr('pj.task.attachments')} (${t.attachments.length})`}>
        <div className="space-y-2 mb-2">
          {t.attachments.map((att, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-ink-50 group">
              <span className="text-base">📎</span>
              <a href={att.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-[12px] font-semibold hover:text-violet-600">{att.name}</a>
              <span className="text-[10px] text-ink-400 tabular">{fmtSize(att.size)}</span>
              <button onClick={() => removeAtt(att)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" onChange={handleFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-soft disabled:opacity-50">
            {uploading ? tr('pj.task.uploading') : tr('pj.task.attach')}
          </button>
          <span className="text-[10px] text-ink-400 self-center">{tr('pj.task.maxSize')}</span>
        </div>
      </Field>

      <Field label={tr('pj.task.obs')}><textarea value={t.obs || ''} onChange={e => setT({ ...t, obs: e.target.value })} className="input-light h-20 resize-none" /></Field>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-2 block">{label}</label>
      {children}
    </div>
  );
}

function ExecModal({ project, profiles, onClose }) {
  const { t } = useT();
  const overlayRef = useRef(null);
  const cardRef = useRef(null);
  useEffect(() => {
    if (reduced) return;
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(cardRef.current, { y: 24, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.4)' });
    setTimeout(() => animateBars(cardRef.current), 100);
  }, []);
  const close = () => {
    if (reduced) { onClose(); return; }
    gsap.to(cardRef.current, { y: 12, scale: 0.97, opacity: 0, duration: 0.2 });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose });
  };
  return (
    <div ref={overlayRef} className="modal-overlay">
      <div ref={cardRef} className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="p-10 text-center bg-gradient-to-br from-violet-900 via-violet-800 to-fuchsia-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at 20% 30%, white 0%, transparent 40%), radial-gradient(circle at 80% 70%, white 0%, transparent 40%)' }} />
          <div className="relative">
            <div className="inline-block px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/20 backdrop-blur mb-4">{project.status}</div>
            <h3 className="text-3xl font-black mb-2">{project.title}</h3>
            <p className="opacity-60 text-base">{project.company || ''}</p>
          </div>
        </div>
        <div className="p-10 space-y-8 overflow-y-auto scroller">
          <div className="grid grid-cols-2 gap-10">
            <div>
              <h4 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-3">{t('pj.exec.objective')}</h4>
              <p className="text-ink-700 leading-relaxed font-medium">{project.goal || t('pj.exec.noGoal')}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-3">{t('pj.exec.summary')}</h4>
              <div className="text-violet-900 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5 rounded-2xl italic text-sm border-l-4 border-violet-500">{project.observation || t('pj.exec.noSummary')}</div>
            </div>
          </div>
          <div>
            <h4 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-4">{t('pj.exec.progressMap')}</h4>
            <div className="space-y-3">
              {project.phases?.map(ph => {
                const prog = calcPhaseProgress(ph);
                return (
                  <div key={ph.id} className="flex items-center gap-5 p-4 rounded-2xl border border-ink-100 bg-white hover:shadow-md transition">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-xs font-bold text-ink-800 tracking-tight">{ph.name}</span>
                        <span className="text-xs font-black text-violet-600 tabular">{prog}%</span>
                      </div>
                      <div className="w-full bg-ink-50 h-2 rounded-full overflow-hidden">
                        <div className="progress-fill h-full rounded-full" data-bar={prog} style={{ width: 0 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="p-6 bg-ink-50 border-t flex justify-center gap-3">
          <button onClick={() => downloadCronograma(project, profiles)} className="btn-primary"><Download className="w-4 h-4" /> {t('pj.exec.downloadPdf')}</button>
          <button onClick={close} className="btn-ghost">{t('pj.exec.close')}</button>
        </div>
      </div>
    </div>
  );
}

function MilestonesPanel({ project, editable, onChange }) {
  const showToast = useToast(s => s.show);
  const { t, lang } = useT();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');

  const create = async () => {
    if (!name.trim() || !date) return;
    try { await createMilestone(project.id, { name: name.trim(), target_date: date }); await onChange(); setName(''); setDate(''); setAdding(false); }
    catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };
  const remove = async (id) => {
    const ok = await askConfirm({ title: t('pj.milestones.delete'), message: t('pj.confirmGeneric'), danger: true });
    if (!ok) return;
    try { await deleteMilestone(id); await onChange(); }
    catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };
  const toggle = async (m) => {
    try { await updateMilestone(m.id, { completed: !m.completed }); await onChange(); }
    catch (e) { showToast(t('pj.errorPrefix') + e.message, 'error'); }
  };

  const ms = project.milestones || [];
  const dateLocale = lang === 'en' ? 'en' : lang === 'pt' ? 'pt' : 'es';

  return (
    <div className="bg-white border border-ink-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-amber-50 to-white border-b flex justify-between items-center">
        <span className="font-bold text-sm flex items-center gap-2"><Flag className="w-4 h-4 text-amber-600" /> {t('pj.milestones.title')} · {ms.length}</span>
        {editable && <button onClick={() => setAdding(!adding)} className="btn-primary-sm"><Plus className="w-3 h-3" /> {t('pj.milestones.add')}</button>}
      </div>
      {adding && (
        <div className="p-3 border-b bg-amber-50/40 space-y-2">
          <input placeholder={t('pj.milestones.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} className="input-light" />
          <div className="flex gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-light flex-1" />
            <button onClick={create} className="btn-primary-sm">OK</button>
            <button onClick={() => { setAdding(false); setName(''); setDate(''); }} className="btn-ghost text-xs">×</button>
          </div>
        </div>
      )}
      <div className="divide-y divide-ink-100">
        {ms.length === 0 && <p className="p-4 text-xs text-ink-400 italic text-center">{t('pj.milestones.empty')}</p>}
        {ms.map(m => (
          <div key={m.id} className="p-3 flex items-center gap-3 group hover:bg-ink-50 transition">
            <button onClick={() => toggle(m)} className={`w-6 h-6 rounded-full flex items-center justify-center transition ${m.completed ? 'bg-emerald-500 text-white' : 'border-2 border-ink-200'}`}>
              {m.completed && <ChevronRight className="w-3 h-3 rotate-90" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-[12px] font-semibold ${m.completed ? 'line-through text-ink-400' : ''}`}>{m.name}</div>
              <div className="text-[10px] text-ink-400 tabular">{new Date(m.target_date).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
            {editable && <button onClick={() => remove(m.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FullGanttModal({ project, profiles, editable, onChange, onEditTask, onClose }) {
  const { t } = useT();
  const overlayRef = useRef(null);
  const cardRef = useRef(null);
  const fullScrollerRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.18 });
    gsap.fromTo(cardRef.current, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' });
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (reduced) { onClose(); return; }
    gsap.to(cardRef.current, { opacity: 0, duration: 0.15 });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.15, onComplete: onClose });
  };

  const scrollFull = (deltaWeeks) => {
    const sc = fullScrollerRef.current;
    if (!sc) return;
    const target = sc.scrollLeft + deltaWeeks * 196;
    if (reduced) { sc.scrollLeft = target; return; }
    gsap.to(sc, { scrollLeft: target, duration: 0.45, ease: 'power3.inOut' });
  };

  return (
    <div ref={overlayRef} className="modal-overlay !p-4">
      <div ref={cardRef} className="bg-white w-full h-full rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b flex justify-between items-center bg-white flex-shrink-0">
          <h3 className="text-2xl font-black text-ink-900 tracking-tight">{t('pj.full.title')} · {project.title}</h3>
          <div className="flex items-center gap-4">
            {editable && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full uppercase tracking-widest">{t('pj.full.editActive')}</span>}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: '#7c3aed' }}></div><span className="text-[10px] font-black text-ink-400">{t('pj.exec.pending')}</span>
              <div className="w-3 h-3 rounded-full ml-3" style={{ background: '#10b981' }}></div><span className="text-[10px] font-black text-ink-400">{t('pj.exec.completed')}</span>
            </div>
            <button onClick={() => downloadCronograma(project, profiles)} className="btn-soft" title={t('pj.exec.downloadPdf')}>
              <Download className="w-4 h-4" /> <span className="hidden md:inline">PDF</span>
            </button>
            <button onClick={close} className="btn-dark">{t('pj.back')}</button>
          </div>
        </div>
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="w-80 border-r bg-white overflow-y-auto scroller p-5 space-y-3 flex-shrink-0">
            <h4 className="text-[10px] font-black text-ink-400 uppercase tracking-widest border-b pb-3">{t('pj.full.taskList')}</h4>
            {project.phases?.map(ph => (
              <div key={ph.id}>
                <div className="text-[11px] font-bold text-violet-700 bg-violet-50 p-2 rounded-lg mt-3">{ph.name}</div>
                {ph.tasks?.map(tk => {
                  const ass = profiles.find(u => u.id === tk.assignee_id)?.name || t('common.unassigned');
                  return (
                    <div
                      key={tk.id}
                      onClick={() => editable && onEditTask && onEditTask(tk, ph.id)}
                      className={`p-3 border-l-2 border-ink-100 hover:border-violet-500 transition ${editable ? 'cursor-pointer hover:bg-violet-50/40' : ''}`}
                    >
                      <div className="text-[12px] font-bold text-ink-800 tracking-tight">{tk.name}</div>
                      <div className="text-[10px] text-ink-400 font-semibold">{t('pj.full.resp')} {ass}</div>
                      <div className="text-[10px] text-ink-500 italic opacity-70">{tk.obs || t('pj.full.noDescription')}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex-1 relative bg-ink-50/40 min-w-0">
            <div ref={fullScrollerRef} className="absolute inset-0 overflow-auto scroller-pro p-7">
              <GanttCanvas project={project} editable={editable} onChange={onChange} onEditTask={onEditTask || (() => {})} scrollerRef={fullScrollerRef} />
            </div>
            <button
              type="button"
              onClick={() => scrollFull(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:scale-110 active:scale-95 transition flex items-center justify-center"
              title={t('pj.full.prevWeek')}
              aria-label={t('pj.full.prevWeek')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollFull(1)}
              className="absolute right-5 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 hover:scale-110 active:scale-95 transition flex items-center justify-center"
              title={t('pj.full.nextWeek')}
              aria-label={t('pj.full.nextWeek')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapPopup({ children, onClose }) {
  const { t } = useT();
  const overlayRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
    gsap.fromTo(cardRef.current,
      { y: 24, scale: 0.96, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.3)' }
    );
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (reduced) { onClose(); return; }
    gsap.to(cardRef.current, { y: 16, scale: 0.97, opacity: 0, duration: 0.2 });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose });
  };

  return (
    <div ref={overlayRef} className="modal-overlay !p-3 md:!p-6" onMouseDown={(e) => { if (e.target === overlayRef.current) close(); }}>
      <div
        ref={cardRef}
        className="bg-white w-full max-w-5xl h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        style={{ willChange: 'transform' }}
      >
        <div className="px-5 py-3 bg-gradient-to-r from-violet-700 to-fuchsia-700 text-white flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Map className="w-4 h-4 flex-shrink-0" />
            <span className="text-[12px] font-black uppercase tracking-widest truncate">{t('pj.expandedView')}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={close} className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition flex items-center gap-1.5">
              <Minimize2 className="w-3 h-3" /> {t('pj.dock')}
            </button>
            <button onClick={close} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition" title={t('pj.dock') + ' (Esc)'}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
