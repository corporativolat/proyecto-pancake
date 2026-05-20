import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, ArrowRight, Search } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';
import { reduced } from '../../lib/motion';
import { calcProjectProgress } from '../../lib/utils';

const STATUS_COLOR = {
  'No iniciado':  'bg-ink-100 text-ink-600',
  'En progreso':  'bg-violet-100 text-violet-700',
  'Pausado':      'bg-amber-100 text-amber-700',
  'En revisión':  'bg-blue-100 text-blue-700',
  'Finalizado':   'bg-emerald-100 text-emerald-700'
};

export default function PortalProjects() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('todos');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, title, status, start_date, projected_end_date, observation, manual_progress, phases(tasks(progress, completed))')
        .eq('client_id', profile.id)
        .order('created_at', { ascending: false });
      if (!cancelled) { setItems(data || []); setLoading(false); }
    };
    load();
    const ch = supabase
      .channel(`portal-projects-${profile.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'projects', filter: `client_id=eq.${profile.id}` }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'phases' }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'tasks' }, () => { if (!cancelled) load(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [profile?.id]);

  const filtered = items.filter(p => {
    if (filter === 'activos' && p.status === 'Finalizado') return false;
    if (filter === 'activos' && p.status === 'Pausado') return false;
    if (filter === 'pausados' && p.status !== 'Pausado') return false;
    if (filter === 'finalizados' && p.status !== 'Finalizado') return false;
    if (q && !p.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    if (loading || reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-fade-h]', { y: 12, opacity: 0, duration: 0.5, ease: 'power3.out' });
      gsap.from('[data-fade-chip]', { y: 8, opacity: 0, duration: 0.35, ease: 'power3.out', stagger: 0.04, delay: 0.1 });
      gsap.from('[data-fade-card]', { y: 18, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06, delay: 0.15 });
      gsap.fromTo('[data-fade-bar]',
        { width: 0 },
        { width: (i, el) => el.dataset.target + '%', duration: 0.9, ease: 'power3.out', delay: 0.45 }
      );
    }, rootRef);
    return () => ctx.revert();
  }, [loading, filtered.length]);

  return (
    <section ref={rootRef} className="flex-1 overflow-y-auto p-6 md:p-10">
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3" data-fade-h>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-ink-400 mb-2">Portal cliente</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Mis proyectos</h1>
          <p className="text-sm text-ink-500 mt-1">{filtered.length} resultado(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
              className="input-light pl-9 pr-3 py-2 text-sm w-48" />
          </div>
        </div>
      </header>

      <div className="flex gap-2 mb-5 overflow-x-auto -mx-2 px-2">
        {[['todos', 'Todos'], ['activos', 'Activos'], ['pausados', 'Pausados'], ['finalizados', 'Finalizados']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} data-fade-chip
            className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition flex-shrink-0 ${filter === k ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30' : 'bg-white border text-ink-500 hover:bg-ink-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <ProjectsSkeleton /> : filtered.length === 0 ? (
        <div className="card-light p-12 text-center">
          <div className="empty">
            <div className="icon-wrap"><FolderKanban className="w-8 h-8 text-emerald-600" /></div>
            <h3 className="font-black text-sm mb-1 text-ink-700">{q || filter !== 'todos' ? 'Sin resultados' : 'Aún no tienes proyectos'}</h3>
            <p className="text-xs text-ink-500 max-w-xs mx-auto">{q || filter !== 'todos' ? 'Prueba con otro filtro o búsqueda.' : 'Cuando tu equipo te asigne un proyecto, lo verás aquí.'}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr">
          {filtered.map(p => {
            const prog = calcProjectProgress(p);
            return (
              <button key={p.id} onClick={() => navigate(`/portal/projects/${p.id}`)} data-fade-card
                className="card-light p-5 text-left group hover:-translate-y-1 hover:border-emerald-300 transition flex flex-col h-full">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-black text-base leading-tight flex-1 line-clamp-2">{p.title}</h3>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status] || 'bg-ink-100 text-ink-600'}`}>{p.status}</span>
                </div>
                <div className="text-[11px] text-ink-500 mb-3 font-mono">{p.start_date || 'Sin inicio'} → {p.projected_end_date || 'Sin fin proyectado'}</div>
                <div className="mt-auto flex items-center gap-3">
                  <div className="flex-1 bg-ink-100 h-2 rounded-full overflow-hidden">
                    <div data-fade-bar data-target={prog} className="progress-fill h-full" style={{ width: prog + '%' }} />
                  </div>
                  <span className="text-xs font-black text-emerald-600 tabular w-10 text-right">{prog}%</span>
                  <ArrowRight className="w-4 h-4 text-ink-300 group-hover:translate-x-1 group-hover:text-emerald-600 transition" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="card-light p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="h-5 w-3/5 shimmer-skel rounded" />
            <div className="h-5 w-20 shimmer-skel rounded-full" />
          </div>
          <div className="h-3 w-1/2 shimmer-skel rounded mb-3" />
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 shimmer-skel rounded-full" />
            <div className="h-3 w-10 shimmer-skel rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
