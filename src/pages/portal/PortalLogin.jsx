import { useEffect, useRef, useState } from 'react';
import { Lock, ArrowRight, Briefcase } from 'lucide-react';
import gsap from 'gsap';
import { useAuth } from '../../lib/auth.jsx';
import { reduced, shake } from '../../lib/motion';

// Login dedicado al portal de clientes. Sin registro: las cuentas
// solo se crean desde el panel administrativo.
export default function PortalLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (reduced || !cardRef.current) return;
    gsap.fromTo(cardRef.current,
      { y: 24, opacity: 0, scale: 0.96 },
      { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'power3.out' }
    );
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await signIn(email, pass);
    } catch (ex) {
      setErr(ex.message || 'Error');
      shake(cardRef.current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-20 w-96 h-96 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-teal-500/20 blur-3xl" />
      </div>
      <div ref={cardRef} className="relative z-10 w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-10 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 mb-5 shadow-lg shadow-emerald-500/30">
              <Briefcase className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">Portal de Clientes</h1>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mt-2">Acceso exclusivo</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 block">Correo</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 block">Contraseña</label>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
            </div>
            {err && <div className="text-xs text-red-300 font-bold bg-red-500/20 backdrop-blur p-3 rounded-xl border border-red-500/30">{err}</div>}
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60 text-white font-bold rounded-xl py-3 flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/30">
              <span>{busy ? 'Entrando…' : 'Ingresar'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="text-[10px] text-white/40 font-medium pt-4 border-t border-white/10 mt-4 leading-relaxed text-center">
              <Lock className="w-3 h-3 inline mr-1" />
              ¿No tienes acceso? Contacta a tu ejecutivo.
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
