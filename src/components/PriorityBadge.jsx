import { PRIORITY, PRIORITY_OPTIONS } from '../lib/utils';

// Badge inline para mostrar la prioridad (⭐ Estrella / ⚠️ Atención).
// Mantiene el patrón visual de pm-badge (clase ya estilizada en index.css).
//
// Variantes:
//   - size="sm"  → 14px icon, sin label (para tabla)
//   - size="md"  → 18px icon + label (para header del detalle)
//   - editable   → se vuelve <select> en línea (mismo look) si se pasa onChange
export default function PriorityBadge({ value, size = 'sm', editable = false, disabled = false, onChange, className = '' }) {
  if (editable && onChange) {
    return (
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        className={`text-[10px] font-bold uppercase tracking-widest bg-white border rounded-full px-2.5 py-1 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
        title="Marcador de atención del proyecto"
      >
        {PRIORITY_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.icon ? `${o.icon} ${o.label}` : o.label}</option>
        ))}
      </select>
    );
  }
  if (!value) {
    if (size === 'sm') return <span className="text-ink-300 select-none" aria-hidden>·</span>;
    return null;
  }
  const meta = PRIORITY[value];
  if (!meta) return null;
  if (size === 'sm') {
    return (
      <span title={meta.label} className={`inline-flex items-center justify-center text-[14px] leading-none ${className}`}>
        {meta.icon}
      </span>
    );
  }
  const tone = meta.tone === 'amber'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-red-50 text-red-700 border-red-200';
  return (
    <span
      title={meta.label}
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest border rounded-full px-2.5 py-1 ${tone} ${className}`}
    >
      <span className="text-[13px] leading-none">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
