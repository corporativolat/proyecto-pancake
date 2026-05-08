import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { fetchActivity } from '../lib/comments';
import Avatar from './Avatar.jsx';

const KIND_LABEL = {
  project_create: 'creó proyecto',
  project_delete: 'eliminó proyecto',
  task_complete: 'completó tarea',
  task_create: 'añadió tarea',
  phase_create: 'añadió fase',
  comment_add: 'comentó'
};

export default function ActivityFeed() {
  const [items, setItems] = useState([]);
  useEffect(() => { fetchActivity(15).then(setItems).catch(() => {}); }, []);
  const fmt = (iso) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return Math.floor(diff / 86400) + 'd';
  };
  return (
    <div className="card-light p-7" data-stagger>
      <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
        <Activity className="w-3.5 h-3.5" /> Actividad reciente
      </h3>
      <div className="space-y-3">
        {!items.length && <p className="text-xs text-ink-400 italic">Sin actividad reciente.</p>}
        {items.map(a => (
          <div key={a.id} className="flex items-start gap-3">
            <Avatar user={a.profile} size={28} />
            <div className="flex-1 min-w-0 text-[12px]">
              <span className="font-bold">{a.profile?.name || 'Alguien'}</span>{' '}
              <span className="text-ink-500">{KIND_LABEL[a.kind] || a.kind}</span>
              {a.project && <> <span className="text-ink-700 font-semibold">{a.project.title}</span></>}
              {a.detail && <div className="text-ink-400 text-[11px] truncate">{a.detail}</div>}
            </div>
            <span className="text-[10px] text-ink-400 tabular">{fmt(a.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
