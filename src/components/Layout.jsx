import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, FolderKanban, ShieldCheck, Plus, LogOut, Settings as SettingsIcon, Search, Moon, Sun, Menu, Briefcase, Users2 } from 'lucide-react';
import NotifBell from './NotifBell.jsx';
import gsap from 'gsap';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store';
import { useT } from '../lib/i18n.jsx';
import { useTheme } from '../lib/theme.jsx';
import { reduced, staggerIn } from '../lib/motion';
import { useToast } from '../lib/toast';
import Avatar from './Avatar.jsx';
import Breadcrumb from './Breadcrumb.jsx';

export default function Layout({ children, onOpenCmd, onOpenShort }) {
  const { profile, signOut, can } = useAuth();
  const projects = useStore(s => s.projects);
  const loc = useLocation();
  const navigate = useNavigate();
  const showToast = useToast(s => s.show);
  const { t } = useT();
  const { theme, toggle: toggleTheme } = useTheme();
  const mainRef = useRef(null);
  const navRef = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const recents = [...projects].slice(-7).reverse();

  useEffect(() => {
    if (!reduced && mainRef.current) {
      gsap.fromTo(mainRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' });
      staggerIn(mainRef.current);
    }
    setMobileOpen(false); // cerrar drawer al navegar
  }, [loc.pathname]);

  // Stagger inicial de items del sidebar (una vez al montar).
  useEffect(() => {
    if (reduced || !navRef.current) return;
    const items = navRef.current.querySelectorAll('[data-nav-item]');
    if (!items.length) return;
    gsap.fromTo(items,
      { x: -16, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out', stagger: 0.04 }
    );
  }, []);

  // Re-stagger cuando cambia la lista de recents.
  useEffect(() => {
    if (reduced || !navRef.current) return;
    const items = navRef.current.querySelectorAll('[data-recent-item]');
    if (!items.length) return;
    gsap.fromTo(items,
      { x: -10, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.35, ease: 'power3.out', stagger: 0.03 }
    );
  }, [recents.length]);

  // Abre el form de creación en /projects (con todos los campos oficiales).
  // No crea proyectos vacíos directamente: respeta el draft del autosave.
  const handleNew = () => {
    if (!can('createProject')) {
      showToast(t('layout.noPermissionCreate'), 'error');
      return;
    }
    navigate('/projects', { state: { openNew: true } });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50">
      {/* Backdrop solo móvil cuando el drawer está abierto */}
      {mobileOpen && (
        <button
          type="button"
          aria-label={t('layout.closeMenu')}
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}
      <aside className={`w-72 sidebar-bg flex flex-col z-40 fixed md:relative inset-y-0 left-0 transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-7 border-b border-white/5 relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/40">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-white">PRO-GESTIÓN</h1>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-[0.25em]">{t('layout.platformLabel')}</p>
            </div>
          </div>
          <button onClick={onOpenCmd} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition text-white/50 hover:text-white text-xs">
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">{t('common.search')}</span>
            <span className="cmdk-kbd !bg-white/10 !border-white/10 !text-white/60">⌘K</span>
          </button>
        </div>

        <nav ref={navRef} className="flex-1 overflow-y-auto p-4 space-y-1 scroller">
          {can('viewKPIs') && <NavItem to="/dashboard" icon={<LayoutDashboard className="w-4 h-4" />}>{t('nav.dashboard')}</NavItem>}
          <NavItem to="/team" icon={<Users className="w-4 h-4" />}>{t('nav.team')}</NavItem>
          <NavItem to="/projects" icon={<FolderKanban className="w-4 h-4" />}>{t('nav.projects')}</NavItem>
          {can('manageClients') && <NavItem to="/clients" icon={<Briefcase className="w-4 h-4" />}>{t('nav.clients')}</NavItem>}
          {(can('manageTeams') || can('manageOwnTeam')) && <NavItem to="/teams" icon={<Users2 className="w-4 h-4" />}>{t('nav.teams')}</NavItem>}
          {can('manageUsers') && <NavItem to="/admin" icon={<ShieldCheck className="w-4 h-4" />}>{t('nav.admin')}</NavItem>}
          <NavItem to="/settings" icon={<SettingsIcon className="w-4 h-4" />}>{t('nav.settings')}</NavItem>

          <div data-nav-item className="pt-6 pb-2 px-4 flex items-center gap-2">
            <span className="flex-1 text-[10px] font-black text-white/30 uppercase tracking-widest">{t('nav.recents')}</span>
            <span className="bg-white/5 text-white/50 px-2 py-0.5 rounded-md text-[9px] tabular">{projects.length}</span>
          </div>
          <div className="space-y-0.5">
            {recents.map(p => (
              <NavLink key={p.id} data-recent-item to={`/projects/${p.id}`} className={({ isActive }) => `sidebar-pj ${isActive ? 'active' : ''}`}>
                <FolderKanban className="w-3 h-3" />
                <span className="truncate flex-1">{p.title}</span>
              </NavLink>
            ))}
          </div>

          {can('createProject') && (
            <button data-nav-item onClick={handleNew} className="w-full mt-6 btn-primary-sm justify-center">
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
            <NotifBell />
            <button onClick={toggleTheme} title={t('layout.theme')} className="theme-toggle">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={onOpenShort} title={t('layout.shortcuts')} className="theme-toggle font-bold">?</button>
            <button onClick={signOut} title={t('nav.logout')} className="flex-1 text-[10px] font-bold text-white/30 hover:text-red-400 transition flex items-center justify-center gap-1.5 py-2 rounded-xl hover:bg-white/5">
              <LogOut className="w-3 h-3" /> {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden bg-ink-50 w-full">
        {/* Topbar móvil con hamburguesa. Oculto >= md */}
        <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b bg-white/95 dark:bg-ink-900/95 backdrop-blur sticky top-0 z-20 flex-shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t('layout.openMenu')}
            className="p-2 rounded-lg hover:bg-ink-100 transition"
          >
            <Menu className="w-5 h-5 text-ink-700" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-md shadow-violet-500/30 flex-shrink-0">
              <LayoutDashboard className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-black text-sm tracking-tight text-ink-900 truncate">PRO-GESTIÓN</span>
          </div>
          <button onClick={onOpenCmd} aria-label={t('layout.searchAria')} className="p-2 rounded-lg hover:bg-ink-100 transition">
            <Search className="w-4 h-4 text-ink-600" />
          </button>
          <button onClick={toggleTheme} aria-label={t('layout.theme')} className="p-2 rounded-lg hover:bg-ink-100 transition">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-ink-600" /> : <Moon className="w-4 h-4 text-ink-600" />}
          </button>
        </div>
        <div className="hidden md:block px-10 pt-4 pb-0 bg-ink-50 border-b border-ink-100 flex-shrink-0">
          <Breadcrumb compact />
        </div>
        <div className="md:hidden px-4 pt-2 pb-1 bg-white border-b border-ink-100 flex-shrink-0">
          <Breadcrumb compact />
        </div>
        {children}
      </main>
    </div>
  );
}

function NavItem({ to, icon, children }) {
  return (
    <NavLink to={to} data-nav-item className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}>
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}
