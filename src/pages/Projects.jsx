import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckSquare, FolderOpen, Plus, Maximize2, Minimize2, X, ChevronDown, Check, Trash2 } from 'lucide-react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { calcProjectProgress, healthSignal, STATUSES, PROJECT_FIELD_HELP, PROJECT_CATEGORY_HELP } from '../lib/utils';
import { animateBars, staggerIn, magnetic, reduced } from '../lib/motion';
import Avatar from '../components/Avatar.jsx';
import { createProject } from '../lib/data';
import { useToast } from '../lib/toast';

if (typeof window !== 'undefined') gsap.registerPlugin(Draggable);

const DRAFT_KEY = 'proGestion.newProjectDraft';

export default function Projects() {
  const projects = useStore(s => s.projects);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const refreshProjects = useStore(s => s.refreshProjects);
  const { profile, can } = useAuth();
  const { t } = useT();
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();
  const loc = useLocation();
  const ref = useRef(null);
  const showToast = useToast(s => s.show);
  const [showNew, setShowNew] = useState(false);
  const [newMode, setNewMode] = useState('inline'); // 'inline' | 'popup'
  const [draftInitial, setDraftInitial] = useState(null);

  // Restaurar borrador del localStorage al montar.
  // Si hay datos no enviados de un proyecto a medio crear, reabrimos el panel.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const fresh = data?.savedAt && (Date.now() - data.savedAt) < 7 * 24 * 60 * 60 * 1000;
        if (fresh && data.form) {
          setDraftInitial(data.form);
          setNewMode(data.mode === 'popup' ? 'popup' : 'inline');
          setShowNew(true);
        } else if (!fresh) {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch { /* ignore */ }
    // Si llegamos con state.openNew (botón sidebar "+ NUEVO PROYECTO"), abrimos el form.
    // Limpiamos el state para que no se reabra al usar el back del navegador.
    if (loc.state?.openNew) {
      setShowNew(true);
      navigate(loc.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    let list = can('viewAll') ? projects : projects.filter(p => p.owner_id === profile?.id || (p.member_ids || []).includes(profile?.id));
    if (filter !== 'all') list = list.filter(p => p.category_id === filter);
    return list;
  }, [projects, profile, can, filter]);

  useEffect(() => {
    if (reduced || !ref.current) return;
    staggerIn(ref.current, '[data-card]');
    animateBars(ref.current);
    const cleanups = [];
    ref.current.querySelectorAll('[data-card]').forEach(c => cleanups.push(magnetic(c, 0.08)));
    return () => cleanups.forEach(c => c());
  }, [visible.length, filter]);

  const handleCreate = async (payload) => {
    try {
      const newP = await createProject(payload);
      await refreshProjects();
      showToast(t('pj.toast.created'));
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setDraftInitial(null);
      setShowNew(false);
      setNewMode('inline');
      navigate(`/projects/${newP.id}`);
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  // Cerrar SIN borrar borrador. El draft sobrevive para retomar después.
  const cancelNew = () => { setShowNew(false); setNewMode('inline'); };

  // Borrar borrador explícitamente.
  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraftInitial(null);
    setShowNew(false);
    setNewMode('inline');
    showToast(t('projects.draftDiscarded'));
  };

  // En modo inline ocultamos el grid: la página entra "en modo creación".
  // En modo popup el grid sigue visible y el formulario flota arrastrable.
  const showGrid = !showNew || newMode === 'popup';

  // Conteo de proyectos por categoría para las pills.
  const countByCat = useMemo(() => {
    const map = { all: 0 };
    const pool = can('viewAll') ? projects : projects.filter(p => p.owner_id === profile?.id || (p.member_ids || []).includes(profile?.id));
    map.all = pool.length;
    for (const p of pool) {
      const k = p.category_id || '__none__';
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }, [projects, profile, can]);

  return (
    <section ref={ref} className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-[1500px] mx-auto">
        <header className="mb-6 md:mb-10">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div>
              <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">{t('projects.section')}</p>
              <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight">{showNew && newMode === 'inline' ? t('projects.newInitiative') : t('projects.title')}</h2>
              <p className="text-ink-500 font-medium mt-1 text-sm md:text-base">{showNew && newMode === 'inline' ? t('projects.formCompleteHint') : t('projects.subtitle')}</p>
            </div>
            {!showNew && can('createProject') && (
              <button onClick={() => setShowNew(true)} className="btn-primary self-start md:self-auto flex-shrink-0"><Plus className="w-4 h-4" /> {t('projects.new')}</button>
            )}
          </div>

          {!showNew && (
            <FilterDropdown
              categories={categories}
              filter={filter}
              setFilter={setFilter}
              countByCat={countByCat}
            />
          )}
        </header>

        {showNew && newMode === 'inline' && (
          <NewProjectForm
            mode="inline"
            categories={categories}
            profiles={profiles}
            defaultOwnerId={profile?.id}
            lockOwner={!can('editAll')}
            initialForm={draftInitial}
            onClose={cancelNew}
            onDiscard={discardDraft}
            onSubmit={handleCreate}
            onToggleMode={() => setNewMode('popup')}
          />
        )}

        {showGrid && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visible.map(pj => {
              const cat = categories.find(c => c.id === pj.category_id);
              const owner = profiles.find(u => u.id === pj.owner_id);
              const prog = calcProjectProgress(pj);
              const tasksTotal = pj.phases?.reduce((a, ph) => a + (ph.tasks?.length || 0), 0) || 0;
              const tasksDone = pj.phases?.reduce((a, ph) => a + (ph.tasks?.filter(t => t.completed).length || 0), 0) || 0;
              const h = healthSignal(pj, prog);
              return (
                <div key={pj.id} data-card onClick={() => navigate(`/projects/${pj.id}`)} className="card-light p-6 cursor-pointer group relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ background: cat?.color || '#cbd5e1' }} />
                  <div className="flex justify-between items-start mb-4 mt-1">
                    <div className="flex items-center gap-2">
                      {cat && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: cat.color + '1a', color: cat.color }}>{cat.name}</span>}
                      <span className={`status-dot status-${h}`} title={t('projects.healthLabel')}></span>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-ink-50 text-ink-600 border border-ink-100">{pj.status}</span>
                  </div>
                  <h3 className="text-lg font-black text-ink-900 mb-1 group-hover:text-violet-600 transition leading-tight">{pj.title}</h3>
                  <p className="text-[10px] text-ink-400 font-semibold uppercase tracking-widest mb-3">{pj.company}</p>
                  <p className="text-xs text-ink-500 italic line-clamp-2 mb-5 h-8 leading-relaxed">{pj.goal || t('projects.noGoal')}</p>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 bg-ink-100 h-1.5 rounded-full overflow-hidden">
                      <div className="progress-fill h-full rounded-full" data-bar={prog} style={{ width: 0 }} />
                    </div>
                    <span className="text-xs font-black text-violet-600 tabular">{prog}%</span>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-ink-100">
                    <div className="flex items-center gap-2">
                      {owner ? <Avatar user={owner} size={28} /> : <Avatar user={{ name: pj.owner_label || '?' }} size={28} />}
                      <span className="text-[11px] font-semibold text-ink-600">{owner?.name || pj.owner_label || t('projects.noLeader')}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-500 tabular">
                      <CheckSquare className="w-3 h-3" />
                      <span>{tasksDone}/{tasksTotal}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {!visible.length && (
              <div className="col-span-3">
                <div className="empty">
                  <div className="icon-wrap"><FolderOpen className="w-8 h-8 text-ink-400" /></div>
                  <p className="text-sm text-ink-400 italic font-medium">{t('projects.empty')}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showNew && newMode === 'popup' && (
        <NewProjectForm
          mode="popup"
          categories={categories}
          profiles={profiles}
          defaultOwnerId={profile?.id}
          lockOwner={!can('editAll')}
          initialForm={draftInitial}
          onClose={cancelNew}
          onDiscard={discardDraft}
          onSubmit={handleCreate}
          onToggleMode={() => setNewMode('inline')}
        />
      )}
    </section>
  );
}

function FilterDropdown({ categories, filter, setFilter, countByCat }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  // Cerrar al click fuera o tecla Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Animación apertura del menú.
  useEffect(() => {
    if (!open || reduced || !menuRef.current) return;
    gsap.fromTo(menuRef.current,
      { y: -6, opacity: 0, scale: 0.97 },
      { y: 0, opacity: 1, scale: 1, duration: 0.22, ease: 'power3.out', transformOrigin: 'top left' }
    );
  }, [open]);

  const current = filter === 'all' ? null : categories.find(c => c.id === filter);
  const currentLabel = current ? current.name : t('projects.allCategories');
  const currentColor = current ? current.color : '#71717a';
  const currentCount = filter === 'all' ? (countByCat.all || 0) : (countByCat[filter] || 0);

  const select = (val) => { setFilter(val); setOpen(false); };

  return (
    <div className="mt-5 md:mt-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-black text-ink-400 uppercase tracking-[0.25em]">{t('projects.filterByType')}</span>
        <div className="flex-1 h-px bg-gradient-to-r from-ink-200/70 to-transparent" />
      </div>
      <div ref={wrapRef} className="relative w-full md:max-w-sm">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border bg-white text-left transition-all ${open ? 'border-violet-500 shadow-lg shadow-violet-500/15' : 'border-ink-200 hover:border-violet-300 hover:shadow-md'}`}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2"
            style={{ background: currentColor, boxShadow: `0 0 0 3px ${currentColor}22` }}
          />
          <span className="text-[12px] font-bold text-ink-800 flex-1 truncate">{currentLabel}</span>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-ink-100 text-ink-700 tabular flex-shrink-0">{currentCount}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            ref={menuRef}
            role="listbox"
            className="absolute z-30 mt-2 left-0 right-0 md:right-auto md:w-full bg-white border border-ink-200 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="max-h-[60vh] overflow-y-auto py-1 scroller">
              <FilterRow
                active={filter === 'all'}
                color="#71717a"
                label={t('projects.allCategories')}
                count={countByCat.all || 0}
                onClick={() => select('all')}
              />
              {categories.length > 0 && <div className="h-px bg-ink-100 mx-3 my-1" />}
              {categories.map(c => (
                <FilterRow
                  key={c.id}
                  active={filter === c.id}
                  color={c.color}
                  label={c.name}
                  count={countByCat[c.id] || 0}
                  onClick={() => select(c.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterRow({ active, color, label, count, onClick }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 transition-all ${active ? 'bg-violet-50' : 'hover:bg-ink-50'}`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className={`text-[12px] flex-1 text-left truncate ${active ? 'font-black text-violet-700' : 'font-semibold text-ink-700'}`}>{label}</span>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full tabular flex-shrink-0 ${active ? 'bg-violet-200 text-violet-800' : 'bg-ink-100 text-ink-600'}`}>{count}</span>
      {active && <Check className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />}
    </button>
  );
}

function NewProjectForm({ mode, categories, profiles, defaultOwnerId, lockOwner, initialForm, onClose, onDiscard, onSubmit, onToggleMode }) {
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const today = new Date().toISOString().split('T')[0];
  const isDraft = !!initialForm;
  const [form, setForm] = useState(() => initialForm || {
    title: '',
    company: '',
    category_id: categories[0]?.id || '',
    client_lead: '',
    status: 'No iniciado',
    goal: '',
    owner_id: defaultOwnerId || (profiles[0]?.id || ''),
    start_date: today,
    projected_end_date: '',
    delivery_date: '',
    contract_url: '',
    observation: ''
  });

  // Autosave del borrador en localStorage SIN debounce.
  // localStorage.setItem es síncrono y rápido (microsegundos) para JSON pequeño,
  // así que escribir en cada keystroke evita perder datos al cambiar de ruta o
  // cerrar la pestaña a mitad de tipear.
  useEffect(() => {
    try {
      const empty = !form.title.trim() && !form.company.trim() && !form.goal.trim()
        && !form.client_lead.trim() && !form.contract_url.trim() && !form.observation.trim();
      if (empty) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, mode, savedAt: Date.now() }));
      }
    } catch { /* quota o LS bloqueado */ }
  }, [form, mode]);

  // Salvavidas extra: guardar al cerrar la pestaña (refresh, cierre navegador, etc.).
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        const empty = !form.title.trim() && !form.company.trim() && !form.goal.trim()
          && !form.client_lead.trim() && !form.contract_url.trim() && !form.observation.trim();
        if (!empty) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, mode, savedAt: Date.now() }));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [form, mode]);

  const cardRef = useRef(null);
  const handleRef = useRef(null);

  // Drag solo en modo popup. trigger = barra superior (handleRef).
  // Bounds = window: la tarjeta no se sale de la ventana.
  useEffect(() => {
    if (mode !== 'popup' || !cardRef.current || !handleRef.current) return;
    if (reduced) return;
    const drag = Draggable.create(cardRef.current, {
      type: 'x,y',
      trigger: handleRef.current,
      bounds: 'body',
      cursor: 'grab',
      activeCursor: 'grabbing',
      dragClickables: false,
      allowEventDefault: true
    });
    return () => { drag.forEach(d => d.kill()); };
  }, [mode]);

  // Animación de entrada del popup.
  useEffect(() => {
    if (mode !== 'popup' || !cardRef.current || reduced) return;
    gsap.fromTo(cardRef.current, { y: 16, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.4)' });
  }, [mode]);

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const submit = () => {
    if (!form.title.trim()) { showToast(t('projects.error.titleRequired'), 'error'); return; }
    if (!form.owner_id) { showToast(t('projects.error.ownerRequired'), 'error'); return; }
    if (form.projected_end_date && form.start_date && form.projected_end_date < form.start_date) {
      showToast(t('projects.error.dateInvalid'), 'error'); return;
    }
    onSubmit({
      title: form.title.trim(),
      company: form.company.trim(),
      category_id: form.category_id || null,
      client_lead: form.client_lead.trim(),
      status: form.status,
      goal: form.goal.trim(),
      owner_id: form.owner_id,
      start_date: form.start_date || null,
      projected_end_date: form.projected_end_date || null,
      delivery_date: form.delivery_date || null,
      contract_url: form.contract_url.trim(),
      observation: form.observation.trim()
    });
  };

  const selectedCat = categories.find(c => c.id === form.category_id);
  const catHelp = selectedCat ? PROJECT_CATEGORY_HELP[selectedCat.name] : null;

  // En popup centramos con inset-x-0 + mx-auto (sin translate, para no chocar con
  // el transform que GSAP Draggable aplicará al arrastrar).
  const wrapCls = mode === 'popup'
    ? 'fixed top-24 inset-x-0 mx-auto z-50 w-[640px] max-w-[92vw] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-ink-200 flex flex-col overflow-hidden'
    : 'bg-white rounded-3xl shadow-sm border border-ink-100 flex flex-col overflow-hidden mb-10';

  // En inline usamos bg-violet-50 sólido (tiene override dark en index.css).
  // El gradient claro from-violet-50 → fuchsia-50 NO tiene override y deja el
  // texto ink-900 (que pasa a blanco en dark) invisible sobre fondo claro.
  const headerCls = mode === 'popup'
    ? 'px-5 py-3 border-b bg-gradient-to-r from-violet-700 to-fuchsia-700 text-white flex justify-between items-center cursor-grab active:cursor-grabbing select-none'
    : 'px-6 py-4 border-b bg-violet-50 flex justify-between items-center';

  return (
    <div ref={cardRef} className={wrapCls} style={mode === 'popup' ? { willChange: 'transform' } : undefined}>
      <div ref={handleRef} className={headerCls}>
        <div className="flex items-center gap-3 min-w-0">
          {mode === 'popup' && <span className="text-white/60 text-xs font-black tracking-widest">⋮⋮</span>}
          <div className="min-w-0">
            <h3 className={`text-base font-black tracking-tight ${mode === 'popup' ? 'text-white' : 'text-ink-900'}`}>{t('projects.newInitiative')}</h3>
            <p className={`text-[10px] font-semibold ${mode === 'popup' ? 'text-white/70' : 'text-ink-500'}`}>
              {mode === 'popup' ? t('projects.dragHint') : t('projects.completeForm')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMode}
            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${mode === 'popup' ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-violet-100 hover:bg-violet-200 text-violet-700'}`}
            title={mode === 'popup' ? t('projects.dockTitle') : t('projects.expandTitle')}
          >
            {mode === 'popup' ? <><Minimize2 className="w-3 h-3" /> {t('pj.dock')}</> : <><Maximize2 className="w-3 h-3" /> {t('pj.expand')}</>}
          </button>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition ${mode === 'popup' ? 'text-white/70 hover:text-white hover:bg-white/15' : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100'}`} title={t('projects.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto scroller ${mode === 'popup' ? 'p-5 space-y-4' : 'p-7 space-y-4'}`}>
        {isDraft && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <span className="text-base leading-none">📝</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-amber-800 leading-tight">{t('projects.draftBanner.title')}</p>
              <p className="text-[10px] text-amber-700 leading-snug mt-0.5">{t('projects.draftBanner.body')}</p>
            </div>
          </div>
        )}
        <p className="text-[11px] text-ink-500 bg-violet-50/60 border border-violet-100 rounded-xl px-4 py-2.5 leading-relaxed">
          {t('projects.helpHeader')} <span className="font-bold">{t('projects.helpHeaderBold')}</span>
        </p>

        <NewField label={t('projects.field.title')} help={PROJECT_FIELD_HELP.title}>
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('projects.field.titlePlaceholder')} className="input-light" autoFocus />
        </NewField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NewField label={t('projects.field.company')} help={PROJECT_FIELD_HELP.company}>
            <input value={form.company} onChange={e => set('company', e.target.value)} className="input-light" />
          </NewField>
          <NewField label={t('projects.field.category')} help={PROJECT_FIELD_HELP.category_id}>
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="input-light">
              <option value="">{t('projects.field.categoryEmpty')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {catHelp && (
              <p className="mt-1.5 text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5 leading-snug">
                <span className="font-bold">{selectedCat.name}:</span> {catHelp}
              </p>
            )}
          </NewField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NewField label={t('projects.field.dependency')} help={PROJECT_FIELD_HELP.client_lead}>
            <input value={form.client_lead} onChange={e => set('client_lead', e.target.value)} placeholder={t('projects.field.dependencyPlaceholder')} className="input-light" />
          </NewField>
          <NewField label={t('projects.field.responsible')} help={PROJECT_FIELD_HELP.owner_id}>
            <select
              value={form.owner_id}
              onChange={e => set('owner_id', e.target.value)}
              disabled={lockOwner}
              className="input-light disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {(lockOwner ? profiles.filter(u => u.id === defaultOwnerId) : profiles).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            {lockOwner && (
              <p className="mt-1.5 text-[11px] text-ink-500 italic leading-snug">
                {t('projects.field.responsibleNote')}
              </p>
            )}
          </NewField>
        </div>

        <NewField label={t('projects.field.status')} help={PROJECT_FIELD_HELP.status}>
          <select value={form.status} onChange={e => set('status', e.target.value)} className="input-light">
            {STATUSES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </NewField>

        <NewField label={t('projects.field.goal')} help={PROJECT_FIELD_HELP.goal}>
          <textarea value={form.goal} onChange={e => set('goal', e.target.value)} className="input-light h-20 resize-none" placeholder={t('projects.field.goalPlaceholder')} />
        </NewField>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NewField label={t('projects.field.startDate')} help={PROJECT_FIELD_HELP.start_date}>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className="input-light" />
          </NewField>
          <NewField label={t('projects.field.projectedEnd')} help={PROJECT_FIELD_HELP.projected_end_date}>
            <input type="date" value={form.projected_end_date} onChange={e => set('projected_end_date', e.target.value)} className="input-light" />
          </NewField>
          <NewField label={t('projects.field.deliveryDate')} help={PROJECT_FIELD_HELP.delivery_date}>
            <input type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} className="input-light" />
          </NewField>
        </div>

        <NewField label={t('projects.field.contract')} help={PROJECT_FIELD_HELP.contract_url}>
          <input value={form.contract_url} onChange={e => set('contract_url', e.target.value)} placeholder={t('projects.field.contractPlaceholder')} className="input-light" />
        </NewField>

        <NewField label={t('projects.field.observation')} help={PROJECT_FIELD_HELP.observation}>
          <textarea value={form.observation} onChange={e => set('observation', e.target.value)} className="input-light h-20 resize-none" placeholder={t('projects.field.observationPlaceholder')} />
        </NewField>
      </div>

      <div className="px-6 py-4 border-t bg-ink-50/60 flex flex-wrap justify-end gap-2 flex-shrink-0">
        {onDiscard && (
          <button onClick={onDiscard} className="btn-ghost text-red-600 hover:text-red-700 mr-auto" title={t('projects.discardDraftTitle')}>
            <Trash2 className="w-3.5 h-3.5" /> {t('projects.discardDraftBtn')}
          </button>
        )}
        <button onClick={onClose} className="btn-ghost">{t('projects.close')}</button>
        <button onClick={submit} className="btn-primary">{t('projects.create')}</button>
      </div>
    </div>
  );
}

function NewField({ label, help, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1 block">{label}</label>
      {help && <p className="text-[11px] text-ink-400 italic mb-2 leading-snug">{help}</p>}
      {children}
    </div>
  );
}
