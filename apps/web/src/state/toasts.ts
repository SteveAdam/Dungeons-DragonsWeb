import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string) => void;
  dismiss: (id: number) => void;
}

// a screen's worth: anything older gives way to what just happened
const MOST_SHOWN = 4;
let nextId = 1;

/** The short messages in the app shell's toast region. */
export const useToasts = create<ToastState>()(set => ({
  toasts: [],
  push: message => set(s => ({ toasts: [...s.toasts, { id: nextId++, message }].slice(-MOST_SHOWN) })),
  dismiss: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
