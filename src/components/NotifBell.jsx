import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, FolderKanban, FileText, MessageCircle, Flag, AlertCircle, Inbox, Users2, ClipboardList, ListChecks, Clock, Star, AlertOctagon, CalendarClock, Activity } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { fetchNotifications, markRead, markAllRead, subscribeNotifications } from '../lib/notifications';
import { logger } from '../lib/logger';
import AcceptInviteModal from './AcceptInviteModal.jsx';

// Bell con dropdown + realtime. variant: 'dark' (sidebar staff) | 'light' (portal).
export default function NotifBell({ variant = 'dark' }) {
  const { profile } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Position offscreen until useLayoutEffect calcula coords reales —
  // evita flash de dropdown sin posicionar.
  const [dropStyle, setDropStyle] = useState({ position: 'fixed', top: '-9999px', left: '-9999px', zIndex: 50 });
  const [inviteNotif, setInviteNotif] = useState(null);
  const dropRef = useRef(null);
  const btnRef = useRef(null);

  const load = async () => {
    if (!profile?.id) return;
    setLoading(true);
    setLoadError(null);
    try { setItems(await fetchNotifications()); }
    catch (e) { logger.error('NotifBell fetch error:', e); setLoadError(e.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    return subscribeNotifications(profile.id, (n) => setItems(prev => [n, ...prev].slice(0, 30)));
  }, [profile?.id]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!dropRef.current || !btnRef.current) return;
      const t = e.target;
      if (dropRef.current.contains(t)) return;
      if (btnRef.current.contains(t)) return;
      setOpen(false);
    };
    // click (no mousedown) garantiza que corre DESPUÉS del onClick del button
    // → el toggle de setOpen pega primero y no race con el outside-listener.
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  // Posiciona el dropdown como `fixed` calculado desde el rect del botón.
  // Evita problemas de clipping/overflow del wrapper o sidebar y se asegura
  // de que siempre quepa en viewport (arriba o abajo del bell según espacio).
  // useLayoutEffect: corre síncrono antes del paint → el dropdown nunca se
  // ve en estado vacío sin position.
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = vw < 768;
      const width = isMobile ? Math.min(vw - 16, 420) : 384;
      const spaceBelow = vh - r.bottom;
      const goesDown = spaceBelow > 320 || r.top < 320; // si no cabe arriba, baja
      const s = { position: 'fixed', width: width + 'px', zIndex: 9999 };
      if (goesDown) s.top = (r.bottom + 8) + 'px';
      else          s.bottom = (vh - r.top + 8) + 'px';
      if (isMobile) {
        s.left = '8px';
        s.right = '8px';
        s.width = 'auto';
      } else {
        // Alinea borde izquierdo del dropdown al borde izquierdo del bell si
        // cabe; si no (bell pegado a la derecha), alinea borde derecho.
        if (r.left + width <= vw - 8) {
          s.left = Math.max(8, r.left) + 'px';
        } else {
          s.right = Math.max(8, vw - r.right) + 'px';
        }
      }
      setDropStyle(s);
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);


  const unread = items.filter(n => !n.read_at).length;

  const onClickItem = async (n) => {
    if (!n.read_at) {
      try {
        await markRead(n.id);
        setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      } catch (e) { logger.error('markRead:', e); }
    }
    // Invitación a equipo → modal de aceptar/rechazar; no navegamos.
    if (n.kind === 'team_invitation' && n.meta?.token) {
      setOpen(false);
      setInviteNotif(n);
      return;
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const onMarkAll = async () => {
    try {
      await markAllRead(profile.id);
      setItems(prev => prev.map(x => x.read_at ? x : { ...x, read_at: new Date().toISOString() }));
    } catch (e) { logger.error('markAllRead:', e); }
  };

  const isLight = variant === 'light';
  const btnCls = isLight
    ? 'relative p-2 rounded-xl text-ink-600 hover:bg-ink-100 transition'
    : 'relative p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition';

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={btnCls}
        aria-label="Notificaciones"
      >
        <Bell className={`w-4 h-4 ${unread > 0 ? 'animate-[wiggle_1.2s_ease-in-out_infinite]' : ''}`} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-red-500/30 ring-2 ring-white dark:ring-ink-900">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {inviteNotif && (
        <AcceptInviteModal
          notification={inviteNotif}
          onClose={() => setInviteNotif(null)}
          onDone={() => {
            // Quitar la notif de la lista local para no rebotar.
            setItems(prev => prev.filter(x => x.id !== inviteNotif.id));
          }}
        />
      )}

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)} />
          <div ref={dropRef} style={dropStyle}
            className="card-light !rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-violet-50/40 to-transparent dark:from-violet-500/10">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-ink-600 dark:text-ink-300" />
                <h3 className="text-xs font-black uppercase tracking-widest text-ink-700 dark:text-ink-200">Notificaciones</h3>
                {unread > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 bg-violet-600 text-white rounded-full">{unread}</span>}
              </div>
              {unread > 0 && (
                <button onClick={onMarkAll} className="text-[10px] font-bold text-violet-700 dark:text-violet-300 hover:text-violet-800 flex items-center gap-1 transition">
                  <CheckCheck className="w-3 h-3" /> Marcar todas
                </button>
              )}
            </div>
            <div className="max-h-[28rem] overflow-y-auto scroller">
              {loading ? (
                <div className="p-2 space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-3 p-2">
                      <div className="w-9 h-9 rounded-xl shimmer-skel flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/4 shimmer-skel rounded" />
                        <div className="h-2 w-1/2 shimmer-skel rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : loadError ? (
                <div className="px-6 py-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h4 className="font-black text-sm mb-1 text-red-700">{t('notif.errorLoad')}</h4>
                  <p className="text-[11px] text-ink-500 leading-snug">{loadError}</p>
                  <button onClick={load} className="mt-3 text-[10px] font-bold text-emerald-700 hover:underline">{t('notif.retry')}</button>
                </div>
              ) : items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                    <Inbox className="w-7 h-7 text-emerald-600" />
                  </div>
                  <h4 className="font-black text-sm mb-1 text-ink-700">{t('notif.allClear')}</h4>
                  <p className="text-[11px] text-ink-500">{t('notif.allClearBody')}</p>
                </div>
              ) : (
                <ul>
                  {items.map(n => (
                    <NotifItem key={n.id} n={n} onClick={() => onClickItem(n)} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

const KIND_ICON = {
  project_status:             { Icon: FolderKanban, color: 'violet' },
  doc_uploaded:               { Icon: FileText, color: 'amber' },
  doc_reviewed:               { Icon: FileText, color: 'amber' },
  comment:                    { Icon: MessageCircle, color: 'blue' },
  milestone:                  { Icon: Flag, color: 'emerald' },
  alert:                      { Icon: AlertCircle, color: 'red' },
  team_invitation:            { Icon: Users2, color: 'violet' },
  team_invitation_accepted:   { Icon: Users2, color: 'emerald' },
  team_invitation_declined:   { Icon: Users2, color: 'red' },
  // Cuestionarios (mig-29).
  questionnaire_assigned:     { Icon: ClipboardList, color: 'violet' },
  questionnaire_submitted:    { Icon: ClipboardList, color: 'blue' },
  questionnaire_reviewed:     { Icon: ClipboardList, color: 'emerald' },
  // Tareas asignadas al cliente (mig-24/28).
  client_task_assigned:       { Icon: ListChecks, color: 'blue' },
  client_task_delivered:      { Icon: ListChecks, color: 'violet' },
  client_task_reviewed:       { Icon: ListChecks, color: 'emerald' },
  client_task_due_soon:       { Icon: Clock, color: 'amber' },
  client_task_overdue:        { Icon: AlertCircle, color: 'red' },
  client_task_overdue_staff:  { Icon: AlertCircle, color: 'red' },
  // Mig-34: prioridad, bloqueo y vencimiento de proyecto.
  project_priority_change:    { Icon: Star,          color: 'amber' },
  project_blocked:            { Icon: AlertOctagon,  color: 'red' },
  project_unblocked:          { Icon: CheckCheck,    color: 'emerald' },
  project_due_soon:           { Icon: CalendarClock, color: 'amber' },
  project_overdue:            { Icon: AlertCircle,   color: 'red' },
  // Mig-39: cualquier cambio en proyecto → notif a admins/gerentes.
  project_activity:           { Icon: Activity,      color: 'violet' }
};

const COLOR_CLS = {
  violet:  'bg-violet-100 text-violet-700',
  amber:   'bg-amber-100 text-amber-700',
  blue:    'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  red:     'bg-red-100 text-red-700',
  ink:     'bg-ink-100 text-ink-600'
};

function NotifItem({ n, onClick }) {
  const meta = KIND_ICON[n.kind] || { Icon: Bell, color: 'ink' };
  const { Icon, color } = meta;
  const unread = !n.read_at;

  return (
    <li className={`border-b border-ink-100 dark:border-white/10 last:border-b-0 transition ${unread ? 'bg-violet-50/40 dark:bg-violet-500/10' : ''}`}>
      <button onClick={onClick}
        className="w-full text-left px-4 py-3 hover:bg-ink-50 dark:hover:bg-white/5 transition flex gap-3 items-start group">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${COLOR_CLS[color]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <div className="text-[13px] font-bold text-ink-800 dark:text-ink-100 leading-tight group-hover:text-violet-700 dark:group-hover:text-violet-300 transition">{n.title}</div>
            {unread && <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0 mt-1.5 shadow-[0_0_8px_rgba(139,92,246,0.6)]" />}
          </div>
          {n.body && <div className="text-[11.5px] text-ink-500 dark:text-ink-400 leading-snug mb-1 line-clamp-2">{n.body}</div>}
          <div className="text-[10px] font-mono text-ink-400 tabular">{timeAgo(n.created_at)}</div>
        </div>
      </button>
    </li>
  );
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days}d`;
  return d.toLocaleDateString();
}
