import { useMemo } from 'react';
import DOMPurify from 'dompurify';

// Configuración: permitimos elementos básicos + style inline para color/font.
// `style` se limita a una lista corta de propiedades (color, font-family,
// text-align). NO permitimos `background`/`background-image`/`position` para
// cerrar exfil por CSS y clickjacking — ver auditoría de mig-29 (H3).
const ALLOWED_STYLE_PROPS = new Set(['color','font-family','text-align']);

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p','br','strong','em','u','s','span','a',
    'h1','h2','h3','h4','h5','h6',
    'ul','ol','li','blockquote','code','pre',
    'div'
  ],
  ALLOWED_ATTR: ['href','target','rel','style','class'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
};

// Hook único de DOMPurify (idempotente):
//   - Sanitiza `style` quedándose solo con propiedades permitidas.
//   - Fuerza rel="noopener noreferrer" en <a target="_blank">.
let purifyHookInstalled = false;
function ensurePurifyHook() {
  if (purifyHookInstalled) return;
  purifyHookInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // 1) Cierra reverse-tabnabbing en <a target=_blank>.
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      const tgt = (node.getAttribute('target') || '').toLowerCase();
      if (tgt === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      } else if (tgt !== '_self') {
        node.setAttribute('target', '_self');
      }
    }
    // 2) Filtra `style` a propiedades whitelisted.
    if (node.hasAttribute && node.hasAttribute('style')) {
      const decls = (node.getAttribute('style') || '').split(';');
      const safe = [];
      for (const decl of decls) {
        const idx = decl.indexOf(':');
        if (idx === -1) continue;
        const prop = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (!prop || !val) continue;
        if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
        // Bloquea valores que invoquen url() / expression() / image-set().
        if (/url\s*\(|expression\s*\(|image-set\s*\(|@import/i.test(val)) continue;
        safe.push(`${prop}: ${val}`);
      }
      if (safe.length === 0) node.removeAttribute('style');
      else node.setAttribute('style', safe.join('; '));
    }
  });
}
ensurePurifyHook();

// Render-only HTML sanitizado del editor rich-text.
// Acepta `html` (string) y un className para envolverlo.
export default function RichTextView({ html, className = '', emptyFallback = null }) {
  const clean = useMemo(() => {
    if (!html || typeof html !== 'string') return '';
    const trimmed = html.trim();
    if (!trimmed || trimmed === '<p></p>') return '';
    return DOMPurify.sanitize(trimmed, PURIFY_CONFIG);
  }, [html]);

  if (!clean) return emptyFallback;

  return (
    <div
      className={`rte-view ${className}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

// Helper: extrae texto plano de un HTML para previews/listados breves.
export function htmlToPlainText(html, maxLen = 0) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = DOMPurify.sanitize(html, PURIFY_CONFIG);
  const text = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
  if (maxLen > 0 && text.length > maxLen) return text.slice(0, maxLen - 1) + '…';
  return text;
}
