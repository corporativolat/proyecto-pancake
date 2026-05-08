import { create } from 'zustand';

export const useToast = create((set) => ({
  msg: null,
  kind: 'success',
  show: (msg, kind = 'success') => {
    set({ msg, kind });
    setTimeout(() => set({ msg: null }), 2800);
  }
}));
