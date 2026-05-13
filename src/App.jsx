import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useAuth } from './lib/auth.jsx';
import { useStore } from './lib/store';
import { I18nProvider } from './lib/i18n.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import { supabase } from './lib/supabase';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Team from './pages/Team.jsx';
import Projects from './pages/Projects.jsx';
import Toast from './components/Toast.jsx';
import CursorGlow from './components/CursorGlow.jsx';
import CommandPalette from './components/CommandPalette.jsx';
import Shortcuts from './components/Shortcuts.jsx';
import ReportButton from './components/ReportButton.jsx';
import { ConfirmHost } from './lib/confirm.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const AdminReports = lazy(() => import('./pages/AdminReports.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Clients = lazy(() => import('./pages/Clients.jsx'));

// Portal cliente (lazy)
const PortalLogin   = lazy(() => import('./pages/portal/PortalLogin.jsx'));
const PortalLayout  = lazy(() => import('./pages/portal/PortalLayout.jsx'));
const PortalDashboard     = lazy(() => import('./pages/portal/PortalDashboard.jsx'));
const PortalProjects      = lazy(() => import('./pages/portal/PortalProjects.jsx'));
const PortalProjectDetail = lazy(() => import('./pages/portal/PortalProjectDetail.jsx'));
const PortalCalendar      = lazy(() => import('./pages/portal/PortalCalendar.jsx'));
const PortalDocuments     = lazy(() => import('./pages/portal/PortalDocuments.jsx'));
const PortalProfile       = lazy(() => import('./pages/portal/PortalProfile.jsx'));

const PageFallback = () => (
  <div className="flex-1 flex items-center justify-center text-ink-400 font-bold tracking-widest text-xs animate-pulse">CARGANDO…</div>
);

// Resuelve la ruta de landing post-login. Respeta profile.landing_route si
// el usuario tiene permiso; si no, fallback al default según rol.
function resolveLanding(profile, can) {
  const wants = profile?.landing_route;
  if (wants === '/dashboard' && can('viewKPIs')) return '/dashboard';
  if (wants === '/projects') return '/projects';
  if (wants === '/team') return '/team';
  return can('viewKPIs') ? '/dashboard' : '/team';
}

export default function App() {
  const { session, profile, loading, can, isClient, isStaff } = useAuth();
  const refreshAll = useStore(s => s.refreshAll);
  const refreshProjects = useStore(s => s.refreshProjects);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortOpen, setShortOpen] = useState(false);
  const location = useLocation();
  const onPortalUrl = location.pathname.startsWith('/portal');

  useEffect(() => {
    if (!session || !profile) return;
    // Cliente NO necesita catálogo global (profiles/categories/projects de todos)
    if (isClient) return;
    let cancelled = false;
    (async () => { if (!cancelled) await refreshAll(); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, profile?.id, refreshAll, isClient]);

  // Realtime: refresh projects on changes (debounced para amortiguar ráfagas)
  useEffect(() => {
    if (!session || isClient) return;
    let timer = null;
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { refreshProjects(); }, 350);
    };
    const ch = supabase.channel('pro_gestion_changes')
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'projects' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'phases' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'tasks' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'pro_gestion', table: 'milestones' }, trigger)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [session, refreshProjects, isClient]);

  useEffect(() => {
    const onKey = (e) => {
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      } else if (e.key === '?' && !inField && !cmdOpen && !shortOpen) {
        e.preventDefault();
        setShortOpen(true);
      } else if (e.key === 'Escape') {
        setCmdOpen(false); setShortOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cmdOpen, shortOpen]);

  if (loading) {
    return (
      <ThemeProvider>
        <div className="h-screen flex items-center justify-center">
          <div className="text-ink-400 font-bold tracking-widest text-xs animate-pulse">CARGANDO…</div>
        </div>
      </ThemeProvider>
    );
  }

  if (!session || !profile) {
    return (
      <ThemeProvider>
        <I18nProvider>
          <Suspense fallback={<PageFallback />}>
            {onPortalUrl ? <PortalLogin /> : <Login />}
          </Suspense>
          <Toast />
        </I18nProvider>
      </ThemeProvider>
    );
  }

  // Rama CLIENTE: portal aislado. Staff URLs reenvían a /portal.
  if (isClient) {
    return (
      <ThemeProvider>
        <I18nProvider>
          <Suspense fallback={<PageFallback />}>
            <PortalLayout>
              <Routes>
                <Route path="/portal" element={<PortalDashboard />} />
                <Route path="/portal/projects" element={<PortalProjects />} />
                <Route path="/portal/projects/:id" element={<PortalProjectDetail />} />
                <Route path="/portal/calendar" element={<PortalCalendar />} />
                <Route path="/portal/documents" element={<PortalDocuments />} />
                <Route path="/portal/profile" element={<PortalProfile />} />
                {/* Cualquier ruta fuera de /portal cae a /portal */}
                <Route path="*" element={<Navigate to="/portal" replace />} />
              </Routes>
            </PortalLayout>
          </Suspense>
          <Toast />
          <ConfirmHost />
        </I18nProvider>
      </ThemeProvider>
    );
  }

  // Rama STAFF: si entró por /portal/*, redirigir a landing staff.
  if (isStaff && onPortalUrl) {
    return (
      <ThemeProvider>
        <I18nProvider>
          <Navigate to={resolveLanding(profile, can)} replace />
        </I18nProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <I18nProvider>
        <CursorGlow />
        <Layout onOpenCmd={() => setCmdOpen(true)} onOpenShort={() => setShortOpen(true)}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to={resolveLanding(profile, can)} replace />} />
              {can('viewKPIs') && <Route path="/dashboard" element={<Dashboard />} />}
              <Route path="/team" element={<Team />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              {can('manageClients') && <Route path="/clients" element={<Clients />} />}
              {can('manageUsers') && <Route path="/admin" element={<Admin />} />}
              {can('manageUsers') && <Route path="/admin/reports" element={<AdminReports />} />}
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
        <Toast />
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
        <Shortcuts open={shortOpen} onClose={() => setShortOpen(false)} />
        <ConfirmHost />
        <ReportButton />
      </I18nProvider>
    </ThemeProvider>
  );
}
