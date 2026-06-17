import { Activity } from 'lucide-react';
import { useT } from '../lib/i18n.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';

// Reporte global de actividad en proyectos para staff con viewKPIs.
// Reusa ActivityFeed (projectId=null → todos los proyectos) que ya trae
// suscripción realtime: cualquier cambio aparece sin recargar.
export default function AdminActivity() {
  const { t } = useT();
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 scroller">
      <header className="mb-6 md:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-ink-900">{t('adminActivity.title')}</h1>
        </div>
        <p className="text-xs md:text-sm text-ink-500 max-w-2xl">{t('adminActivity.subtitle')}</p>
      </header>
      <ActivityFeed projectId={null} limit={100} />
    </div>
  );
}
