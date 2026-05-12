import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { calcProjectProgress, vencimiento, isFinalStatus } from '../lib/utils';
import { updateProject } from '../lib/data';
import { useToast } from '../lib/toast';
import Avatar from './Avatar.jsx';

const STALE_DAYS = 7;

export default function TeamMembersGrid() {
  const profiles = useStore(s => s.profiles);
  const projects = useStore(s => s.projects);
  const refreshProjects = useStore(s => s.refreshProjects);
  const { profile, can } = useAuth();
  const navigate = useNavigate();
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const [drillId, setDrillId] = useState(null);
  const [reassigning, setReassigning] = useState(null); // { projectId, currentOwnerId }

  const canManage = can('editAll');

  const metricsByUser = useMemo(() => {
    const now = Date.now();
    return profiles.map(u => {
      const owned = projects.filter(p => p.owner_id === u.id);
      const active = owned.filter(p => !isFinalStatus(p.status));
      const overdue = owned.filter(p => vencimiento(p).kind === 'overdue');
      const stale = active.filter(p => {
        if (!p.updated_at) return false;
        return (now - new Date(p.updated_at).getTime()) / 86400000 > STALE_DAYS;
      });
      const avg = owned.length
        ? Math.round(owned.reduce((a, p) => a + calcProjectProgress(p), 0) / owned.length)
        : 0;
      let load;
      if (active.length > 5) load = 'high';
      else if (active.length >= 3) load = 'med';
      else load = 'low';
      return { user: u, owned, active, overdue, stale, avg, load };
    }).sort((a, b) => b.active.length - a.active.length);
  }, [profiles, projects]);

  const drillUser = drillId ? metricsByUser.find(m => m.user.id === drillId) : null;

  const reassign = async (projectId, newOwnerId) => {
    try {
      await updateProject(projectId, { owner_id: newOwnerId, owner_label: '' });
      await refreshProjects();
      showToast(t('team.reassign.success'));
      setReassigning(null);
    } catch (e) {
      showToast(t('common.errorPrefix') + e.message, 'error');
    }
  };

  return (
    <div className="card-light p-7" data-stagger>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
          <Users className="w-3.5 h-3.5" /> {t('team.members.title')}
        </h3>
        <span className="text-[10px] text-ink-400">{t('team.members.hint')}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {metricsByUser.map(m => {
          const loadCls = m.load === 'high'
            ? 'border-red-200 bg-red-50/40'
            : m.load === 'med'
              ? 'border-amber-200 bg-amber-50/40'
              : 'border-ink-100 bg-white';
          const loadBadge = m.load === 'high'
            ? 'bg-red-100 text-red-700'
            : m.load === 'med'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-emerald-100 text-emerald-700';
          const loadLabel = m.load === 'high'
            ? t('team.members.overloaded')
            : m.load === 'med'
              ? t('team.members.busy')
              : t('team.members.light');
          const isMe = m.user.id === profile?.id;
          return (
            <button
              key={m.user.id}
              onClick={() => setDrillId(m.user.id)}
              className={`text-left p-4 rounded-2xl border-2 transition hover:shadow-md group ${loadCls}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <Avatar user={m.user} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-ink-800 truncate">
                    {m.user.name} {isMe && <span className="text-[10px] text-violet-600">({t('team.members.you')})</span>}
                  </div>
                  <div className="text-[10px] font-bold text-ink-400 uppercase tracking-widest truncate">{m.user.role}</div>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${loadBadge}`}>
                  {loadLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-black tabular text-ink-900">{m.active.length}</div>
                  <div className="text-[9px] font-bold text-ink-400 uppercase tracking-widest">{t('team.members.active')}</div>
                </div>
                <div>
                  <div className={`text-lg font-black tabular ${m.overdue.length ? 'text-red-600' : 'text-ink-400'}`}>{m.overdue.length}</div>
                  <div className="text-[9px] font-bold text-ink-400 uppercase tracking-widest">{t('team.members.overdue')}</div>
                </div>
                <div>
                  <div className="text-lg font-black tabular text-violet-600">{m.avg}%</div>
                  <div className="text-[9px] font-bold text-ink-400 uppercase tracking-widest">{t('team.members.avg')}</div>
                </div>
              </div>
              {m.stale.length > 0 && (
                <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-amber-700">
                  <AlertTriangle className="w-3 h-3" />
                  {m.stale.length} {t('team.members.staleSuffix')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {drillUser && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDrillId(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white w-full md:max-w-3xl md:rounded-3xl rounded-t-3xl max-h-[80vh] overflow-y-auto scroller p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Avatar user={drillUser.user} size={42} />
                <div>
                  <div className="text-sm font-black text-ink-800">{drillUser.user.name}</div>
                  <div className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">
                    {drillUser.owned.length} {drillUser.owned.length === 1 ? t('admin.projectsCount.one') : t('admin.projectsCount.many')}
                  </div>
                </div>
              </div>
              <button onClick={() => setDrillId(null)} className="text-ink-400 hover:text-ink-700 p-2 rounded-lg hover:bg-ink-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            {drillUser.owned.length === 0 ? (
              <p className="text-xs text-ink-400 italic text-center py-6">{t('team.members.noProjects')}</p>
            ) : (
              <div className="space-y-2">
                {drillUser.owned.map(p => {
                  const prog = calcProjectProgress(p);
                  const v = vencimiento(p);
                  const overdueCls = v.kind === 'overdue' ? 'border-red-200 bg-red-50/40' : 'border-ink-100';
                  return (
                    <div key={p.id} className={`p-3 rounded-xl border ${overdueCls} flex items-center gap-3 group`}>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setDrillId(null); navigate(`/projects/${p.id}`); }}>
                        <div className="text-sm font-bold text-ink-800 truncate group-hover:text-violet-600 transition">{p.title}</div>
                        <div className="text-[10px] font-semibold text-ink-400 truncate">{p.status} · {prog}%</div>
                      </div>
                      {v.kind === 'overdue' && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700 tabular">+{v.days}d</span>
                      )}
                      {canManage && (
                        <button onClick={(e) => { e.stopPropagation(); setReassigning({ projectId: p.id, currentOwnerId: p.owner_id }); }} className="text-[10px] font-bold text-violet-600 hover:text-violet-800 underline">
                          {t('team.reassign.button')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {reassigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setReassigning(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-black text-ink-800">{t('team.reassign.title')}</h4>
              <button onClick={() => setReassigning(null)} className="text-ink-400 hover:text-ink-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-ink-500 mb-4">{t('team.reassign.help')}</p>
            <div className="space-y-1 max-h-72 overflow-y-auto scroller">
              {profiles.filter(u => u.id !== reassigning.currentOwnerId).map(u => (
                <button
                  key={u.id}
                  onClick={() => reassign(reassigning.projectId, u.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-violet-50 transition text-left"
                >
                  <Avatar user={u} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-ink-800 truncate">{u.name}</div>
                    <div className="text-[10px] font-semibold text-ink-400">{u.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
