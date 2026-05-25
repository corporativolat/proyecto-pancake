import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Maximize2, ExternalLink } from 'lucide-react';
import gsap from 'gsap';
import { calcProjectProgress, effectiveHealth } from '../lib/utils';
import { reduced } from '../lib/motion';
import TeamMetricsModal from './TeamMetricsModal.jsx';
import { useT } from '../lib/i18n.jsx';

// Calcula las métricas principales por proyecto que se muestran en la barra
// y se exportan en los reportes.
function buildProjectMetrics(projects) {
  return (projects || []).map(p => {
    const tasks = (p.phases || []).flatMap(ph => ph.tasks || []);
    const tasksTotal = tasks.length;
    const tasksDone = tasks.filter(t => t.completed).length;
    const progress = calcProjectProgress(p);
    const health = effectiveHealth(p, progress);
    return {
      id: p.id,
      title: p.title || '—',
      company: p.company || '',
      status: p.status,
      progress,
      tasksTotal,
      tasksDone,
      health,
      startDate: p.start_date || null,
      projectedEndDate: p.projected_end_date || null,
    };
  });
}

const HEALTH_COLOR = { green: '#10b981', amber: '#f59e0b', red: '#ef4444', gray: '#a1a1aa' };
const HEALTH_LABEL = { green: 'On track', amber: 'En riesgo', red: 'Atrasado', gray: 'Sin datos' };

export default function TeamMetricsBar({ projects }) {
  const navigate = useNavigate();
  const { t } = useT();
  const railRef = useRef(null);
  const [showModal, setShowModal] = useState(false);

  const metrics = useMemo(() => buildProjectMetrics(projects), [projects]);

  // Animación de entrada de las cards.
  useEffect(() => {
    if (reduced || !railRef.current) return;
    const cards = railRef.current.querySelectorAll('[data-metric-card]');
    if (!cards.length) return;
    gsap.fromTo(cards,
      { y: 12, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out', stagger: 0.05 }
    );
    cards.forEach(c => {
      const bar = c.querySelector('[data-metric-bar]');
      if (!bar) return;
      const v = bar.dataset.value || 0;
      gsap.fromTo(bar, { width: 0 }, { width: `${v}%`, duration: 0.9, ease: 'power3.out', delay: 0.15 });
    });
  }, [metrics.length]);

  if (!metrics.length) {
    return (
      <div className="card-light p-6 text-center text-xs text-ink-400 italic font-medium">
        {t('team.metrics.empty')}
      </div>
    );
  }

  return (
    <>
      <div className="card-light p-5 md:p-6" data-stagger>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" /> {t('team.metrics.title')}
          </h3>
          <button
            onClick={() => setShowModal(true)}
            className="btn-soft text-[10px]"
            title={t('team.metrics.expand')}
          >
            <Maximize2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('team.metrics.expand')}</span>
          </button>
        </div>

        <div
          ref={railRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {metrics.map(m => (
            <button
              key={m.id}
              data-metric-card
              onClick={() => navigate(`/projects/${m.id}`)}
              className="text-left p-4 rounded-xl border border-ink-100 hover:border-violet-300 hover:bg-violet-50/30 transition group relative overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-black text-ink-800 truncate group-hover:text-violet-700 transition">{m.title}</div>
                  {m.company && <div className="text-[9px] font-bold text-ink-400 uppercase tracking-widest truncate">{m.company}</div>}
                </div>
                <span
                  title={`${t('team.metrics.health')}: ${HEALTH_LABEL[m.health] || m.health}`}
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ background: HEALTH_COLOR[m.health], boxShadow: `0 0 0 3px ${HEALTH_COLOR[m.health]}22` }}
                />
              </div>

              <div className="text-[9px] font-bold text-ink-500 uppercase tracking-widest mb-1 truncate">{m.status}</div>

              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 bg-ink-100 h-1.5 rounded-full overflow-hidden">
                  <div data-metric-bar data-value={m.progress} className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: 0 }} />
                </div>
                <span className="text-[11px] font-black text-violet-600 tabular w-9 text-right">{m.progress}%</span>
              </div>

              <div className="flex items-center justify-between text-[10px] font-semibold text-ink-500">
                <span className="tabular">{m.tasksDone}/{m.tasksTotal} {t('team.metrics.tasks').toLowerCase()}</span>
                {m.projectedEndDate && (
                  <span className="text-[9px] font-bold text-ink-400 tabular">
                    {t('team.metrics.eta')}: {new Date(m.projectedEndDate).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>

              <ExternalLink className="absolute top-3 right-3 w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition" />
            </button>
          ))}
        </div>
      </div>

      {showModal && (
        <TeamMetricsModal
          metrics={metrics}
          projects={projects}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
