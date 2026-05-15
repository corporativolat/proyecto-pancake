import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalIcon, ChevronLeft, ChevronRight, PlayCircle, MapPin, Truck, Flag, ArrowRight, Layers, ListTodo, AlertTriangle } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase';
import { reduced } from '../../lib/motion';
import { calcPhaseProgress } from '../../lib/utils';

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const KIND_META = {
  start:     { Icon: PlayCircle,    color: 'violet',  label: 'Inicio' },
  phase:     { Icon: Layers,        color: 'fuchsia', label: 'Etapa' },
  end_proj:  { Icon: MapPin,        color: 'amber',   label: 'Fin proyectado' },
  delivery:  { Icon: Truck,         color: 'emerald', label: 'Entrega' },
  milestone: { Icon: Flag,          color: 'blue',    label: 'Hito' },
  task:      { Icon: ListTodo,      color: 'red',     label: 'Tarea pendiente' },
  task_overdue: { Icon: AlertTriangle, color: 'red',  label: 'Tarea vencida' }
};

const COLOR_BG = {
  violet:  'bg-violet-500',
  fuchsia: 'bg-fuchsia-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
  blue:    'bg-blue-500',
  red:     'bg-red-500',
  ink:     'bg-ink-300'
};
const COLOR_SOFT = {
  violet:  'bg-violet-100 text-violet-700',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700',
  amber:   'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  blue:    'bg-blue-100 text-blue-700',
  red:     'bg-red-100 text-red-700',
  ink:     'bg-ink-100 text-ink-600'
};

// Suma `n` días a una fecha ISO (yyyy-mm-dd) y devuelve ISO.
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PortalCalendar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState(null); // ISO date string
  const rootRef = useRef(null);
  const gridRef = useRef(null);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    const load = async () => {
      const { data: ps } = await supabase.from('projects').select('id, title, start_date, projected_end_date, delivery_date, status').eq('client_id', profile.id);
      const ids = (ps || []).map(p => p.id);
      const [{ data: ms }, { data: phs }, { data: cts }] = ids.length
        ? await Promise.all([
            supabase.from('milestones').select('id, project_id, name, target_date, completed').in('project_id', ids),
            supabase.from('phases').select('id, project_id, name, start_week, start_day, duration_days, duration_weeks, tasks(progress, completed)').in('project_id', ids),
            supabase.from('client_tasks').select('id, project_id, title, priority, due_date, start_date, status').eq('assigned_to', profile.id),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];
      const out = [];
      (ps || []).forEach(p => {
        if (p.start_date)         out.push({ kind: 'start',    date: p.start_date,         label: p.title, projectId: p.id, projectTitle: p.title });
        if (p.projected_end_date) out.push({ kind: 'end_proj', date: p.projected_end_date, label: p.title, projectId: p.id, projectTitle: p.title });
        if (p.delivery_date)      out.push({ kind: 'delivery', date: p.delivery_date,      label: p.title, projectId: p.id, projectTitle: p.title });
      });
      (ms || []).forEach(m => {
        const pj = (ps || []).find(p => p.id === m.project_id);
        out.push({ kind: 'milestone', date: m.target_date, label: m.name, projectId: m.project_id, projectTitle: pj?.title || '', done: m.completed });
      });
      // Etapas: posición relativa al start_date del proyecto -> fecha real + progreso.
      (phs || []).forEach(ph => {
        const pj = (ps || []).find(p => p.id === ph.project_id);
        if (!pj?.start_date) return;
        const dayIndex = ((ph.start_week || 1) - 1) * 7 + ((ph.start_day || 1) - 1);
        const date = addDays(pj.start_date, dayIndex);
        const prog = calcPhaseProgress(ph);
        out.push({ kind: 'phase', date, label: ph.name, projectId: ph.project_id, projectTitle: pj.title, progress: prog, done: prog === 100 });
      });
      // Tareas del cliente: se muestran SIEMPRE en su due_date (fecha de entrega
      // requerida). Las ya entregadas/aprobadas se marcan `done`. Las vencidas
      // sin entregar reciben kind especial para badge rojo.
      const todayStr = new Date().toISOString().split('T')[0];
      (cts || []).forEach(ct => {
        if (!ct.due_date) return;
        const pj = (ps || []).find(p => p.id === ct.project_id);
        const settled = ct.status === 'entregado' || ct.status === 'aprobado';
        const overdue = !settled && ct.due_date < todayStr;
        out.push({
          kind: overdue ? 'task_overdue' : 'task',
          date: ct.due_date,
          label: ct.title,
          projectId: ct.project_id,
          projectTitle: pj?.title || '',
          done: settled,
          priority: ct.priority,
          status: ct.status
        });
      });
      if (!cancelled) { setEvents(out.filter(e => !!e.date)); setLoading(false); }
    };
    load();
    const ch = supabase
      .channel(`portal-cal-${profile.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'projects', filter: `client_id=eq.${profile.id}` }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'phases' }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'tasks' }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'milestones' }, () => { if (!cancelled) load(); })
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'client_tasks', filter: `assigned_to=eq.${profile.id}` }, () => { if (!cancelled) load(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [profile?.id]);

  useEffect(() => {
    if (loading || reduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-fade-h]', { y: 12, opacity: 0, duration: 0.5, ease: 'power3.out' });
      gsap.from('[data-fade-card]', { y: 18, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08, delay: 0.1 });
    }, rootRef);
    return () => ctx.revert();
  }, [loading]);

  useEffect(() => {
    if (reduced || !gridRef.current) return;
    gsap.fromTo(gridRef.current.querySelectorAll('[data-cell]'),
      { opacity: 0, scale: 0.9 },
      { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out', stagger: 0.01 }
    );
  }, [cursor.year, cursor.month]);

  const todayISO = new Date().toISOString().split('T')[0];

  const eventsByDay = useMemo(() => {
    const map = new Map();
    events.forEach(e => {
      const arr = map.get(e.date) || [];
      arr.push(e);
      map.set(e.date, arr);
    });
    return map;
  }, [events]);

  const cells = useMemo(() => buildMonth(cursor.year, cursor.month), [cursor]);

  const prevMonth = () => setCursor(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  const nextMonth = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 });
  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(todayISO);
  };

  const upcoming = useMemo(() => {
    return [...events]
      .filter(e => e.date >= todayISO && !e.done)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [events, todayISO]);

  if (loading) return <CalendarSkeleton />;

  const selectedEvents = selected ? (eventsByDay.get(selected) || []) : [];

  return (
    <section ref={rootRef} className="flex-1 overflow-y-auto p-6 md:p-10">
      <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3" data-fade-h>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-ink-400 mb-2">Portal cliente</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Calendario</h1>
          <p className="text-sm text-ink-500 mt-1">Fechas clave de tus proyectos.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="btn-soft text-xs">Hoy</button>
          <button onClick={prevMonth} className="btn-soft text-xs" title="Mes anterior"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <button onClick={nextMonth} className="btn-soft text-xs" title="Mes siguiente"><ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="card-light overflow-hidden" data-fade-card>
          <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-emerald-50/40 to-transparent">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Mes</div>
              <h2 className="font-black text-lg tracking-tight">{MONTHS[cursor.month]} <span className="text-ink-400 font-mono">{cursor.year}</span></h2>
            </div>
            <Legend />
          </div>

          <div className="grid grid-cols-7 text-center border-b bg-ink-50/40">
            {DOW.map(d => (
              <div key={d} className="py-2 text-[10px] font-black uppercase tracking-widest text-ink-400">{d}</div>
            ))}
          </div>

          <div ref={gridRef} className="grid grid-cols-7 gap-px bg-ink-100">
            {cells.map(c => {
              const evs = eventsByDay.get(c.iso) || [];
              const isToday = c.iso === todayISO;
              const isSelected = c.iso === selected;
              const isOther = !c.inMonth;
              return (
                <button key={c.iso} data-cell
                  onClick={() => setSelected(isSelected ? null : c.iso)}
                  className={`relative min-h-[72px] md:min-h-[88px] p-1.5 md:p-2 text-left bg-white transition group
                    ${isOther ? 'opacity-40' : ''}
                    ${isSelected ? 'ring-2 ring-emerald-500 ring-inset z-10' : ''}
                    ${isToday ? 'bg-emerald-50/50' : 'hover:bg-ink-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-black tabular ${isToday ? 'bg-emerald-600 text-white px-1.5 py-0.5 rounded-full' : isOther ? 'text-ink-400' : 'text-ink-700'}`}>
                      {c.day}
                    </span>
                    {evs.length > 0 && !isToday && (
                      <span className="text-[9px] font-black text-ink-400 bg-ink-100 px-1 rounded">{evs.length}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-0.5 md:gap-1">
                    {evs.slice(0, 3).map((e, i) => {
                      const meta = KIND_META[e.kind] || KIND_META.start;
                      return <span key={i} className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${e.done ? 'bg-ink-300' : COLOR_BG[meta.color]}`} title={e.label} />;
                    })}
                    {evs.length > 3 && <span className="text-[9px] text-ink-400">+{evs.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card-light overflow-hidden" data-fade-card>
            <div className="px-4 py-3 border-b bg-gradient-to-r from-violet-50/40 to-transparent">
              <h3 className="text-xs font-black uppercase tracking-widest text-ink-500">
                {selected ? formatLong(selected) : 'Selecciona un día'}
              </h3>
            </div>
            {selected ? (
              selectedEvents.length === 0 ? (
                <p className="px-4 py-5 text-xs text-ink-400">Sin eventos este día.</p>
              ) : (
                <ul className="divide-y">
                  {selectedEvents.map((e, i) => <EventRow key={i} e={e} onClick={() => navigate(`/portal/projects/${e.projectId}`)} />)}
                </ul>
              )
            ) : (
              <p className="px-4 py-5 text-xs text-ink-400">Toca un día del calendario para ver detalles.</p>
            )}
          </div>

          <div className="card-light overflow-hidden" data-fade-card>
            <div className="px-4 py-3 border-b bg-gradient-to-r from-emerald-50/40 to-transparent">
              <h3 className="text-xs font-black uppercase tracking-widest text-ink-500">Próximos eventos</h3>
            </div>
            {upcoming.length === 0 ? (
              <div className="px-6 py-8 text-center">
                <CalIcon className="w-8 h-8 mx-auto mb-2 text-ink-300" />
                <p className="text-xs text-ink-500">Nada cerca en el calendario.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {upcoming.map((e, i) => <EventRow key={i} e={e} onClick={() => navigate(`/portal/projects/${e.projectId}`)} compact />)}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function EventRow({ e, onClick, compact }) {
  const meta = KIND_META[e.kind] || KIND_META.start;
  const { Icon } = meta;
  const isTask = e.kind === 'task' || e.kind === 'task_overdue';
  return (
    <li>
      <button onClick={onClick}
        className="w-full text-left px-4 py-3 hover:bg-ink-50 transition flex items-start gap-3 group">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${COLOR_SOFT[meta.color]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-ink-400 mb-0.5 flex items-center gap-1.5">
            {meta.label}
            {e.kind === 'phase' && (
              <span className="text-fuchsia-600 tabular">· {e.progress}%</span>
            )}
            {isTask && e.priority === 'urgente' && (
              <span className="text-red-600 font-black">· URGENTE</span>
            )}
          </div>
          <div className={`text-sm font-bold leading-tight ${e.done ? 'line-through text-ink-400' : 'text-ink-800'}`}>{e.label}</div>
          {!compact && e.projectTitle && (e.kind === 'milestone' || e.kind === 'phase' || isTask) && (
            <div className="text-[10px] text-ink-400 mt-0.5 truncate">{e.projectTitle}</div>
          )}
          {e.kind === 'phase' && (
            <div className="mt-1 h-1 bg-ink-100 rounded-full overflow-hidden max-w-[160px]">
              <div className={`h-full rounded-full ${e.done ? 'bg-emerald-500' : 'bg-fuchsia-500'}`} style={{ width: e.progress + '%' }} />
            </div>
          )}
          <div className="text-[10px] font-mono text-ink-400 mt-1">{e.date}</div>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-ink-300 group-hover:translate-x-1 group-hover:text-emerald-600 transition mt-2" />
      </button>
    </li>
  );
}

function Legend() {
  return (
    <div className="hidden md:flex items-center gap-2.5 text-[10px] font-bold text-ink-500">
      {Object.entries(KIND_META).map(([k, m]) => (
        <span key={k} className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${COLOR_BG[m.color]}`} />
          {m.label}
        </span>
      ))}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <section className="flex-1 overflow-y-auto p-6 md:p-10">
      <div className="h-3 w-32 shimmer-skel rounded mb-3" />
      <div className="h-10 w-56 shimmer-skel rounded-lg mb-2" />
      <div className="h-4 w-48 shimmer-skel rounded mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="card-light p-5">
          <div className="h-6 w-40 shimmer-skel rounded mb-5" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-20 shimmer-skel rounded" />
            ))}
          </div>
        </div>
        <div className="card-light p-5 space-y-3">
          <div className="h-4 w-1/2 shimmer-skel rounded" />
          <div className="h-10 w-full shimmer-skel rounded" />
          <div className="h-10 w-full shimmer-skel rounded" />
        </div>
      </div>
    </section>
  );
}

// Construye una grilla de mes con padding de días previos/posteriores hasta llenar 6 semanas (max).
function buildMonth(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // lunes = 0
  const dowMon = (first.getDay() + 6) % 7;
  const totalDays = last.getDate();

  const cells = [];
  // padding previo
  for (let i = dowMon; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    cells.push(makeCell(d, false));
  }
  // mes actual
  for (let d = 1; d <= totalDays; d++) {
    cells.push(makeCell(new Date(year, month, d), true));
  }
  // padding final hasta múltiplo de 7
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].dateObj;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push(makeCell(next, false));
  }
  // si quedan menos de 6 filas, no pasa nada — el grid se ajusta solo

  return cells;
}

function makeCell(d, inMonth) {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { iso, day: d.getDate(), inMonth, dateObj: d };
}

function formatLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} de ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}
