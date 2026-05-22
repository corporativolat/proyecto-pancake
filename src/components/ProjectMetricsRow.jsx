import { Calendar, Clock, Hourglass } from 'lucide-react';
import { daysSinceStart, daysToDue, projectDurationDays, vencimiento, isFinalStatus } from '../lib/utils';

// Tira compacta de 3 métricas calculadas del Excel:
//   Δ días desde inicio · Tiempo de vencimiento · Duración total
// Se monta en el header del detalle de proyecto y, opcionalmente, debajo
// del título en la tabla principal (cuando hay espacio).
//
// Cada métrica se oculta si la fecha base no está, para no mostrar "—".
export default function ProjectMetricsRow({ project, dense = false }) {
  const since = daysSinceStart(project);
  const toDue = daysToDue(project);
  const dur   = projectDurationDays(project);
  const v     = vencimiento(project);

  const items = [];

  if (Number.isFinite(since)) {
    const lbl = since === 0 ? 'inicia hoy'
              : since > 0   ? `hace ${since}d`
              : `en ${-since}d`;
    items.push({
      key: 'since',
      Icon: Calendar,
      label: 'Inicio',
      value: lbl,
      tone: since < 0 ? 'soft' : 'neutral'
    });
  }

  if (Number.isFinite(toDue) && !isFinalStatus(project?.status)) {
    let tone = 'neutral';
    let val;
    if (v.kind === 'overdue') { tone = 'red';   val = `${v.days}d vencida`; }
    else if (v.kind === 'soon') { tone = 'amber'; val = `vence en ${v.days}d`; }
    else { tone = 'green'; val = `vence en ${toDue}d`; }
    items.push({ key: 'due', Icon: Clock, label: 'Vence', value: val, tone });
  }

  if (Number.isFinite(dur)) {
    items.push({
      key: 'dur',
      Icon: Hourglass,
      label: 'Duración',
      value: `${dur}d`,
      tone: 'neutral'
    });
  }

  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center ${dense ? 'gap-1.5' : 'gap-2'}`}>
      {items.map(it => <MetricChip key={it.key} {...it} dense={dense} />)}
    </div>
  );
}

const TONES = {
  neutral: 'bg-ink-50 text-ink-600 border-ink-200',
  soft:    'bg-violet-50 text-violet-700 border-violet-100',
  green:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  red:     'bg-red-50 text-red-700 border-red-200'
};

function MetricChip({ Icon, label, value, tone = 'neutral', dense }) {
  return (
    <span
      title={`${label}: ${value}`}
      className={`inline-flex items-center gap-1.5 ${dense ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-2.5 py-1'} font-bold border rounded-full whitespace-nowrap ${TONES[tone] || TONES.neutral}`}
    >
      <Icon className={dense ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span className="opacity-70 uppercase tracking-wider text-[9px]">{label}</span>
      <span className="tabular">{value}</span>
    </span>
  );
}
