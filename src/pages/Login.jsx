import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, ArrowRight } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../lib/auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { reduced, shake } from '../lib/motion';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState('signin');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (reduced || !cardRef.current) return;
    gsap.fromTo(cardRef.current,
      { y: 30, opacity: 0, scale: 0.94 },
      { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(1.2)' }
    );
    const logo = cardRef.current.querySelector('[data-logo]');
    if (logo) gsap.fromTo(logo, { rotation: -180, opacity: 0 }, { rotation: 0, opacity: 1, duration: 0.9, ease: 'power3.out', delay: 0.15 });
    const handler = (e) => {
      const rx = (e.clientY / window.innerHeight - 0.5) * 6;
      const ry = (e.clientX / window.innerWidth - 0.5) * -6;
      gsap.to(cardRef.current, { rotateX: rx, rotateY: ry, transformPerspective: 1000, duration: 0.6, ease: 'power3.out' });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, pass);
      else await signUp(email, pass, name);
    } catch (ex) {
      setErr(ex.message || 'Error');
      shake(cardRef.current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fixed inset-0 z-50 flex items-center justify-center p-6 login-bg">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      <div ref={cardRef} className="relative z-10 w-full max-w-md">
        <div className="glass-card p-12">
          <div className="text-center mb-10">
            <div data-logo className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600 mb-6 shadow-2xl shadow-violet-500/30">
              <LayoutDashboard className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-white">{t('login.title')}</h1>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mt-2">{t('login.subtitle')}</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            {mode === 'signup' && (
              <div>
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 block">{t('login.name')}</label>
                <input value={name} onChange={e => setName(e.target.value)} required className="input-glass" />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 block">{t('login.email')}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-glass" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 block">{t('login.password')}</label>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} required className="input-glass" />
            </div>
            {err && <div className="text-xs text-red-300 font-bold bg-red-500/20 backdrop-blur p-3 rounded-xl border border-red-500/30">{err}</div>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
              <span>{busy ? t('login.processing') : (mode === 'signin' ? t('login.signin') : t('login.signup'))}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(''); }} className="w-full text-[11px] text-white/50 hover:text-white font-semibold transition">
              {mode === 'signin' ? t('login.toSignup') : t('login.toSignin')}
            </button>
            <div className="text-[10px] text-white/40 font-medium pt-5 border-t border-white/10 mt-5 leading-relaxed">
              <strong className="text-white/60">{t('login.access')}</strong><br />
              {t('login.accessNote')}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
