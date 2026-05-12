import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n.jsx';

// Mapa estático de slug → label de ruta. Si la ruta tiene `:id`, lo
// resolvemos dinámicamente contra el store de proyectos.
function useCrumbs() {
  const { t } = useT();
  const loc = useLocation();
  const params = useParams();
  const projects = useStore(s => s.projects);

  const SECTIONS = {
    dashboard: t('nav.dashboard'),
    projects: t('nav.projects'),
    team: t('nav.team'),
    admin: t('nav.admin'),
    settings: t('nav.settings'),
  };

  const parts = loc.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return [];

  const crumbs = [];
  // Sección raíz
  const first = parts[0];
  if (SECTIONS[first]) {
    crumbs.push({ to: '/' + first, label: SECTIONS[first] });
  } else {
    crumbs.push({ to: '/' + first, label: first });
  }

  // /projects/:id → buscar proyecto en store
  if (first === 'projects' && parts[1]) {
    const pj = projects.find(p => p.id === parts[1]);
    if (pj) {
      crumbs.push({ label: pj.title, to: null });
    } else if (params.id) {
      crumbs.push({ label: '…', to: null });
    } else {
      crumbs.push({ label: parts[1], to: null });
    }
  }

  // /admin/reports
  if (first === 'admin' && parts[1] === 'reports') {
    crumbs.push({ label: t('admin.errorReports'), to: null });
  }

  return crumbs;
}

export default function Breadcrumb({ compact = false }) {
  const crumbs = useCrumbs();
  const { t } = useT();

  if (crumbs.length === 0) return null;

  return (
    <nav className={`flex items-center gap-1.5 text-[11px] font-semibold text-ink-500 ${compact ? '' : 'mb-3'}`} aria-label="Breadcrumb">
      <Link to="/" className="text-ink-400 hover:text-violet-600 transition flex items-center gap-1">
        <Home className="w-3 h-3" />
        <span className="hidden sm:inline">{t('layout.home')}</span>
      </Link>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-ink-300" />
          {c.to
            ? <Link to={c.to} className="text-ink-500 hover:text-violet-600 transition truncate max-w-[200px]">{c.label}</Link>
            : <span className="text-ink-800 font-bold truncate max-w-[260px]">{c.label}</span>
          }
        </span>
      ))}
    </nav>
  );
}
