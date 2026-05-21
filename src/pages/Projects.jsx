import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Maximize2, Minimize2, X, Trash2, Search, ArrowRight } from 'lucide-react';
import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { calcProjectProgress, STATUSES, PROJECT_FIELD_HELP, PROJECT_CATEGORY_HELP, vencimiento, isFinalStatus, effectiveHealth, fmtMoney } from '../lib/utils';
import { reduced } from '../lib/motion';
import { createProject, friendlyDbError } from '../lib/data';
import { logger } from '../lib/logger';
import { uploadContract } from '../lib/storage';
import { useToast } from '../lib/toast';
import Avatar from '../components/Avatar.jsx';
import ClientPicker from '../components/ClientPicker.jsx';

if (typeof window !== 'undefined') gsap.registerPlugin(Draggable);

const DRAFT_KEY = 'proGestion.newProjectDraft';

// ============== Helpers tabla resumen ==============

function statusSlug(s) {
  if (!s) return '';
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function fmtDate(iso, lang = 'es') {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  const locale = lang === 'pt' ? 'pt-BR' : lang === 'en' ? 'en-US' : 'es-CO';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Reemplaza `{n}` en cadenas i18n. Acepta una sola variable nombrada `n`.
function interp(s, n) {
  return (s || '').replace(/\{n\}/g, n);
}



export default function Projects() {
  const projects = useStore(s => s.projects);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const teams = useStore(s => s.teams);
  const refreshProjects = useStore(s => s.refreshProjects);
  const { profile, can } = useAuth();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const loc = useLocation();
  const showToast = useToast(s => s.show);

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [sortBy, setSortBy] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');

  const [showNew, setShowNew] = useState(false);
  const [newMode, setNewMode] = useState('inline');
  const [draftInitial, setDraftInitial] = useState(null);

  // Restaurar borrador + handle openNew state.
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
    if (loc.state?.openNew) {
      setShowNew(true);
      navigate(loc.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pool visible considerando los 3 ejes de acceso (mig-27):
  //   - viewAll (admin/gerente): todos.
  //   - owner / project_member: clásico.
  //   - viewTeamProjects (lider_equipos|lider_equipo): proyectos del equipo
  //     al que pertenezco (profile.team_id) o que yo manejo.
  const visiblePool = useMemo(() => {
    if (can('viewAll')) return projects;
    const myId = profile?.id;
    const myTeam = profile?.team_id || null;
    const canTeam = can('viewTeamProjects');
    return projects.filter(p =>
      p.owner_id === myId ||
      (p.member_ids || []).includes(myId) ||
      (canTeam && myTeam && p.team_id === myTeam)
    );
  }, [projects, profile, can]);

  const profileMap = useMemo(() => new Map(profiles.map(u => [u.id, u])), [profiles]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // Filtros + búsqueda + sort
  const rows = useMemo(() => {
    let list = visiblePool;
    if (filterCat) list = list.filter(p => p.category_id === filterCat);
    if (filterStatus) list = list.filter(p => p.status === filterStatus);
    if (filterOverdue) list = list.filter(p => vencimiento(p).kind === 'overdue');
    if (filterOwner) {
      if (filterOwner === '__none') list = list.filter(p => !p.owner_id);
      else list = list.filter(p => p.owner_id === filterOwner);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => {
        const owner = profileMap.get(p.owner_id);
        const cat = categoryMap.get(p.category_id);
        const blob = `${p.title} ${p.goal || ''} ${p.client_lead || ''} ${p.observation || ''} ${owner?.name || ''} ${p.owner_label || ''} ${cat?.name || ''}`.toLowerCase();
        return blob.includes(q);
      });
    }
    list = [...list].sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case 'title':
          av = a.title || ''; bv = b.title || ''; break;
        case 'category':
          av = categoryMap.get(a.category_id)?.name || '';
          bv = categoryMap.get(b.category_id)?.name || '';
          break;
        case 'client_lead':
          av = a.client_lead || ''; bv = b.client_lead || ''; break;
        case 'status':
          av = a.status || ''; bv = b.status || ''; break;
        case 'progress':
          av = calcProjectProgress(a); bv = calcProjectProgress(b); break;
        case 'health': {
          const order = { red: 0, amber: 1, gray: 2, green: 3 };
          av = order[effectiveHealth(a, calcProjectProgress(a))] ?? 9;
          bv = order[effectiveHealth(b, calcProjectProgress(b))] ?? 9;
          break;
        }
        case 'owner':
          av = profileMap.get(a.owner_id)?.name || a.owner_label || '';
          bv = profileMap.get(b.owner_id)?.name || b.owner_label || '';
          break;
        case 'start_date':
          av = a.start_date || ''; bv = b.start_date || ''; break;
        case 'projected_end_date':
          av = a.projected_end_date || ''; bv = b.projected_end_date || ''; break;
        case 'vencimiento': {
          const va = vencimiento(a), vb = vencimiento(b);
          av = va.kind === 'overdue' ? -va.days : (va.days ?? 9999);
          bv = vb.kind === 'overdue' ? -vb.days : (vb.days ?? 9999);
          break;
        }
        default:
          av = a[sortBy] || ''; bv = b[sortBy] || '';
      }
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      const cmp = av.toString().localeCompare(bv.toString(), 'es', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [visiblePool, profileMap, categoryMap, filterCat, filterStatus, filterOwner, filterOverdue, search, sortBy, sortDir]);

  // Handlers stat cards: click toggle filtro / reset.
  const resetAllFilters = () => {
    setFilterCat(''); setFilterStatus(''); setFilterOwner(''); setFilterOverdue(false); setSearch('');
  };
  const handleStatClick = (kind) => {
    if (kind === 'total') { resetAllFilters(); return; }
    if (kind === 'inDev') {
      if (filterStatus === 'En Desarrollo' && !filterOverdue && !filterCat && !filterOwner) setFilterStatus('');
      else { resetAllFilters(); setFilterStatus('En Desarrollo'); }
      return;
    }
    if (kind === 'overdue') {
      if (filterOverdue && !filterStatus && !filterCat && !filterOwner) setFilterOverdue(false);
      else { resetAllFilters(); setFilterOverdue(true); }
    }
  };
  const isStatActive = (kind) => {
    if (kind === 'total') return !filterCat && !filterStatus && !filterOwner && !filterOverdue && !search;
    if (kind === 'inDev') return filterStatus === 'En Desarrollo';
    if (kind === 'overdue') return filterOverdue;
    return false;
  };
  const hasAnyFilter = !!(filterCat || filterStatus || filterOwner || filterOverdue || search);

  // Stats arriba
  const stats = useMemo(() => {
    const total = visiblePool.length;
    const enDes = visiblePool.filter(p => p.status === 'En Desarrollo').length;
    const finalized = visiblePool.filter(p => isFinalStatus(p.status)).length;
    const overdue = visiblePool.filter(p => vencimiento(p).kind === 'overdue').length;
    const avgCump = total ? Math.round(visiblePool.reduce((s, p) => s + calcProjectProgress(p), 0) / total) : 0;
    return { total, enDes, finalized, overdue, avgCump };
  }, [visiblePool]);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
  };

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
    } catch (e) {
      const { key, raw } = friendlyDbError(e);
      logger.error('createProject failed', raw, e);
      showToast(t(key), 'error');
    }
  };

  const cancelNew = () => { setShowNew(false); setNewMode('inline'); };

  const discardDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraftInitial(null);
    setShowNew(false);
    setNewMode('inline');
    showToast(t('projects.draftDiscarded'));
  };

  const showGrid = !showNew || newMode === 'popup';

  return (
    <section className="projects-mockup flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-[1500px] mx-auto">
        <header className="pm-header">
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">{t('projects.section')}</p>
            <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight">{t('projects.title')}</h2>
            <p className="text-ink-500 font-medium mt-1 text-sm md:text-base">{showNew && newMode === 'inline' ? t('projects.formCompleteHint') : t('projects.subtitle')}</p>
          </div>
          {!showNew && can('createProject') && (
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> {t('projects.new')}
            </button>
          )}
        </header>

        {showNew && newMode === 'inline' && (
          <NewProjectForm
            mode="inline"
            categories={categories}
            profiles={profiles}
            teams={teams}
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
          <>
            <div className="pm-stats">
              <StatCard label={t('projects.stat.total')} value={stats.total} meta={interp(t('projects.stat.completed'), stats.finalized)} onClick={() => handleStatClick('total')} active={isStatActive('total')} />
              <StatCard label={t('projects.stat.inDev')} value={stats.enDes} meta={stats.total ? interp(t('projects.stat.ofPortfolio'), Math.round(stats.enDes / stats.total * 100)) : '—'} onClick={() => handleStatClick('inDev')} active={isStatActive('inDev')} />
              <StatCard label={t('projects.stat.avgProgress')} value={`${stats.avgCump}%`} meta={t('projects.stat.overTotal')} color={stats.avgCump >= 70 ? '#10b981' : stats.avgCump >= 40 ? '#f59e0b' : '#ef4444'} />
              <StatCard label={t('projects.stat.overdue')} value={stats.overdue} meta={stats.overdue ? t('projects.stat.needsAttention') : t('projects.stat.onTrack')} color={stats.overdue ? '#ef4444' : undefined} onClick={() => handleStatClick('overdue')} active={isStatActive('overdue')} />
            </div>

            {hasAnyFilter && (
              <div className="pm-filter-chip-row">
                <span className="pm-filter-chip-label">{t('projects.activeFilters')}:</span>
                {filterOverdue && (
                  <button className="pm-filter-chip" onClick={() => setFilterOverdue(false)}>
                    {t('projects.stat.overdue')} <span aria-hidden>×</span>
                  </button>
                )}
                {filterStatus && (
                  <button className="pm-filter-chip" onClick={() => setFilterStatus('')}>
                    {filterStatus} <span aria-hidden>×</span>
                  </button>
                )}
                {filterCat && (
                  <button className="pm-filter-chip" onClick={() => setFilterCat('')}>
                    {categoryMap.get(filterCat)?.name || filterCat} <span aria-hidden>×</span>
                  </button>
                )}
                {filterOwner && (
                  <button className="pm-filter-chip" onClick={() => setFilterOwner('')}>
                    {filterOwner === '__none' ? t('projects.unassigned') : (profileMap.get(filterOwner)?.name || filterOwner)} <span aria-hidden>×</span>
                  </button>
                )}
                {search && (
                  <button className="pm-filter-chip" onClick={() => setSearch('')}>
                    “{search}” <span aria-hidden>×</span>
                  </button>
                )}
                <button className="pm-filter-chip-clear" onClick={resetAllFilters}>
                  {t('projects.clearAll')}
                </button>
              </div>
            )}

            <div className="pm-filters">
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#7a7770' }} />
                <input
                  className="pm-input"
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('projects.searchPlaceholder')}
                  style={{ paddingLeft: 32 }}
                />
              </div>
              <select className="pm-select" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="">{t('projects.allTypes')}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="pm-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">{t('projects.allStatus')}</option>
                {STATUSES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <select className="pm-select" value={filterOwner} onChange={e => setFilterOwner(e.target.value)}>
                <option value="">{t('projects.allResponsible')}</option>
                {profiles.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                <option value="__none">{t('projects.unassigned')}</option>
              </select>
            </div>

            <div className="pm-table-wrap">
              <table className="pm-table">
                <thead>
                  <tr>
                    <Th k="title" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.project')}</Th>
                    <Th k="category" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.type')}</Th>
                    <Th k="client_lead" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.dependency')}</Th>
                    <Th k="status" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.status')}</Th>
                    <Th k="health" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.health')}</Th>
                    <Th k="progress" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.progress')}</Th>
                    <Th k="owner" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.responsible')}</Th>
                    <Th k="start_date" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.start')}</Th>
                    <Th k="projected_end_date" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.end')}</Th>
                    <Th k="vencimiento" {...{ sortBy, sortDir, toggleSort }}>{t('projects.col.due')}</Th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(p => {
                    const cat = categoryMap.get(p.category_id);
                    const owner = profileMap.get(p.owner_id);
                    const ownerName = owner?.name || p.owner_label || '';
                    const prog = calcProjectProgress(p);
                    const v = vencimiento(p);
                    const progClass = prog >= 70 ? 'ok' : prog >= 40 ? '' : 'low';
                    return (
                      <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                        <td>
                          <div className="pm-cell-title">{p.title}</div>
                          {p.goal && <div className="pm-cell-sub">{p.goal}</div>}
                        </td>
                        <td>
                          {cat
                            ? <span className="pm-badge tipo">{cat.name}</span>
                            : <span className="pm-muted">—</span>}
                        </td>
                        <td>{p.client_lead || <span className="pm-muted">—</span>}</td>
                        <td>
                          <span className={`pm-badge estado-${statusSlug(p.status)}`}>
                            <span className="pm-badge-dot" />{p.status || '—'}
                          </span>
                        </td>
                        <td>
                          <span className={`pm-health-dot pm-health-${effectiveHealth(p, prog)}`} title={effectiveHealth(p, prog)} />
                        </td>
                        <td style={{ minWidth: 130 }}>
                          <div className="pm-progress-label">{prog}%</div>
                          <div className="pm-progress"><div className={`pm-progress-bar ${progClass}`} style={{ width: prog + '%' }} /></div>
                        </td>
                        <td>
                          {ownerName
                            ? <div className="pm-resp">
                                {owner ? <Avatar user={owner} size={28} /> : <Avatar user={{ name: ownerName }} size={28} />}
                                <span className="pm-resp-name">{ownerName}</span>
                              </div>
                            : <span className="pm-muted">—</span>}
                        </td>
                        <td className="pm-cell-mono">{fmtDate(p.start_date, lang)}</td>
                        <td className="pm-cell-mono">{fmtDate(p.projected_end_date, lang)}</td>
                        <td>
                          {v.kind === 'overdue' && <span className="pm-badge delay">{interp(t('projects.daysOverdue'), v.days)}</span>}
                          {v.kind === 'soon' && <span className="pm-badge warn" style={{ fontSize: 10 }}>{interp(t('projects.dueIn'), v.days)}</span>}
                          {v.kind === 'ok' && <span className="pm-cell-mono">{interp(t('projects.dueIn'), v.days)}</span>}
                          {v.kind === 'done' && <span className="pm-cell-mono" style={{ color: '#10b981' }}>{t('projects.dueOk')}</span>}
                          {v.kind === 'none' && <span className="pm-muted">—</span>}
                        </td>
                        <td className="pm-text-right">
                          <button className="pm-icon-btn" onClick={(e) => { e.stopPropagation(); navigate(`/projects/${p.id}`); }} title={t('projects.openProject')}>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="pm-empty">
                  <div className="pm-empty-title">{t('projects.emptyTitle')}</div>
                  <div>{t('projects.emptyBody')}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showNew && newMode === 'popup' && (
        <NewProjectForm
          mode="popup"
          categories={categories}
          profiles={profiles}
          teams={teams}
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

function Th({ k, sortBy, sortDir, toggleSort, children }) {
  const active = sortBy === k;
  const arrow = active ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th onClick={() => toggleSort(k)} className={active ? 'sorted' : ''}>
      <span className="pm-th-inner">
        {children}
        <span className={`pm-sort-arrow${active ? ' active' : ''}`} aria-hidden>{arrow}</span>
      </span>
    </th>
  );
}

function StatCard({ label, value, meta, color, onClick, active }) {
  const cls = `pm-stat-card${onClick ? ' pm-stat-card-clickable' : ''}${active ? ' pm-stat-card-active' : ''}`;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={cls}>
      <div className="pm-stat-label">{label}</div>
      <div className="pm-stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="pm-stat-meta">{meta}</div>
    </Tag>
  );
}

// ============== NewProjectForm (intacto, mismo flujo previo) ==============
function NewProjectForm({ mode, categories, profiles, teams = [], defaultOwnerId, lockOwner, initialForm, onClose, onDiscard, onSubmit, onToggleMode }) {
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const today = new Date().toISOString().split('T')[0];
  const isDraft = !!initialForm;
  const [form, setForm] = useState(() => initialForm || {
    title: '',
    company: '',
    category_id: categories[0]?.id || '',
    client_lead: '',
    client_id: '',
    status: 'No iniciado',
    goal: '',
    owner_id: defaultOwnerId || (profiles[0]?.id || ''),
    owner_label: '',
    start_date: today,
    projected_end_date: '',
    delivery_date: '',
    contract_url: '',
    observation: '',
    project_value: '',
    project_hours: '',
    currency: 'COP',
    notification_email: '',
    team_id: ''
  });
  // Owner unificado: ON → usa owner_id, OFF → usa owner_label (responsable sin cuenta).
  const [ownerHasAccount, setOwnerHasAccount] = useState(() => {
    if (!initialForm) return true;
    return !!initialForm.owner_id;
  });

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

  useEffect(() => {
    if (mode !== 'popup' || !cardRef.current || reduced) return;
    gsap.fromTo(cardRef.current, { y: 16, scale: 0.97, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.4)' });
  }, [mode]);

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const [contractFile, setContractFile] = useState(null);
  const [uploadingContract, setUploadingContract] = useState(false);

  const submit = async () => {
    if (!form.title.trim()) { showToast(t('projects.error.titleRequired'), 'error'); return; }
    if (ownerHasAccount && !form.owner_id) { showToast(t('projects.error.ownerRequired'), 'error'); return; }
    if (!ownerHasAccount && !form.owner_label.trim()) { showToast(t('projects.error.ownerLabelRequired'), 'error'); return; }
    if (form.projected_end_date && form.start_date && form.projected_end_date < form.start_date) {
      showToast(t('projects.error.dateInvalid'), 'error'); return;
    }
    // Convertir strings vacíos a null para columnas numeric.
    const toNum = v => {
      if (v === '' || v === null || v === undefined) return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };

    // Si el user adjuntó un archivo de contrato, subirlo ahora. La URL
    // resultante reemplaza/llena `contract_url`. defaultOwnerId == auth.uid()
    // (Projects.jsx siempre lo pasa así) y el path empieza con uid → cumple RLS.
    let contractUrl = form.contract_url.trim();
    if (contractFile) {
      if (!defaultOwnerId) { showToast(t('projects.error.contractUpload'), 'error'); return; }
      try {
        setUploadingContract(true);
        const slot = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `tmp-${Date.now()}`;
        const res = await uploadContract(defaultOwnerId, slot, contractFile);
        contractUrl = res.url;
      } catch (e) {
        showToast(t('projects.error.contractUpload') + ': ' + e.message, 'error');
        return;
      } finally {
        setUploadingContract(false);
      }
    }

    onSubmit({
      title: form.title.trim(),
      company: form.company.trim(),
      category_id: form.category_id || null,
      client_lead: form.client_lead.trim(),
      client_id: form.client_id || null,
      status: form.status,
      goal: form.goal.trim(),
      owner_id: ownerHasAccount ? form.owner_id : null,
      owner_label: ownerHasAccount ? '' : form.owner_label.trim(),
      start_date: form.start_date || null,
      projected_end_date: form.projected_end_date || null,
      delivery_date: form.delivery_date || null,
      contract_url: contractUrl,
      observation: form.observation.trim(),
      project_value: toNum(form.project_value),
      project_hours: toNum(form.project_hours),
      currency: form.currency || 'COP',
      notification_email: form.notification_email.trim() || null,
      team_id: form.team_id || null
    });
  };

  // Tarifa /h en vivo (no se guarda).
  const _val = parseFloat(form.project_value);
  const _hrs = parseFloat(form.project_hours);
  const hourlyRate = (Number.isFinite(_val) && _val > 0 && Number.isFinite(_hrs) && _hrs > 0)
    ? _val / _hrs : null;

  const selectedCat = categories.find(c => c.id === form.category_id);
  const catHelp = selectedCat ? PROJECT_CATEGORY_HELP[selectedCat.name] : null;

  const wrapCls = mode === 'popup'
    ? 'fixed top-24 inset-x-0 mx-auto z-50 w-[640px] max-w-[92vw] max-h-[80vh] bg-white rounded-3xl shadow-2xl border border-ink-200 flex flex-col overflow-hidden'
    : 'bg-white rounded-3xl shadow-sm border border-ink-100 flex flex-col overflow-hidden mb-10';

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
          <NewField label="Cliente" help="Cliente con cuenta en la plataforma. Selecciónalo de la lista o créalo desde aquí — siempre queda registrado como usuario del portal.">
            <ClientPicker
              value={form.client_id}
              onChange={(id, name) => { set('client_id', id); set('client_lead', name || ''); }}
              placeholder="Buscar o crear cliente…"
            />
          </NewField>
          <NewField label={t('projects.field.responsible')} help={PROJECT_FIELD_HELP.owner_id}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-ink-600 flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ownerHasAccount}
                  disabled={lockOwner}
                  onChange={e => {
                    const next = e.target.checked;
                    setOwnerHasAccount(next);
                    if (next) set('owner_label', '');
                    else set('owner_id', '');
                  }}
                  className="accent-violet-600"
                />
                {t('projects.field.ownerHasAccount')}
              </label>
            </div>
            {ownerHasAccount ? (
              <select
                value={form.owner_id}
                onChange={e => set('owner_id', e.target.value)}
                disabled={lockOwner}
                className="input-light disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <option value="">{t('projects.field.ownerSelectEmpty')}</option>
                {(lockOwner ? profiles.filter(u => u.id === defaultOwnerId) : profiles).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input
                value={form.owner_label}
                onChange={e => set('owner_label', e.target.value)}
                placeholder={t('projects.field.ownerLabelPlaceholder')}
                className="input-light"
              />
            )}
            {lockOwner && (
              <p className="mt-1.5 text-[11px] text-ink-500 italic leading-snug">
                {t('projects.field.responsibleNote')}
              </p>
            )}
          </NewField>
        </div>

        <NewField label={t('projects.field.notifyEmail')} help={t('projects.field.notifyEmailHelp')}>
          <input
            type="email"
            value={form.notification_email}
            onChange={e => set('notification_email', e.target.value)}
            placeholder="encargado@empresa.com"
            className="input-light"
          />
        </NewField>

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

        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black text-violet-700 uppercase tracking-widest">{t('projects.field.costSection')}</p>
            {hourlyRate != null && (
              <span className="text-[11px] font-bold text-violet-700 bg-white border border-violet-200 rounded-full px-2.5 py-1 tabular">
                ≈ {fmtMoney(hourlyRate, form.currency || 'COP')} {t('projects.field.perHour')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-500 mb-3">{t('projects.field.costHelp')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <NewField label={t('projects.field.currency')}>
              <select
                value={form.currency || 'COP'}
                onChange={e => set('currency', e.target.value)}
                className="input-light"
              >
                <option value="COP">{t('projects.currency.COP')}</option>
                <option value="USD">{t('projects.currency.USD')}</option>
                <option value="BRL">{t('projects.currency.BRL')}</option>
              </select>
            </NewField>
            <NewField label={t('projects.field.value')}>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.project_value}
                onChange={e => set('project_value', e.target.value)}
                placeholder="10000000"
                className="input-light tabular"
              />
            </NewField>
            <NewField label={t('projects.field.hours')}>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.project_hours}
                onChange={e => set('project_hours', e.target.value)}
                placeholder="100"
                className="input-light tabular"
              />
            </NewField>
          </div>
        </div>

        <NewField label={t('projects.field.contract')} help={t('projects.field.contractOrUpload')}>
          <div className="space-y-2">
            <input
              value={form.contract_url}
              onChange={e => { set('contract_url', e.target.value); if (contractFile) setContractFile(null); }}
              placeholder={t('projects.field.contractPlaceholder')}
              className="input-light"
              disabled={!!contractFile}
            />
            <div className="flex items-center gap-2">
              <label className={`btn-soft cursor-pointer ${uploadingContract ? 'opacity-60 pointer-events-none' : ''}`}>
                📎 {contractFile ? t('projects.field.contractChange') : t('projects.field.contractUpload')}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setContractFile(f);
                      set('contract_url', '');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {contractFile && (
                <>
                  <span className="text-[11px] font-bold text-violet-700 truncate flex-1">
                    {contractFile.name} <span className="text-ink-400 font-medium">({Math.round(contractFile.size / 1024)} KB)</span>
                  </span>
                  <button type="button" onClick={() => setContractFile(null)} className="btn-ghost text-red-600 hover:text-red-700 text-[11px]">
                    {t('projects.field.contractRemove')}
                  </button>
                </>
              )}
              {!contractFile && form.contract_url && /^https?:\/\//i.test(form.contract_url) && (
                <a href={form.contract_url} target="_blank" rel="noreferrer" className="btn-soft text-[10px]">↗ {t('projects.field.contractOpen')}</a>
              )}
            </div>
          </div>
        </NewField>

        <NewField label={t('projects.field.observation')} help={PROJECT_FIELD_HELP.observation}>
          <textarea value={form.observation} onChange={e => set('observation', e.target.value)} className="input-light h-20 resize-none" placeholder={t('projects.field.observationPlaceholder')} />
        </NewField>

        {teams.length > 0 && (
          <NewField label="Equipo" help="Equipo dueño del proyecto. Su líder y miembros podrán verlo y editarlo.">
            <select
              value={form.team_id}
              onChange={e => set('team_id', e.target.value)}
              className="input-light"
            >
              <option value="">— sin equipo —</option>
              {teams.map(tm => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
          </NewField>
        )}

        <p className="text-[10px] italic text-ink-500 px-1">
          Los cuestionarios para el cliente se envían desde el detalle del proyecto, una vez creado.
        </p>
      </div>

      <div className="px-6 py-4 border-t bg-ink-50/60 flex flex-wrap justify-end gap-2 flex-shrink-0">
        {onDiscard && (
          <button onClick={onDiscard} className="btn-ghost text-red-600 hover:text-red-700 mr-auto" title={t('projects.discardDraftTitle')}>
            <Trash2 className="w-3.5 h-3.5" /> {t('projects.discardDraftBtn')}
          </button>
        )}
        <button onClick={onClose} className="btn-ghost">{t('projects.close')}</button>
        <button onClick={submit} disabled={uploadingContract} className="btn-primary disabled:opacity-60 disabled:cursor-wait">
          {uploadingContract ? t('projects.uploadingContract') : t('projects.create')}
        </button>
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
