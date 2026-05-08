import { useEffect, useRef } from 'react';
import { reduced } from '../lib/motion';

export default function CursorGlow() {
  const ref = useRef(null);
  useEffect(() => {
    if (reduced || !ref.current) return;
    const el = ref.current;
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;
    const onMove = (e) => { mx = e.clientX; my = e.clientY; };
    document.addEventListener('mousemove', onMove);
    let raf;
    const tick = () => {
      cx += (mx - cx) * 0.10;
      cy += (my - cy) * 0.10;
      el.style.setProperty('--mx', cx + 'px');
      el.style.setProperty('--my', cy + 'px');
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { document.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={ref} className="cursor-glow" aria-hidden></div>;
}
