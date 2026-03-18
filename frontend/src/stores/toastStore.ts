import { create } from 'zustand';

export type ToastType = 'success' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  nextId: number;
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: number) => void;
}

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 4000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  nextId: 1,

  addToast: (message: string, type: ToastType) => {
    const id = get().nextId;
    set((state) => {
      let toasts = [...state.toasts, { id, message, type }];
      // Keep only the newest MAX_TOASTS
      if (toasts.length > MAX_TOASTS) {
        toasts = toasts.slice(toasts.length - MAX_TOASTS);
      }
      return { toasts, nextId: state.nextId + 1 };
    });

    // Auto-dismiss after timeout
    setTimeout(() => {
      get().removeToast(id);
    }, AUTO_DISMISS_MS);
  },

  removeToast: (id: number) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
