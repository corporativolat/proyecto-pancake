import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderKanban, Users, Tag, Settings as SettingsIcon, LayoutDashboard, Moon, Sun } from 'lucide-react';
import gsap from 'gsap';
import { useStore } from '../lib/store';
import { useTheme } from '../lib/theme.jsx';
import { useT } from '../lib/i18n.jsx';
import { reduced } from '../lib/motion';

export default function CommandPalette({ open, onClose }) {
  const projects = useStore(s => s.projects);
  const profiles = useStore(s => s.profiles);
  const categories = useStore(s => s.categories);
  const navigate = useNavigate();
  const { toggle: toggleTheme, theme } = useTheme();
  const { t } = useT();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const cardRef = useRef(null);
  const overlayRef = useRef(null);
  const downOnOverlayRef = useRef(false);

  useEffect(() => {
    if (open && !reduced) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(cardRef.current, { y: -20, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.4)' });
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (open) { setQ(''); setIdx(0); }
  }, [open]);

  const items = useMemo(() => {
    const ql = q.toLowerCase();
    const out = [];
    out.push({ id: 'go-dash', kind: 'page', label: t('nav.dashboard'), icon: <LayoutDashboard className="w-3.5 h-3.5" />, action: () => navigate('/dashboard') });
    out.push({ id: 'go-team', kind: 'page', label: t('nav.team'), icon: <Users className="w-3.5 h-3.5" />, action: () => navigate('/team') });
    out.push({ id: 'go-projects', kind: 'page', label: t('nav.projects'), icon: <FolderKanban className="w-3.5 h-3.5" />, action: () => navigate('/projects') });
    out.push({ id: 'go-settings', kind: 'page', label: t('nav.settings'), icon: <SettingsIcon className="w-3.5 h-3.5" />, action: () => navigate('/settings') });
    out.push({ id: 'theme', kind: 'cmd', label: theme === 'dark' ? t('cmd.lightMode') : t('cmd.darkMode'), icon: theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />, action: () => toggleTheme() });

    projects.forEach(p => out.push({ id: p.id, kind: 'project', label: p.title, hint: p.company, icon: <FolderKanban className="w-3.5 h-3.5 text-violet-500" />, action: () => navigate(`/projects/${p.id}`) }));
    profiles.forEach(p => out.push({ id: 'u-' + p.id, kind: 'user', label: p.name, hint: p.email, icon: <Users className="w-3.5 h-3.5 text-emerald-500" />, action: () => navigate('/admin') }));
    categories.forEach(c => out.push({ id: 'c-' + c.id, kind: 'category', label: c.name, icon: <Tag className="w-3.5 h-3.5" style={{ color: c.color }} />, action: () => navigate('/projects') }));

    if (!ql) return out;
    return out.filter(i => i.label.toLowerCase().includes(ql) || (i.hint || '').toLowerCase().includes(ql));
  }, [q, projects, profiles, categories, theme, t, navigate, toggleTheme]);

  useEffect(() => { setIdx(0); }, [q]);

  const close = () => {
    if (reduced) { onClose(); return; }
    gsap.to(cardRef.current, { y: -10, scale: 0.97, opacity: 0, duration: 0.15 });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.18, onComplete: onClose });
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); items[idx]?.action(); close(); }
  };

  const onOverlayDown = (e) => { downOnOverlayRef.current = (e.target === overlayRef.current); };
  const onOverlayUp = (e) => {
    if (downOnOverlayRef.current && e.target === overlayRef.current) close();
    downOnOverlayRef.current = false;
  };

  if (!open) return null;
  return (
    <div ref={overlayRef} className="cmdk-overlay" onMouseDown={onOverlayDown} onMouseUp={onOverlayUp}>
      <div ref={cardRef} className="cmdk-card">
        <div className="flex items-center gap-2 px-4 border-b border-ink-100">
          <Search className="w-4 h-4 text-ink-400" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKey} placeholder={t('cmd.placeholder')} className="cmdk-input" />
          <span className="cmdk-kbd">ESC</span>
        </div>
        <div className="cmdk-list scroller">
          {!items.length && <div className="empty py-8"><p className="text-xs italic">{t('cmd.empty')}</p></div>}
          {items.map((it, i) => (
            <div key={it.id} onClick={() => { it.action(); close(); }} onMouseEnter={() => setIdx(i)} className={`cmdk-item ${i === idx ? 'active' : ''}`}>
              {it.icon}
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-[10px] text-ink-400 truncate">{it.hint}</span>}
              <span className="text-[10px] text-ink-400 uppercase tracking-wider">{it.kind}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 px-3 py-2 border-t border-ink-100 text-[10px] text-ink-400">
          <span><span className="cmdk-kbd">↑↓</span> {t('cmd.nav')}</span>
          <span><span className="cmdk-kbd">⏎</span> {t('cmd.open')}</span>
          <span><span className="cmdk-kbd">⌘K</span> {t('cmd.toggle')}</span>
        </div>
      </div>
    </div>
  );
}
