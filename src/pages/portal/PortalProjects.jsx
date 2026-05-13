import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, ArrowRight, Search } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';

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
  const [filter, setFilter] = useState('todos'); // todos | activos | pausados | finalizados
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, title, status, start_date, projected_end_date, observation, manual_progress')
        .eq('client_id', profile.id)
        .order('created_at', { ascending: false });
      if (!cancelled) { setItems(data || []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const filtered = items.filter(p => {
    if (filter === 'activos' && p.status === 'Finalizado') return false;
    if (filter === 'activos' && p.status === 'Pausado') return false;
    if (filter === 'pausados' && p.status !== 'Pausado') return false;
    if (filter === 'finalizados' && p.status !== 'Finalizado') return false;
    if (q && !p.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10">
      <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Mis proyectos</h1>
          <p className="text-sm text-ink-500 mt-1">{filtered.length} resultado(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
              className="bg-white border rounded-xl pl-9 pr-3 py-2 text-sm w-48 outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
      </header>

      <div className="flex gap-2 mb-5 overflow-x-auto -mx-2 px-2">
        {[['todos', 'Todos'], ['activos', 'Activos'], ['pausados', 'Pausados'], ['finalizados', 'Finalizados']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition flex-shrink-0 ${filter === k ? 'bg-emerald-600 text-white' : 'bg-white border text-ink-500 hover:bg-ink-50'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <div className="text-ink-400">Cargando…</div> : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center text-ink-400">
          <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin proyectos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(p => (
            <button key={p.id} onClick={() => navigate(`/portal/projects/${p.id}`)}
              className="text-left bg-white border rounded-2xl p-5 hover:shadow-md hover:border-emerald-300 transition group">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-black text-base leading-tight flex-1">{p.title}</h3>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${STATUS_COLOR[p.status] || 'bg-ink-100 text-ink-600'}`}>{p.status}</span>
              </div>
              <div className="text-[11px] text-ink-500 mb-3">{p.start_date || 'Sin inicio'} → {p.projected_end_date || 'Sin fin proyectado'}</div>
              <div className="flex items-center justify-between">
                <div className="flex-1 bg-ink-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all" style={{ width: (p.manual_progress ?? 0) + '%' }} />
                </div>
                <span className="ml-3 text-xs font-black text-emerald-600 tabular">{p.manual_progress ?? 0}%</span>
                <ArrowRight className="w-4 h-4 text-ink-300 ml-3 group-hover:translate-x-1 transition" />
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
