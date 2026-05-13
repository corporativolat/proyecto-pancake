import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Clock, FileText, ArrowRight } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';

// Dashboard del cliente: estado general de sus proyectos.
// Por ahora consulta directa; en fase 3 se mueve a data.js.
export default function PortalDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [docsPending, setDocsPending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: ps }, { data: ds }] = await Promise.all([
        supabase.from('projects').select('id, title, status, start_date, projected_end_date, observation').eq('client_id', profile.id).order('created_at', { ascending: false }),
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

  if (loading) return <div className="p-10 text-ink-400">Cargando…</div>;

  const active = projects.filter(p => p.status !== 'Finalizado');

  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Hola, {profile?.name || 'Cliente'}</h1>
        <p className="text-sm text-ink-500 mt-1">Resumen de tus proyectos.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KPI label="Proyectos activos" value={active.length} icon={Clock} color="emerald" />
        <KPI label="Documentos pendientes" value={docsPending} icon={FileText} color="amber" />
        <KPI label="Total proyectos" value={projects.length} icon={CheckCircle2} color="violet" />
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-sm font-black">Mis proyectos</h2>
          <button onClick={() => navigate('/portal/projects')} className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="p-10 text-center text-ink-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aún no tienes proyectos asignados.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {projects.slice(0, 5).map(p => (
              <li key={p.id}>
                <button onClick={() => navigate(`/portal/projects/${p.id}`)} className="w-full px-5 py-4 hover:bg-ink-50 transition text-left flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{p.title}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">{p.status} · {p.start_date || 'Sin fecha'}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-300 flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
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
    <div className="bg-white rounded-2xl border shadow-sm p-5">
      <div className={`inline-flex w-10 h-10 items-center justify-center rounded-xl ${cls} mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-3xl font-black tabular">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-widest text-ink-400 mt-1">{label}</div>
    </div>
  );
}
