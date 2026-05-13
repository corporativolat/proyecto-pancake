import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Calendar, FileText, User, LogOut, Menu, X, Briefcase } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';

const NAV = [
  { to: '/portal',            label: 'Inicio',      icon: LayoutDashboard, end: true },
  { to: '/portal/projects',   label: 'Proyectos',   icon: FolderKanban },
  { to: '/portal/calendar',   label: 'Calendario',  icon: Calendar },
  { to: '/portal/documents',  label: 'Documentos',  icon: FileText },
  { to: '/portal/profile',    label: 'Perfil',      icon: User }
];

export default function PortalLayout({ children }) {
  const { profile, signOut } = useAuth();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-50 text-ink-800">
      {/* Topbar móvil */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-white border-b flex items-center justify-between px-4 h-14">
        <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 text-ink-600"><Menu className="w-5 h-5" /></button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center"><Briefcase className="w-4 h-4 text-white" /></div>
          <span className="font-black text-sm">Portal</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Sidebar */}
      {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />}
      <aside className={`${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-50 md:z-auto w-72 h-full bg-white border-r flex flex-col transition-transform duration-200`}>
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-black text-sm tracking-tight">Portal</div>
              <div className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Clientes</div>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 text-ink-500"><X className="w-4 h-4" /></button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'}`
              }>
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-xs font-black">
              {(profile?.name || profile?.email || 'C').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold truncate">{profile?.name || profile?.email}</div>
              <div className="text-[10px] text-ink-400 truncate">{profile?.company || profile?.email}</div>
            </div>
          </div>
          <button onClick={signOut} className="w-full flex items-center justify-center gap-2 text-[11px] font-bold text-ink-500 hover:text-red-600 transition py-2 rounded-lg hover:bg-red-50">
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
