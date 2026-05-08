import { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';
import gsap from 'gsap';
import { reduced } from '../lib/motion';

const ITEMS = [
  { keys: ['Ctrl', 'K'], desc: 'Abrir command palette' },
  { keys: ['Ctrl', 'Shift', 'K'], desc: 'Cambiar tema (custom)' },
  { keys: ['?'], desc: 'Mostrar atajos' },
  { keys: ['Esc'], desc: 'Cerrar modal' },
  { keys: ['↑', '↓'], desc: 'Navegar palette' },
  { keys: ['⏎'], desc: 'Confirmar' },
  { keys: ['Ctrl', '⏎'], desc: 'Enviar comentario rápido' },
];

export default function Shortcuts({ open, onClose }) {
  const overlayRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (open && !reduced) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(cardRef.current, { y: 20, scale: 0.95, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' });
    }
  }, [open]);

  const close = () => {
    if (reduced) { onClose(); return; }
    gsap.to(cardRef.current, { y: 12, scale: 0.97, opacity: 0, duration: 0.18 });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, onComplete: onClose });
  };

  if (!open) return null;
  return (
    <div ref={overlayRef} className="modal-overlay" onClick={(e) => { if (e.target === overlayRef.current) close(); }}>
      <div ref={cardRef} className="modal-card max-w-md">
        <div className="modal-header">
          <h3 className="text-lg font-black tracking-tight flex items-center gap-2"><Keyboard className="w-5 h-5" /> Atajos</h3>
          <button onClick={close} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-7 space-y-3">
          {ITEMS.map((it, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm">{it.desc}</span>
              <div className="flex gap-1.5">
                {it.keys.map((k, j) => <span key={j} className="cmdk-kbd">{k}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
