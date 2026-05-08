import gsap from 'gsap';

export const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function countUp(el, target, opts = {}) {
  if (!el) return;
  const suffix = opts.suffix || '';
  if (reduced) { el.innerText = target + suffix; return; }
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target, duration: opts.dur || 1.0, ease: 'power3.out',
    onUpdate: () => { el.innerText = Math.round(obj.v) + suffix; }
  });
}

export function animateBars(scope) {
  if (reduced) return;
  const bars = (scope || document).querySelectorAll('[data-bar]');
  bars.forEach(b => {
    const w = b.getAttribute('data-bar');
    gsap.fromTo(b, { width: 0 }, { width: w + '%', duration: 1.0, ease: 'power3.out' });
  });
}

export function staggerIn(scope, selector = '[data-stagger]') {
  if (reduced) return;
  const els = (scope || document).querySelectorAll(selector);
  if (!els.length) return;
  gsap.fromTo(els, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.05 });
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth;
  el.classList.add('shake');
}

export function magnetic(el, strength = 0.12) {
  if (reduced || !el) return () => {};
  let bounds;
  const onEnter = () => { bounds = el.getBoundingClientRect(); };
  const onMove = (e) => {
    if (!bounds) return;
    const x = (e.clientX - bounds.left - bounds.width / 2) * strength;
    const y = (e.clientY - bounds.top - bounds.height / 2) * strength;
    gsap.to(el, { x, y, duration: 0.4, ease: 'power3.out' });
  };
  const onLeave = () => { gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' }); };
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseleave', onLeave);
  return () => {
    el.removeEventListener('mouseenter', onEnter);
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseleave', onLeave);
  };
}

export function confetti(host, color = '#7c3aed') {
  if (reduced || !host) return;
  const burst = document.createElement('div');
  burst.className = 'confetti-burst';
  const colors = [color, '#a855f7', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-particle';
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const dist = 50 + Math.random() * 50;
    p.style.setProperty('--cx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--cy', Math.sin(angle) * dist - 30 + 'px');
    p.style.setProperty('--cr', (Math.random() * 720) + 'deg');
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 80) + 'ms';
    burst.appendChild(p);
  }
  const prev = getComputedStyle(host).position;
  if (prev === 'static') host.style.position = 'relative';
  host.appendChild(burst);
  setTimeout(() => burst.remove(), 1000);
}
