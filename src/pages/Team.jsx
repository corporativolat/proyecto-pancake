import { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, ClipboardList, Target, ExternalLink, PartyPopper } from 'lucide-react';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { calcProjectProgress } from '../lib/utils';
import { countUp, animateBars, staggerIn, confetti, reduced } from '../lib/motion';
import { updateTask } from '../lib/data';
import { useToast } from '../lib/toast';
import TeamMetricsBar from '../components/TeamMetricsBar.jsx';
import TeamMembersGrid from '../components/TeamMembersGrid.jsx';

export default function Team() {
  const projects = useStore(s => s.projects);
  const refreshProjects = useStore(s => s.refreshProjects);
  const { profile, can } = useAuth();
  const navigate = useNavigate();
  const ref = useRef(null);
  const showToast = useToast(s => s.show);
  const { t } = useT();

  const myProjects = useMemo(() => projects.filter(p => p.owner_id === profile?.id || (p.member_ids || []).includes(profile?.id)), [projects, profile]);
  const myTasks = useMemo(() => {
    const out = [];
    myProjects.forEach(p => p.phases?.forEach(ph => ph.tasks?.forEach(t => {
      if (!t.completed && (t.assignee_id === profile?.id || (!t.assignee_id && p.owner_id === profile?.id))) {
        out.push({ proj: p, phase: ph, task: t });
      }
    })));
    return out;
  }, [myProjects, profile]);
  const myProg = myProjects.length ? Math.round(myProjects.reduce((a, p) => a + calcProjectProgress(p), 0) / myProjects.length) : 0;

  useEffect(() => {
    if (reduced || !ref.current) return;
    ref.current.querySelectorAll('[data-kpi]').forEach(el => {
      const target = parseInt(el.getAttribute('data-kpi'));
      const suf = el.getAttribute('data-suffix') || '';
      countUp(el, target, { suffix: suf });
    });
    animateBars(ref.current);
    staggerIn(ref.current);
  }, [myProjects.length, myTasks.length, myProg]);

  const toggle = async (task, hostEvent) => {
    try {
      await updateTask(task.id, { completed: !task.completed });
      if (!task.completed) {
        const host = hostEvent.currentTarget.closest('.relative') || hostEvent.currentTarget.parentElement;
        confetti(host, '#10b981');
      }
      await refreshProjects();
      showToast(!task.completed ? t('team.toast.completed') : t('team.toast.reactivated'));
    } catch (e) { showToast(t('common.errorPrefix') + e.message, 'error'); }
  };

  return (
    <section ref={ref} className="flex-1 p-4 md:p-10 overflow-y-auto scroller">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-6 md:mb-10">
          <p className="text-[10px] font-black text-violet-600 uppercase tracking-[0.25em] mb-2">{t('team.section')}</p>
          <h2 className="text-3xl md:text-4xl font-black text-ink-900 tracking-tight">{t('team.title')}</h2>
          <p className="text-ink-500 font-medium mt-1">{t('team.subtitle')}</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6 md:mb-8">
          <KPI label={t('team.kpi.projects')} target={myProjects.length} icon={<FolderKanban className="w-4 h-4 text-violet-600" />} iconBg="bg-violet-50" valueClass="text-ink-900" />
          <KPI label={t('team.kpi.tasks')} target={myTasks.length} icon={<ClipboardList className="w-4 h-4 text-amber-600" />} iconBg="bg-amber-50" valueClass="text-amber-500" />
          <div className="kpi-card kpi-primary" data-stagger>
            <div className="flex justify-between items-start mb-3">
              <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{t('team.kpi.completion')}</div>
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Target className="w-4 h-4 text-white" /></div>
            </div>
            <div className="text-4xl font-black tabular" data-kpi={myProg} data-suffix="%">0%</div>
            <div className="w-full h-1.5 bg-white/15 rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-white rounded-full" data-bar={myProg} style={{ width: 0 }} />
            </div>
          </div>
        </div>

        {can('viewAll') && (
          <div className="mb-6 md:mb-8">
            <TeamMembersGrid />
          </div>
        )}

        <div className="mb-6 md:mb-8">
          <TeamMetricsBar projects={myProjects} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card-light p-7" data-stagger>
            <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
              <FolderKanban className="w-3.5 h-3.5" /> {t('team.myProjects')}
            </h3>
            <div className="space-y-3">
              {myProjects.map(p => {
                const prog = calcProjectProgress(p);
                return (
                  <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="p-4 rounded-2xl border border-ink-100 hover:border-violet-200 hover:bg-violet-50/40 transition cursor-pointer group" data-stagger>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-ink-800 text-sm truncate group-hover:text-violet-600 transition">{p.title}</div>
                        <div className="text-[10px] font-semibold text-ink-400 mt-0.5">{p.status}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-ink-100 h-1.5 rounded-full overflow-hidden">
                        <div className="progress-fill h-full rounded-full" data-bar={prog} style={{ width: 0 }} />
                      </div>
                      <span className="text-xs font-black text-violet-600 w-9 text-right tabular">{prog}%</span>
                    </div>
                  </div>
                );
              })}
              {!myProjects.length && (
                <div className="empty">
                  <div className="icon-wrap"><FolderKanban className="w-7 h-7 text-ink-400" /></div>
                  <p className="text-xs text-ink-400 italic font-medium">{t('team.empty.projects')}</p>
                </div>
              )}
            </div>
          </div>

          <div className="card-light p-7" data-stagger>
            <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5" /> {t('team.pending')}
            </h3>
            <div className="space-y-2">
              {myTasks.slice(0, 20).map(({ proj, phase, task }) => (
                <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-ink-50 transition group relative" data-stagger>
                  <input type="checkbox" onChange={(e) => toggle(task, e)} className="rounded text-violet-600 h-4 w-4 cursor-pointer" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-ink-700 truncate">{task.name}</div>
                    <div className="text-[10px] font-semibold text-ink-400 truncate">{proj.title} · {phase.name}</div>
                  </div>
                  <button onClick={() => navigate(`/projects/${proj.id}`)} className="text-ink-300 hover:text-violet-600 opacity-0 group-hover:opacity-100 transition">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {!myTasks.length && (
                <div className="empty">
                  <div className="icon-wrap"><PartyPopper className="w-7 h-7 text-emerald-500" /></div>
                  <p className="text-xs text-ink-400 italic font-medium">{t('team.empty.tasks')}</p>
                </div>
              )}
            </div>
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
