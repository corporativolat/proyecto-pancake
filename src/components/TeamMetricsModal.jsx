import { useEffect, useMemo, useRef } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
} from 'chart.js';
import gsap from 'gsap';
import { Download, FileText, X } from 'lucide-react';
import { reduced } from '../lib/motion';
import { useT } from '../lib/i18n.jsx';
import { STATUSES } from '../lib/utils';
import { downloadCSV, downloadPDF } from '../lib/exporters';
import { useStore } from '../lib/store';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const HEALTH_LABEL = { green: 'On track', amber: 'En riesgo', red: 'Atrasado', gray: 'Sin datos' };

export default function TeamMetricsModal({ metrics, projects, onClose }) {
  const { t } = useT();
  const profiles = useStore(s => s.profiles);
  const overlayRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (reduced) return;
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(cardRef.current,
      { y: 24, scale: 0.96, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' });
  }, []);

  const close = () => {
    if (reduced) { onClose(); return; }
    gsap.to(cardRef.current, { y: 12, scale: 0.97, opacity: 0, duration: 0.2 });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose });
  };

  const progressData = useMemo(() => ({
    labels: metrics.map(m => m.title),
    datasets: [{
      label: '%',
      data: metrics.map(m => m.progress),
      backgroundColor: metrics.map(m => m.progress >= 80 ? '#10b981' : m.progress >= 40 ? '#7c3aed' : '#f59e0b'),
      borderRadius: 6,
    }],
  }), [metrics]);

  const statusData = useMemo(() => {
    const counts = STATUSES.map(s => metrics.filter(m => m.status === s.name).length);
    return {
      labels: STATUSES.map(s => s.name),
      datasets: [{
        data: counts,
        backgroundColor: STATUSES.map(s => s.color),
        borderWidth: 0,
      }],
    };
  }, [metrics]);

  const tasksData = useMemo(() => ({
    labels: metrics.map(m => m.title),
    datasets: [
      {
        label: t('team.metrics.col.tasksDone'),
        data: metrics.map(m => m.tasksDone),
        backgroundColor: '#10b981',
        borderRadius: 6,
        stack: 'a',
      },
      {
        label: t('team.metrics.col.tasksTotal') + ' (pendientes)',
        data: metrics.map(m => Math.max(0, m.tasksTotal - m.tasksDone)),
        backgroundColor: '#e4e4e7',
        borderRadius: 6,
        stack: 'a',
      },
    ],
  }), [metrics, t]);

  const columns = useMemo(() => ([
    { header: t('team.metrics.col.project'),       accessor: m => m.title },
    { header: t('team.metrics.col.status'),        accessor: m => m.status || '' },
    { header: t('team.metrics.col.progress'),      accessor: m => `${m.progress}%` },
    { header: t('team.metrics.col.tasksDone'),     accessor: m => m.tasksDone },
    { header: t('team.metrics.col.tasksTotal'),    accessor: m => m.tasksTotal },
    { header: t('team.metrics.col.health'),        accessor: m => HEALTH_LABEL[m.health] || m.health },
    { header: t('team.metrics.col.startDate'),     accessor: m => m.startDate || '' },
    { header: t('team.metrics.col.projectedEnd'),  accessor: m => m.projectedEndDate || '' },
  ]), [t]);

  const baseFilename = `metricas-proyectos-${new Date().toISOString().split('T')[0]}`;
  const handlePDF = () => {
    downloadPDF({
      filename: baseFilename,
      title: t('team.metrics.modalTitle'),
      subtitle: `${metrics.length} ${metrics.length === 1 ? 'proyecto' : 'proyectos'} · ${new Date().toLocaleDateString()}`,
      columns,
      rows: metrics,
      projects,
      profiles,
    });
  };
  const handleCSV = () => {
    downloadCSV({ filename: baseFilename, columns, rows: metrics });
  };

  const chartBaseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { font: { family: 'Plus Jakarta Sans' } } } },
  };
  const barOpts = {
    ...chartBaseOpts,
    plugins: { ...chartBaseOpts.plugins, legend: { display: false } },
    scales: { y: { beginAtZero: true, max: 100 } },
  };
  const stackOpts = {
    ...chartBaseOpts,
    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
  };

  return (
    <div ref={overlayRef} className="modal-overlay !p-3 md:!p-6" onClick={(e) => { if (e.target === overlayRef.current) close(); }}>
      <div ref={cardRef} className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="px-6 py-5 border-b bg-gradient-to-br from-violet-700 via-violet-800 to-fuchsia-800 text-white flex justify-between items-center">
          <div className="min-w-0">
            <h3 className="text-lg md:text-xl font-black tracking-tight truncate">{t('team.metrics.modalTitle')}</h3>
            <p className="text-[11px] font-semibold text-white/70 truncate">{metrics.length} {t('team.metrics.title').toLowerCase()} · {t('team.metrics.modalSub')}</p>
          </div>
          <button onClick={close} className="p-2 rounded-lg hover:bg-white/15 transition" aria-label="Cerrar">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroller p-5 md:p-7 space-y-6">
          <ChartCard title={t('team.metrics.chart.progress')}>
            <Bar data={progressData} options={barOpts} />
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ChartCard title={t('team.metrics.chart.status')}>
              <Doughnut data={statusData} options={chartBaseOpts} />
            </ChartCard>
            <ChartCard title={t('team.metrics.chart.tasks')}>
              <Bar data={tasksData} options={stackOpts} />
            </ChartCard>
          </div>
        </div>

        <div className="px-5 md:px-7 py-4 border-t bg-ink-50/60 flex flex-wrap justify-end gap-2 flex-shrink-0">
          <button onClick={handleCSV} className="btn-soft" title={t('team.metrics.download.csv')}>
            <FileText className="w-3.5 h-3.5" /> {t('team.metrics.download.csv')}
          </button>
          <button onClick={handlePDF} className="btn-primary" title={t('team.metrics.download.pdf')}>
            <Download className="w-3.5 h-3.5" /> {t('team.metrics.download.pdf')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 md:p-5">
      <h4 className="text-[10px] font-black text-ink-500 uppercase tracking-widest mb-3">{title}</h4>
      <div className="h-[260px] md:h-[300px]">
        {children}
      </div>
    </div>
  );
}
