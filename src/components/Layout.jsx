import { useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, FolderKanban, ShieldCheck, Plus, LogOut, Settings as SettingsIcon, Search, Moon, Sun } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n.jsx';
import { useTheme } from '../lib/theme.jsx';
import { reduced, staggerIn } from '../lib/motion';
import { useToast } from '../lib/toast';
import { createProject } from '../lib/data';
import { logActivity } from '../lib/comments';
import { logger } from '../lib/logger';
import Avatar from './Avatar.jsx';

export default function Layout({ children, onOpenCmd, onOpenShort }) {
  const { profile, signOut, can } = useAuth();
  const projects = useStore(s => s.projects);
  const refreshProjects = useStore(s => s.refreshProjects);
  const loc = useLocation();
  const navigate = useNavigate();
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const { theme, toggle: toggleTheme } = useTheme();
  const mainRef = useRef(null);

  useEffect(() => {
    if (!reduced && mainRef.current) {
      gsap.fromTo(mainRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });
      staggerIn(mainRef.current);
    }
  }, [loc.pathname]);

  const recents = [...projects].slice(-7).reverse();

  const handleNew = async () => {
    if (!can('createProject')) {
      showToast('Sin permiso para crear proyectos', 'error');
      return;
    }
    try {
      const cats = useStore.getState().categories;
      const cat = cats[0];
      if (!cat) { showToast('Crea una categoría en Administración primero', 'error'); return; }
      const newP = await createProject({
        title: 'Nueva Iniciativa',
        company: '',
        category_id: cat.id,
        owner_id: profile.id,
        start_date: new Date().toISOString().split('T')[0],
        status: 'No iniciado',
        goal: '',
        observation: ''
      });
      await refreshProjects();
      logActivity(profile.id, newP.id, 'project_create', newP.title);
      showToast(t('pj.toast.created'));
      navigate(`/projects/${newP.id}`);
    } catch (e) {
      logger.error('createProject', e);
      showToast('Error al crear: ' + (e.message || 'desconocido'), 'error');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50">
      <aside className="w-72 sidebar-bg flex flex-col z-40 relative">
        <div className="p-7 border-b border-white/5 relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/40">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-white">PRO-GESTIÓN</h1>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.25em]">Plataforma Interna</p>
            </div>
          </div>
          <button onClick={onOpenCmd} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition text-white/50 hover:text-white text-xs">
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Buscar...</span>
            <span className="cmdk-kbd !bg-white/10 !border-white/10 !text-white/60">⌘K</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1 scroller">
          {can('viewKPIs') && <NavItem to="/dashboard" icon={<LayoutDashboard className="w-4 h-4" />}>{t('nav.dashboard')}</NavItem>}
          <NavItem to="/team" icon={<Users className="w-4 h-4" />}>{t('nav.team')}</NavItem>
          <NavItem to="/projects" icon={<FolderKanban className="w-4 h-4" />}>{t('nav.projects')}</NavItem>
          {can('manageUsers') && <NavItem to="/admin" icon={<ShieldCheck className="w-4 h-4" />}>{t('nav.admin')}</NavItem>}
          <NavItem to="/settings" icon={<SettingsIcon className="w-4 h-4" />}>{t('nav.settings')}</NavItem>

          <div className="pt-6 pb-2 px-4 flex items-center gap-2">
            <span className="flex-1 text-[10px] font-black text-white/30 uppercase tracking-widest">{t('nav.recents')}</span>
            <span className="bg-white/5 text-white/50 px-2 py-0.5 rounded-md text-[9px] tabular">{projects.length}</span>
          </div>
          <div className="space-y-0.5">
            {recents.map(p => (
              <NavLink key={p.id} to={`/projects/${p.id}`} className={({ isActive }) => `sidebar-pj ${isActive ? 'active' : ''}`}>
                <FolderKanban className="w-3 h-3" />
                <span className="truncate flex-1">{p.title}</span>
              </NavLink>
            ))}
          </div>

          {can('createProject') && (
            <button onClick={handleNew} className="w-full mt-6 btn-primary-sm justify-center">
              <Plus className="w-4 h-4" /> {t('nav.newProject')}
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-white/5 bg-black/20">
          <button onClick={() => navigate('/settings')} className="w-full flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 transition">
            <Avatar user={profile} size={40} />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-black text-white truncate">{profile?.name}</div>
              <div className="text-[9px] font-bold text-violet-300 uppercase tracking-widest">{profile?.role}</div>
            </div>
          </button>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={toggleTheme} title="Tema" className="theme-toggle">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={onOpenShort} title="Atajos (?)" className="theme-toggle font-bold">?</button>
            <button onClick={signOut} title={t('nav.logout')} className="flex-1 text-[10px] font-bold text-white/30 hover:text-red-400 transition flex items-center justify-center gap-1.5 py-2 rounded-xl hover:bg-white/5">
              <LogOut className="w-3 h-3" /> {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden bg-ink-50">
        {children}
      </main>
    </div>
  );
}

function NavItem({ to, icon, children }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}>
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}
