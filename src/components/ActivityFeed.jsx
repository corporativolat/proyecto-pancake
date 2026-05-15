import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { fetchActivity } from '../lib/comments';
import Avatar from './Avatar.jsx';
import { useT } from '../lib/i18n.jsx';
import { logger } from '../lib/logger';

const KIND_LABEL = {
  project_create: 'creó proyecto',
  project_delete: 'eliminó proyecto',
  project_status_change: 'cambió estado',
  project_owner_change: 'cambió responsable',
  project_date_change: 'cambió fecha proyectada',
  project_delivery_change: 'cambió fecha de entrega',
  project_contract_update: 'actualizó contrato',
  task_complete: 'completó tarea',
  task_uncomplete: 'reabrió tarea',
  task_create: 'añadió tarea',
  phase_create: 'añadió fase',
  comment_add: 'comentó',
  milestone_create: 'creó hito',
  milestone_complete: 'completó hito',
  milestone_uncomplete: 'reabrió hito',
};

const TAG_STYLES = {
  sistema:  'bg-ink-100 text-ink-600 border-ink-200',
  avance:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  riesgo:   'bg-red-50 text-red-700 border-red-200',
  decision: 'bg-violet-50 text-violet-700 border-violet-200',
  bloqueo:  'bg-amber-50 text-amber-700 border-amber-200',
  manual:   'bg-violet-50 text-violet-700 border-violet-200',
};

// Filtros disponibles. 'all' = sin filtro de origen.
// 'auto' = solo logs sistema/avance (DB triggers).
// 'manual' = solo logs manual o tags humanos (riesgo/decisión/bloqueo).
const SCOPE_FILTERS = ['all', 'auto', 'manual'];

export default function ActivityFeed({ projectId = null, limit = 30, compact = false }) {
  const [items, setItems] = useState([]);
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { t } = useT();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchActivity({ projectId, limit })
      .then(rows => { if (alive) setItems(rows || []); })
      .catch(e => { if (alive) { logger.error('ActivityFeed:', e); setError(e.message || String(e)); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, limit]);

  const filtered = useMemo(() => {
    if (scope === 'all') return items;
    if (scope === 'auto') return items.filter(a => a.tag === 'sistema' || a.tag === 'avance');
    return items.filter(a => a.tag && !['sistema', 'avance'].includes(a.tag));
  }, [items, scope]);

  const fmt = (iso) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return Math.floor(diff / 86400) + 'd';
  };

  return (
    <div className={`card-light ${compact ? 'p-5' : 'p-7'}`} data-stagger>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" /> {t('activity.title')}
        </h3>
        <div className="flex gap-1">
          {SCOPE_FILTERS.map(k => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md transition ${scope === k ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}
            >
              {t(`activity.scope.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {loading && <p className="text-xs text-ink-400 italic">{t('activity.loading')}</p>}
        {!loading && error && <p className="text-xs text-red-600 italic">Error: {error}</p>}
        {!loading && !error && !filtered.length && <p className="text-xs text-ink-400 italic">{t('activity.empty')}</p>}
        {filtered.map(a => (
          <div key={a.id} className="flex items-start gap-3">
            <Avatar user={a.profile} size={28} />
            <div className="flex-1 min-w-0 text-[12px]">
              <span className="font-bold text-ink-800">{a.profile?.name || t('activity.system')}</span>{' '}
              <span className="text-ink-500">{KIND_LABEL[a.kind] || a.kind}</span>
              {a.project && !projectId && <> <span className="text-ink-700 font-semibold">{a.project.title}</span></>}
              {a.detail && <div className="text-ink-500 text-[11px] truncate" title={a.detail}>{a.detail}</div>}
            </div>
            {a.tag && a.tag !== 'sistema' && (
              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${TAG_STYLES[a.tag] || TAG_STYLES.sistema}`}>
                {a.tag}
              </span>
            )}
            <span className="text-[10px] text-ink-400 tabular flex-shrink-0">{fmt(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
