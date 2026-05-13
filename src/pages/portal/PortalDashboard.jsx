import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, FileText, ArrowRight, FolderKanban } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';
import { reduced } from '../../lib/motion';
import PendingDocsBanner from '../../components/PendingDocsBanner.jsx';

const STATUS_COLOR = {
  'No iniciado':  'bg-ink-100 text-ink-600',
  'En progreso':  'bg-violet-100 text-violet-700',
  'Pausado':      'bg-amber-100 text-amber-700',
  'En revisión':  'bg-blue-100 text-blue-700',
  'Finalizado':   'bg-emerald-100 text-emerald-700'
};

export default function PortalDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [docsPending, setDocsPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: ps }, { data: ds }] = await Promise.all([
        supabase.from('projects').select('id, title, status, start_date, projected_end_date, observation, manual_progress').eq('client_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('documents').select('id, project_id, status').eq('status', 'pendiente')
      ]);
      if (cancelled) return;
      setProjects(ps || []);
      const projectIds = new Set((ps || []).map(p => p.id));
      setDocsPending((ds || []).filter(d => projectIds.has(d.project_id)).length);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    if (loading || reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-fade-h]', { y: 12, opacity: 0, duration: 0.5, ease: 'power3.out' });
      gsap.from('[data-fade-kpi]', { y: 18, opacity: 0, duration: 0.55, ease: 'power3.out', stagger: 0.08, delay: 0.05 });
      gsap.from('[data-fade-row]', { y: 14, opacity: 0, duration: 0.45, ease: 'power3.out', stagger: 0.05, delay: 0.2 });
      gsap.fromTo('[data-fade-bar]',
        { width: 0 },
        { width: (i, el) => el.dataset.target + '%', duration: 0.9, ease: 'power3.out', delay: 0.4 }
      );
    }, rootRef);
    return () => ctx.revert();
  }, [loading, projects.length]);

  if (loading) return <DashboardSkeleton />;

  const active = projects.filter(p => p.status !== 'Finalizado');

  return (
    <section ref={rootRef} className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl">
      <header className="mb-6" data-fade-h>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-ink-400 mb-2">Portal cliente</div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Hola, {profile?.name || 'Cliente'}</h1>
        <p className="text-sm text-ink-500 mt-1">Resumen de tus proyectos activos.</p>
      </header>

      <PendingDocsBanner />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KPI label="Proyectos activos" value={active.length} icon={Clock} color="emerald" />
        <KPI label="Documentos pendientes" value={docsPending} icon={FileText} color="amber" />
        <KPI label="Total proyectos" value={projects.length} icon={CheckCircle2} color="violet" />
      </div>

      <div className="card-light overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black">Mis proyectos</h2>
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mt-0.5">Últimos 5</div>
          </div>
          {projects.length > 0 && (
            <button onClick={() => navigate('/portal/projects')} className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
        {projects.length === 0 ? (
          <div className="empty">
            <div className="icon-wrap"><FolderKanban className="w-8 h-8 text-emerald-600" /></div>
            <h3 className="font-black text-sm mb-1 text-ink-700">Aún no tienes proyectos</h3>
            <p className="text-xs text-ink-500 max-w-xs mx-auto">Cuando tu equipo te asigne uno, aparecerá aquí con su avance y fechas clave.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {projects.slice(0, 5).map(p => {
              const prog = p.manual_progress ?? 0;
              return (
                <li key={p.id} data-fade-row>
                  <button onClick={() => navigate(`/portal/projects/${p.id}`)} className="w-full px-5 py-4 hover:bg-ink-50 transition text-left flex items-center gap-4 group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-bold text-sm truncate">{p.title}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status] || 'bg-ink-100 text-ink-600'}`}>{p.status}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-ink-100 h-1.5 rounded-full overflow-hidden">
                          <div data-fade-bar data-target={prog} className="progress-fill h-full" style={{ width: prog + '%' }} />
                        </div>
                        <span className="text-[10px] font-black tabular text-emerald-700 w-10 text-right">{prog}%</span>
                      </div>
                      <div className="text-[10px] text-ink-400 mt-1.5 font-mono">{p.start_date || 'Sin inicio'} → {p.projected_end_date || 'Sin fin'}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-ink-300 flex-shrink-0 group-hover:translate-x-1 group-hover:text-emerald-600 transition" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl">
      <div className="h-3 w-32 shimmer-skel rounded mb-3" />
      <div className="h-10 w-72 shimmer-skel rounded-lg mb-2" />
      <div className="h-4 w-48 shimmer-skel rounded mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="kpi-card">
            <div className="w-10 h-10 shimmer-skel rounded-xl mb-3" />
            <div className="h-9 w-20 shimmer-skel rounded mb-2" />
            <div className="h-3 w-32 shimmer-skel rounded" />
          </div>
        ))}
      </div>
      <div className="card-light p-5 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-4 w-3/4 shimmer-skel rounded mb-2" />
              <div className="h-2 w-full shimmer-skel rounded-full" />
            </div>
            <div className="w-6 h-6 shimmer-skel rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}

function KPI({ label, value, icon: Icon, color }) {
  const cls = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    violet:  'bg-violet-50 text-violet-600'
  }[color] || 'bg-ink-50 text-ink-600';
  return (
    <div className="kpi-card" data-fade-kpi>
      <div className={`inline-flex w-10 h-10 items-center justify-center rounded-xl ${cls} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-4xl font-black tabular tracking-tight">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400 mt-1">{label}</div>
    </div>
  );
}
