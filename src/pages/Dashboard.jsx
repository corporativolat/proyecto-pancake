import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { FolderKanban, Zap, CheckCircle2, TrendingUp, Search } from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { calcProjectProgress, healthSignal, STATUSES } from '../lib/utils';
import { countUp, animateBars, staggerIn, reduced } from '../lib/motion';
import Avatar from '../components/Avatar.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import Skeleton from '../components/Skeleton.jsx';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Dashboard() {
  const projects = useStore(s => s.projects);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const loading = useStore(s => s.loading);
  const { can, profile } = useAuth();
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();
  const ref = useRef(null);

  const visible = useMemo(() => {
    if (can('viewAll')) return projects;
    return projects.filter(p => p.owner_id === profile?.id || (p.member_ids || []).includes(profile?.id));
  }, [projects, profile, can]);

  const total = visible.length;
  const finished = visible.filter(p => p.status === 'Finalizado').length;
  const active = visible.filter(p => ['En Desarrollo', 'Planeación'].includes(p.status)).length;
  const avg = total ? Math.round(visible.reduce((a, p) => a + calcProjectProgress(p), 0) / total) : 0;

  useEffect(() => {
    if (reduced || !ref.current) return;
    ref.current.querySelectorAll('[data-kpi]').forEach(el => {
      const target = parseInt(el.getAttribute('data-kpi'));
      const suf = el.getAttribute('data-suffix') || '';
      countUp(el, target, { suffix: suf });
    });
    animateBars(ref.current);
    staggerIn(ref.current);
  }, [total, active, finished, avg, filter]);

  const filtered = visible.filter(p => !filter || p.title.toLowerCase().includes(filter.toLowerCase()) || (p.company || '').toLowerCase().includes(filter.toLowerCase()));

  const donutData = useMemo(() => {
    const counts = STATUSES.map(s => visible.filter(p => p.status === s.name).length);
    return {
      labels: STATUSES.map(s => s.name),
      datasets: [{ data: counts, backgroundColor: STATUSES.map(s => s.color), borderWidth: 0, hoverOffset: 12, spacing: 2 }]
    };
  }, [visible]);

  const topOwners = useMemo(() => {
    const map = {};
    visible.forEach(p => {
      if (!p.owner_id) return;
      if (!map[p.owner_id]) map[p.owner_id] = { count: 0, prog: 0 };
      map[p.owner_id].count++;
      map[p.owner_id].prog += calcProjectProgress(p);
    });
    return Object.entries(map).map(([id, v]) => ({ user: profiles.find(u => u.id === id), count: v.count, avgProg: Math.round(v.prog / v.count) }))
      .sort((a, b) => b.count - a.count).slice(0, 5);
  }, [visible, profiles]);

  if (loading && !projects.length) {
    return (
      <section className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
        <div className="max-w-[1500px] mx-auto">
          <div className="mb-6 md:mb-10 space-y-3"><Skeleton w={140} h={12} /><Skeleton w={320} h={42} /><Skeleton w={420} h={18} /></div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 mb-10">
            {[1,2,3,4].map(i => <div key={i} className="kpi-card"><Skeleton w={80} h={12} className="mb-3" /><Skeleton w={120} h={42} /></div>)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5"><div className="lg:col-span-2 card-light p-7 space-y-4">{[1,2,3,4].map(i => <Skeleton key={i} h={28} />)}</div><div className="card-light p-7"><Skeleton h={224} /></div></div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-[1500px] mx-auto">
        <header className="mb-6 md:mb-10 flex flex-col md:flex-row md:justify-between md:items-end gap-3">
          <div>
            <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">Vista Gerencial</p>
            <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight">Panel de Portafolio</h2>
            <p className="text-ink-500 font-medium mt-1 text-sm md:text-base">Indicadores estratégicos y salud global.</p>
          </div>
          <div className="md:text-right">
            <div className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Última actualización</div>
            <div className="text-sm font-bold text-ink-700">{new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 mb-10">
          <KPI label="Iniciativas" target={total} icon={<FolderKanban className="w-4 h-4 text-violet-600" />} iconBg="bg-violet-50" valueClass="text-ink-900" />
          <KPI label="Activos" target={active} icon={<Zap className="w-4 h-4 text-amber-600" />} iconBg="bg-amber-50" valueClass="text-amber-500" />
          <KPI label="Finalizados" target={finished} icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} iconBg="bg-emerald-50" valueClass="text-emerald-500" />
          <div className="kpi-card kpi-primary" data-stagger>
            <div className="flex justify-between items-start mb-3">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">Salud Portafolio</div>
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-white" /></div>
            </div>
            <div className="text-4xl font-black tabular" data-kpi={avg} data-suffix="%">0%</div>
            <div className="w-full h-1.5 bg-white/15 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-white rounded-full" data-bar={avg} style={{ width: 0 }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
          <div className="lg:col-span-2 card-light p-7" data-stagger>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest">Salud por Categoría</h3>
              <span className="text-[10px] font-bold text-ink-400">% promedio de avance</span>
            </div>
            <div className="space-y-4">
              {categories.map(cat => {
                const inCat = visible.filter(p => p.category_id === cat.id);
                const catAvg = inCat.length ? Math.round(inCat.reduce((a, p) => a + calcProjectProgress(p), 0) / inCat.length) : 0;
                return (
                  <div key={cat.id}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: cat.color, boxShadow: `0 0 12px ${cat.color}80` }} />
                        <span className="text-xs font-bold text-ink-700">{cat.name}</span>
                        <span className="text-[10px] font-semibold text-ink-500 bg-ink-100 px-2 py-0.5 rounded-md tabular">{inCat.length}</span>
                      </div>
                      <span className="text-xs font-black text-ink-800 tabular">{catAvg}%</span>
                    </div>
                    <div className="w-full bg-ink-100 h-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" data-bar={catAvg} style={{ width: 0, background: `linear-gradient(90deg, ${cat.color}, ${cat.color}cc)` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-light p-7" data-stagger>
            <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5">Distribución por Estado</h3>
            <div className="relative h-56 mb-5">
              <Doughnut data={donutData} options={{ cutout: '72%', plugins: { legend: { display: false }, tooltip: { backgroundColor: '#09090b', padding: 12, cornerRadius: 12 } }, animation: { duration: 1100 }, maintainAspectRatio: false }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-3xl font-black text-ink-900 tabular" data-kpi={total}>0</div>
                <div className="text-[9px] font-black text-ink-400 uppercase tracking-widest">PROYECTOS</div>
              </div>
            </div>
            <div className="space-y-1.5">
              {STATUSES.map((s) => {
                const c = visible.filter(p => p.status === s.name).length;
                if (!c) return null;
                const pct = total ? Math.round((c / total) * 100) : 0;
                return (
                  <div key={s.name} className="flex items-center gap-2 text-[10px] font-semibold">
                    <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    <span className="flex-1 text-ink-600 truncate">{s.name}</span>
                    <span className="text-ink-400 tabular">{c} · {pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-10">
          <div className="lg:col-span-2 card-light overflow-hidden" data-stagger>
            <div className="px-7 py-5 border-b flex justify-between items-center">
              <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest">Proyectos Activos</h3>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar..." className="bg-ink-100 border border-ink-100 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold focus:ring-2 focus:ring-violet-500 outline-none" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-ink-50/60 border-b">
                  <tr>
                    <Th>Proyecto</Th><Th>Categoría</Th><Th>Líder</Th><Th>Estado</Th><Th>Avance</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map(pj => {
                    const owner = profiles.find(u => u.id === pj.owner_id);
                    const cat = categories.find(c => c.id === pj.category_id);
                    const prog = calcProjectProgress(pj);
                    const h = healthSignal(pj, prog);
                    return (
                      <tr key={pj.id} onClick={() => navigate(`/projects/${pj.id}`)} className="hover:bg-violet-50/40 transition cursor-pointer group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className={`status-dot status-${h}`}></span>
                            <div>
                              <div className="font-bold text-ink-800 text-sm group-hover:text-violet-600 transition">{pj.title}</div>
                              <div className="text-[10px] text-ink-400 font-semibold mt-0.5">{pj.company || ''}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">{cat ? <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: cat.color + '1a', color: cat.color }}>{cat.name}</span> : '-'}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Avatar user={owner} size={28} />
                            <span className="text-[11px] font-semibold text-ink-600">{owner?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className="px-3 py-1 bg-ink-50 border border-ink-100 rounded-full text-[10px] font-bold text-ink-600">{pj.status}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-20 bg-ink-100 h-1.5 rounded-full overflow-hidden">
                              <div className="progress-fill h-full rounded-full" data-bar={prog} style={{ width: 0 }} />
                            </div>
                            <span className="text-[11px] font-black text-ink-800 w-9 text-right tabular">{prog}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr><td colSpan={5}>
                      <div className="empty">
                        <div className="icon-wrap"><FolderKanban className="w-7 h-7 text-ink-400" /></div>
                        <p className="text-sm text-ink-500 italic font-medium">Sin proyectos.</p>
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-5">
          <div className="card-light p-7" data-stagger>
            <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5">Top Líderes</h3>
            <div className="space-y-3">
              {!topOwners.length && <p className="text-xs text-ink-400 italic">Sin líderes asignados.</p>}
              {topOwners.map(it => (
                <div key={it.user?.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-ink-50 transition">
                  <Avatar user={it.user} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-ink-800 truncate">{it.user?.name || '-'}</div>
                    <div className="text-[10px] font-semibold text-ink-400">{it.count} proyecto{it.count > 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-xs font-black text-violet-600 tabular">{it.avgProg}%</div>
                </div>
              ))}
            </div>
          </div>
          <ActivityFeed />
          </div>
        </div>
      </div>
    </section>
  );
}

function KPI({ label, target, icon, iconBg, valueClass }) {
  return (
    <div className="kpi-card" data-stagger>
      <div className="flex justify-between items-start mb-3">
        <div className="text-[10px] font-bold text-ink-500 uppercase tracking-widest">{label}</div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <div className={`text-4xl font-black tabular ${valueClass}`} data-kpi={target}>0</div>
    </div>
  );
}
function Th({ children }) {
  return <th className="px-6 py-3 text-[10px] font-black text-ink-400 uppercase tracking-[0.2em]">{children}</th>;
}
