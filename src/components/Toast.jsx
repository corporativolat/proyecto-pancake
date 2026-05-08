import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '../lib/toast';
import { reduced } from '../lib/motion';

const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };
const COLOR = { success: 'text-emerald-400', error: 'text-red-400', info: 'text-violet-400' };

export default function Toast() {
  const msg = useToast(s => s.msg);
  const kind = useToast(s => s.kind);
  const ref = useRef(null);
  useEffect(() => {
    if (msg && ref.current && !reduced) {
      gsap.fromTo(ref.current, { y: 24, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.6)' });
      gsap.to(ref.current, { x: 80, opacity: 0, duration: 0.35, ease: 'power2.in', delay: 2.4 });
    }
  }, [msg]);
  if (!msg) return null;
  const Icon = ICON[kind] || CheckCircle2;
  return (
    <div ref={ref} className="toast" role="status" aria-live="polite">
      <Icon className={`w-5 h-5 ${COLOR[kind] || COLOR.success}`} />
      <span className="text-sm font-bold">{msg}</span>
    </div>
  );
}
