import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import gsap from 'gsap';
import { reduced } from '../lib/motion';
import { useT } from '../lib/i18n.jsx';

export default function Modal({ title, children, onClose, onSave, footer, maxWidth = 'max-w-2xl' }) {
  const overlayRef = useRef(null);
  const cardRef = useRef(null);
  const downOnOverlayRef = useRef(false);
  const { t } = useT();

  useEffect(() => {
    if (reduced) return;
    gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
    gsap.fromTo(cardRef.current, { y: 24, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.4)' });
  }, []);

  const close = () => {
    if (reduced) { onClose(); return; }
    gsap.to(cardRef.current, { y: 12, scale: 0.97, opacity: 0, duration: 0.2, ease: 'power2.in' });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.2, delay: 0.05, onComplete: onClose });
  };

  // Cierra solo si el usuario hizo mousedown Y mouseup en el overlay (no si
  // arrastra desde dentro al backdrop al seleccionar texto, ni si suelta el
  // mouse dentro del contenido tras un click iniciado fuera).
  const onMouseDown = (e) => { downOnOverlayRef.current = (e.target === overlayRef.current); };
  const onMouseUp = (e) => {
    if (downOnOverlayRef.current && e.target === overlayRef.current) close();
    downOnOverlayRef.current = false;
  };

  return (
    <div ref={overlayRef} className="modal-overlay" onMouseDown={onMouseDown} onMouseUp={onMouseUp}>
      <div ref={cardRef} className={`modal-card ${maxWidth}`}>
        <div className="modal-header">
          <h3 className="text-lg font-black tracking-tight">{title}</h3>
          <button onClick={close} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="modal-body scroller-pro">{children}</div>
        <div className="modal-footer">
          {footer || (
            <>
              <button onClick={close} className="btn-ghost">{t('common.cancel')}</button>
              {onSave && <button onClick={onSave} className="btn-primary">{t('common.save')}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
