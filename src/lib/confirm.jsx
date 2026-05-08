/* eslint-disable react-refresh/only-export-components */
import { create } from 'zustand';
import Modal from '../components/Modal.jsx';

const useConfirmStore = create((set) => ({
  open: false,
  title: '',
  message: '',
  danger: false,
  resolve: null,
  ask: ({ title = 'Confirmar', message = '¿Estás seguro?', danger = false }) =>
    new Promise((resolve) => {
      set({ open: true, title, message, danger, resolve });
    }),
  close: (value) => set((s) => {
    s.resolve?.(value);
    return { open: false, title: '', message: '', danger: false, resolve: null };
  }),
}));

export const askConfirm = (opts) => useConfirmStore.getState().ask(opts);

export function ConfirmHost() {
  const { open, title, message, danger, close } = useConfirmStore();
  if (!open) return null;
  return (
    <Modal
      title={title}
      onClose={() => close(false)}
      footer={(
        <>
          <button onClick={() => close(false)} className="btn-ghost">Cancelar</button>
          <button onClick={() => close(true)} className={danger ? 'btn-danger' : 'btn-primary'}>
            {danger ? 'ELIMINAR' : 'CONFIRMAR'}
          </button>
        </>
      )}
    >
      <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{message}</p>
    </Modal>
  );
}
