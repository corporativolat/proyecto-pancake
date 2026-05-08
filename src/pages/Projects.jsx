import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, FolderOpen, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { calcProjectProgress, healthSignal } from '../lib/utils';
import { animateBars, staggerIn, magnetic, reduced } from '../lib/motion';
import Avatar from '../components/Avatar.jsx';
import { createProject } from '../lib/data';
import { useToast } from '../lib/toast';

export default function Projects() {
  const projects = useStore(s => s.projects);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const refreshProjects = useStore(s => s.refreshProjects);
  const { profile, can } = useAuth();
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();
  const ref = useRef(null);
  const showToast = useToast(s => s.show);

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

  const handleNew = async () => {
    if (!can('createProject')) return;
    try {
      const cat = categories[0];
      const newP = await createProject({
        title: 'Nueva Iniciativa', company: '', category_id: cat?.id || null,
        owner_id: profile.id, start_date: new Date().toISOString().split('T')[0],
        status: 'No iniciado', goal: '', observation: ''
      });
      await refreshProjects();
      showToast('✓ Proyecto creado');
      navigate(`/projects/${newP.id}`);
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  return (
    <section ref={ref} className="flex-1 p-10 overflow-y-auto scroller">
      <div className="max-w-[1500px] mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">Iniciativas</p>
            <h2 className="text-4xl font-black text-ink-900 tracking-tight">Proyectos</h2>
            <p className="text-ink-500 font-medium mt-1">Lista completa del portafolio.</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFilter('all')} className={`cat-pill bg-ink-100 text-ink-600 ${filter === 'all' ? 'active' : ''}`}>Todas</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setFilter(c.id)} className={`cat-pill ${filter === c.id ? 'active' : ''}`} style={filter === c.id ? {} : { background: c.color + '1a', color: c.color }}>{c.name}</button>
              ))}
            </div>
            {can('createProject') && (
              <button onClick={handleNew} className="btn-primary"><Plus className="w-4 h-4" /> NUEVO</button>
            )}
          </div>
        </header>

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
                    <span className={`status-dot status-${h}`} title="Salud"></span>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-ink-50 text-ink-600 border border-ink-100">{pj.status}</span>
                </div>
                <h3 className="text-lg font-black text-ink-900 mb-1 group-hover:text-violet-600 transition leading-tight">{pj.title}</h3>
                <p className="text-[10px] text-ink-400 font-semibold uppercase tracking-widest mb-3">{pj.company}</p>
                <p className="text-xs text-ink-500 italic line-clamp-2 mb-5 h-8 leading-relaxed">{pj.goal || 'Sin objetivo definido.'}</p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 bg-ink-100 h-1.5 rounded-full overflow-hidden">
                    <div className="progress-fill h-full rounded-full" data-bar={prog} style={{ width: 0 }} />
                  </div>
                  <span className="text-xs font-black text-violet-600 tabular">{prog}%</span>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-ink-100">
                  <div className="flex items-center gap-2">
                    {owner && <Avatar user={owner} size={28} />}
                    <span className="text-[11px] font-semibold text-ink-600">{owner?.name || 'Sin líder'}</span>
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
                <p className="text-sm text-ink-400 italic font-medium">Sin proyectos en esta categoría.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
