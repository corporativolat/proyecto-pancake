/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal.jsx';

const useConfirmStore = create((set) => ({
  open: false,
  title: '',
  message: '',
  danger: false,
  requireType: null,        // texto exacto que debe escribir pa confirmar
  confirmLabel: null,       // label custom del botón (opcional)
  resolve: null,
  ask: ({ title = 'Confirmar', message = '¿Estás seguro?', danger = false, requireType = null, confirmLabel = null }) =>
    new Promise((resolve) => {
      set({ open: true, title, message, danger, requireType, confirmLabel, resolve });
    }),
  close: (value) => set((s) => {
    s.resolve?.(value);
    return { open: false, title: '', message: '', danger: false, requireType: null, confirmLabel: null, resolve: null };
  }),
}));

export const askConfirm = (opts) => useConfirmStore.getState().ask(opts);

export function ConfirmHost() {
  const { open, title, message, danger, requireType, confirmLabel, close } = useConfirmStore();
  const [typed, setTyped] = useState('');

  useEffect(() => { if (open) setTyped(''); }, [open]);

  if (!open) return null;
  const typeOk = !requireType || typed.trim() === requireType.trim();
  const btnLabel = confirmLabel || (danger ? 'ELIMINAR' : 'CONFIRMAR');

  return (
    <Modal
      title={title}
      onClose={() => close(false)}
      footer={(
        <>
          <button onClick={() => close(false)} className="btn-ghost">Cancelar</button>
          <button onClick={() => close(true)} disabled={!typeOk}
            className={`${danger ? 'btn-danger' : 'btn-primary'} disabled:opacity-40 disabled:cursor-not-allowed`}>
            {btnLabel}
          </button>
        </>
      )}
    >
      {danger && (
        <div className="flex items-start gap-3 p-3 mb-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-red-800 dark:text-red-300 font-bold leading-snug">Acción irreversible. Lee con cuidado antes de continuar.</p>
        </div>
      )}
      <p className="text-sm text-ink-700 dark:text-ink-200 leading-relaxed whitespace-pre-wrap">{message}</p>
      {requireType && (
        <div className="mt-4">
          <label className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-1.5 block">
            Para confirmar, escribe exactamente: <span className="text-red-600 font-mono normal-case tracking-normal">{requireType}</span>
          </label>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={requireType}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            className="input-light w-full font-mono"
          />
          {typed && !typeOk && (
            <p className="mt-1 text-[10px] text-red-600 font-bold">No coincide. Debe ser exactamente «{requireType}».</p>
          )}
        </div>
      )}
    </Modal>
  );
}
