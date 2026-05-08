import { useEffect, useState, useRef } from 'react';
import { Send, Trash2, MessageCircle } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../lib/auth.jsx';
import { fetchComments, createComment, deleteComment } from '../lib/comments';
import { reduced } from '../lib/motion';
import { useToast } from '../lib/toast';
import { askConfirm } from '../lib/confirm.jsx';
import { logger } from '../lib/logger';
import Avatar from './Avatar.jsx';

export default function Comments({ projectId }) {
  const { profile } = useAuth();
  const showToast = useToast(s => s.show);
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  const load = async () => {
    try { setComments(await fetchComments(projectId)); }
    catch (e) { logger.error(e); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) load(); }, [projectId]);

  useEffect(() => {
    if (reduced || !listRef.current) return;
    gsap.fromTo(listRef.current.querySelectorAll('[data-c]'), { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out', stagger: 0.04 });
  }, [comments.length]);

  const send = async (e) => {
    e?.preventDefault();
    const txt = body.trim();
    if (!txt) return;
    if (txt.length > 4000) { showToast('Comentario demasiado largo (máx 4000)', 'error'); return; }
    setBusy(true);
    try {
      const c = await createComment(projectId, profile.id, txt);
      setComments(prev => [c, ...prev]);
      setBody('');
    } catch (ex) { showToast('Error: ' + ex.message, 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    const ok = await askConfirm({ title: 'Eliminar comentario', message: '¿Confirmar eliminación?', danger: true });
    if (!ok) return;
    try { await deleteComment(id); setComments(prev => prev.filter(c => c.id !== id)); }
    catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const fmt = (iso) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="card-light p-7" data-stagger>
      <h3 className="text-[10px] font-black text-ink-400 uppercase tracking-widest mb-5 flex items-center gap-2">
        <MessageCircle className="w-3.5 h-3.5" /> Bitácora · {comments.length}
      </h3>

      <form onSubmit={send} className="flex items-start gap-3 mb-5">
        <Avatar user={profile} size={36} />
        <div className="flex-1 flex gap-2">
          <textarea value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e); }} placeholder="Comentario, decisión, observación..." className="input-light flex-1 resize-none h-12 leading-tight pt-3" />
          <button type="submit" disabled={busy || !body.trim()} className="btn-primary disabled:opacity-50 self-start"><Send className="w-3.5 h-3.5" /></button>
        </div>
      </form>

      <div ref={listRef} className="space-y-3">
        {comments.length === 0 && <p className="text-xs text-ink-400 italic text-center py-6">Sin comentarios. Sé el primero.</p>}
        {comments.map(c => (
          <div key={c.id} data-c className="flex items-start gap-3 group">
            <Avatar user={c.profile} size={32} />
            <div className="flex-1 min-w-0">
              <div className="comment-bubble">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{c.profile?.name || '—'}</span>
                  <span className="text-[10px] text-ink-400 tabular">{fmt(c.created_at)}</span>
                </div>
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{c.body}</p>
              </div>
            </div>
            {(c.profile_id === profile.id || profile.role === 'admin') && (
              <button onClick={() => remove(c.id)} className="text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition mt-2">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
