import { useEffect, useState } from 'react';
import { Info, Activity, MessageSquare, FolderOpen } from 'lucide-react';

// Tabs principales del detalle de proyecto (mig-34 refactor):
//   Información · Seguimiento · Operación · Gestión
// Persiste la pestaña activa en el hash de la URL (#info / #seguimiento / …)
// y restaura al volver. Si no hay hash válido, default = 'seguimiento'.
export const PROJECT_TABS = [
  { key: 'info',         label: 'Información',  Icon: Info,          hint: 'Datos, responsables y estado' },
  { key: 'seguimiento',  label: 'Seguimiento',  Icon: Activity,      hint: 'Cronograma, hitos y avance' },
  { key: 'operacion',    label: 'Operación',    Icon: MessageSquare, hint: 'Comentarios e historial' },
  { key: 'gestion',      label: 'Gestión',      Icon: FolderOpen,    hint: 'Documentos, tareas y cuestionarios' }
];

export const DEFAULT_TAB = 'seguimiento';

const tabFromHash = () => {
  try {
    const h = (window.location.hash || '').replace(/^#/, '');
    if (PROJECT_TABS.some(t => t.key === h)) return h;
  } catch { /* ignore */ }
  return DEFAULT_TAB;
};

export function useProjectTab() {
  const [tab, setTab] = useState(tabFromHash);
  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const change = (next) => {
    if (!PROJECT_TABS.some(t => t.key === next)) return;
    try { window.location.hash = next; } catch { /* ignore */ }
    setTab(next);
  };
  return [tab, change];
}

export default function ProjectDetailTabs({ tab, onChange, badges = {} }) {
  return (
    <div className="border-b border-ink-100 bg-white sticky top-0 z-10">
      <div className="px-4 md:px-10 flex overflow-x-auto scroller no-scrollbar">
        {PROJECT_TABS.map(t => {
          const active = tab === t.key;
          const badge = badges[t.key];
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              title={t.hint}
              className={`relative flex-shrink-0 inline-flex items-center gap-2 px-4 py-3 text-[12px] font-bold uppercase tracking-widest border-b-2 transition ${active
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-ink-500 hover:text-ink-800'}`}
            >
              <t.Icon className="w-3.5 h-3.5" />
              {t.label}
              {badge > 0 && (
                <span className={`ml-1 min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${active ? 'bg-violet-600 text-white' : 'bg-ink-200 text-ink-700'}`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
