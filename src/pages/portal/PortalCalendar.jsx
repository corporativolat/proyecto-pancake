import { useEffect, useState } from 'react';
import { Calendar as CalIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';

// Calendario cliente: lista cronológica de hitos + fechas clave de sus proyectos.
// Fase 3 amplía a vista mes/semana.
export default function PortalCalendar() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: ps } = await supabase.from('projects').select('id, title, start_date, projected_end_date, delivery_date').eq('client_id', profile.id);
      const ids = (ps || []).map(p => p.id);
      const { data: ms } = ids.length
        ? await supabase.from('milestones').select('id, project_id, name, target_date, completed').in('project_id', ids)
        : { data: [] };
      const out = [];
      (ps || []).forEach(p => {
        if (p.start_date)         out.push({ kind: 'start',    date: p.start_date,         label: 'Inicio · ' + p.title, projectId: p.id });
        if (p.projected_end_date) out.push({ kind: 'end_proj', date: p.projected_end_date, label: 'Fin proyectado · ' + p.title, projectId: p.id });
        if (p.delivery_date)      out.push({ kind: 'delivery', date: p.delivery_date,      label: 'Entrega · ' + p.title, projectId: p.id });
      });
      (ms || []).forEach(m => {
        const pj = (ps || []).find(p => p.id === m.project_id);
        out.push({ kind: 'milestone', date: m.target_date, label: m.name + ' · ' + (pj?.title || ''), projectId: m.project_id, done: m.completed });
      });
      out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (!cancelled) { setItems(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  if (loading) return <div className="p-10 text-ink-400">Cargando…</div>;

  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Calendario</h1>
        <p className="text-sm text-ink-500 mt-1">Fechas importantes de tus proyectos.</p>
      </header>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center text-ink-400">
          <CalIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin fechas registradas.</p>
        </div>
      ) : (
        <ul className="bg-white border rounded-2xl divide-y overflow-hidden">
          {items.map((it, i) => {
            const cls = {
              start:     'bg-violet-50 text-violet-700',
              end_proj:  'bg-amber-50 text-amber-700',
              delivery:  'bg-emerald-50 text-emerald-700',
              milestone: it.done ? 'bg-ink-100 text-ink-500' : 'bg-blue-50 text-blue-700'
            }[it.kind];
            return (
              <li key={i} className="px-5 py-3 flex items-center gap-3">
                <div className={`w-14 text-center text-[10px] font-black uppercase tracking-widest rounded-lg py-1.5 ${cls}`}>{it.kind === 'end_proj' ? 'Fin' : it.kind === 'milestone' ? 'Hito' : it.kind}</div>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${it.done ? 'line-through text-ink-400' : ''}`}>{it.label}</div>
                  <div className="text-[11px] text-ink-400 tabular">{it.date}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
