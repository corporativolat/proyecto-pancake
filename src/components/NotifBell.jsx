import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { fetchNotifications, markRead, markAllRead, subscribeNotifications } from '../lib/notifications';

// Bell con dropdown + realtime. Funciona para staff y cliente.
// Variante por defecto = estilo "dark" (sidebar staff oscuro);
// pasa variant="light" para portal cliente.
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
    ? 'relative p-2 rounded-lg text-ink-600 hover:bg-ink-100 transition'
    : 'relative p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition';

  return (
    <div className="relative">
      <button ref={btnRef} onClick={() => setOpen(o => !o)} className={btnCls} aria-label="Notificaciones">
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div ref={dropRef} className="absolute right-0 mt-2 w-80 bg-white border rounded-2xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-ink-700">Notificaciones</h3>
            {unread > 0 && (
              <button onClick={onMarkAll} className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-1">
                <CheckCheck className="w-3 h-3" /> Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-ink-400 text-xs">Cargando…</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-ink-400 text-xs">Sin notificaciones.</div>
            ) : (
              <ul className="divide-y">
                {items.map(n => (
                  <li key={n.id}>
                    <button onClick={() => onClickItem(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-ink-50 transition flex gap-3 ${!n.read_at ? 'bg-emerald-50/40' : ''}`}>
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.read_at ? 'bg-emerald-500' : 'bg-ink-200'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-ink-800">{n.title}</div>
                        {n.body && <div className="text-[11px] text-ink-500 mt-0.5 leading-snug">{n.body}</div>}
                        <div className="text-[10px] text-ink-400 mt-1 tabular">{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
