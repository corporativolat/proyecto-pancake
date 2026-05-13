import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, FolderKanban, FileText, MessageCircle, Flag, AlertCircle, Inbox } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../lib/auth.jsx';
import { fetchNotifications, markRead, markAllRead, subscribeNotifications } from '../lib/notifications';
import { reduced } from '../lib/motion';

// Bell con dropdown + realtime. variant: 'dark' (sidebar staff) | 'light' (portal).
export default function NotifBell({ variant = 'dark' }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef(null);
  const btnRef = useRef(null);

  const load = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try { setItems(await fetchNotifications()); }
    catch { /* silencioso */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    return subscribeNotifications(profile.id, (n) => setItems(prev => [n, ...prev].slice(0, 30)));
  }, [profile?.id]);

  useEffect(() => {
    const onClick = (e) => {
      if (open && dropRef.current && !dropRef.current.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (!open || reduced || !dropRef.current) return;
    gsap.fromTo(dropRef.current,
      { y: -8, scale: 0.97, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.22, ease: 'power3.out' }
    );
  }, [open]);

  const unread = items.filter(n => !n.read_at).length;

  const onClickItem = async (n) => {
    if (!n.read_at) {
      try { await markRead(n.id); } catch { /* noop */ }
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const onMarkAll = async () => {
    try {
      await markAllRead(profile.id);
      setItems(prev => prev.map(x => x.read_at ? x : { ...x, read_at: new Date().toISOString() }));
    } catch { /* noop */ }
  };

  const isLight = variant === 'light';
  const btnCls = isLight
    ? 'relative p-2 rounded-xl text-ink-600 hover:bg-ink-100 transition'
    : 'relative p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition';

  return (
    <div className="relative">
      <button ref={btnRef} onClick={() => setOpen(o => !o)} className={btnCls} aria-label="Notificaciones">
        <Bell className={`w-4 h-4 ${unread > 0 ? 'animate-[wiggle_1.2s_ease-in-out_infinite]' : ''}`} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-red-500/30 ring-2 ring-white dark:ring-ink-900">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)} />
          <div ref={dropRef}
            className="fixed md:absolute z-50 right-2 md:right-0 mt-2 left-2 md:left-auto md:w-96 bg-white border border-ink-200 rounded-2xl shadow-2xl overflow-hidden origin-top-right"
            style={{ top: 'auto' }}>
            <div className="px-4 py-3 border-b border-ink-100 flex items-center justify-between bg-gradient-to-r from-ink-50 to-white">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-ink-600" />
                <h3 className="text-xs font-black uppercase tracking-widest text-ink-700">Notificaciones</h3>
                {unread > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 bg-red-500 text-white rounded-full">{unread}</span>}
              </div>
              {unread > 0 && (
                <button onClick={onMarkAll} className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition">
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
              ) : items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center">
                    <Inbox className="w-7 h-7 text-emerald-600" />
                  </div>
                  <h4 className="font-black text-sm mb-1 text-ink-700">Todo al día</h4>
                  <p className="text-[11px] text-ink-500">Te avisaremos aquí cuando haya novedad.</p>
                </div>
              ) : (
                <ul>
                  {items.map(n => <NotifItem key={n.id} n={n} onClick={() => onClickItem(n)} />)}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const KIND_ICON = {
  project_status:    { Icon: FolderKanban, color: 'violet' },
  doc_uploaded:      { Icon: FileText, color: 'amber' },
  doc_reviewed:      { Icon: FileText, color: 'amber' },
  comment:           { Icon: MessageCircle, color: 'blue' },
  milestone:         { Icon: Flag, color: 'emerald' },
  alert:             { Icon: AlertCircle, color: 'red' }
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
    <li className={`border-b border-ink-100 last:border-b-0 transition ${unread ? 'bg-emerald-50/30' : ''}`}>
      <button onClick={onClick}
        className="w-full text-left px-4 py-3 hover:bg-ink-50 transition flex gap-3 items-start group">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${COLOR_CLS[color]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <div className="text-[13px] font-bold text-ink-800 leading-tight group-hover:text-emerald-700 transition">{n.title}</div>
            {unread && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />}
          </div>
          {n.body && <div className="text-[11.5px] text-ink-500 leading-snug mb-1 line-clamp-2">{n.body}</div>}
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
