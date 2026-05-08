/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import gsap from 'gsap';
import { reduced } from './motion';

const ThemeCtx = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('proTheme') || 'light');

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('proTheme', theme);
  }, [theme]);

  const toggle = () => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
    if (!reduced) {
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle at center, rgba(124,58,237,0.18), transparent 60%);z-index:9999;pointer-events:none';
      document.body.appendChild(flash);
      gsap.to(flash, { opacity: 0, duration: 0.6, ease: 'power3.out', onComplete: () => flash.remove() });
    }
  };

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx) || { theme: 'light', toggle: () => {} };
