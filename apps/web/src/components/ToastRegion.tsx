import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useToasts, type Toast } from '../state/toasts';
import styles from './LiveHeader.module.css';
import { ICON_PROPS, Paper } from './ui';

export const TOAST_MS = 6000;

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToasts(s => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);
  return (
    <Paper texture="flat" className={styles.toast}>
      <svg aria-hidden="true" viewBox="0 0 48 48" className={styles.toastSeal}>
        <path d="M24 3c5 0 7 3 11 4s8 1 9 6-2 7-1 12 4 8 1 12-8 3-12 5-6 4-11 3-6-5-10-7-8-2-9-7 3-7 3-12-3-8 0-12 8-2 12-3 4-1 7-1z" />
        <path d="M16 24.500l6 6L33 18" />
      </svg>
      <p className={styles.toastText}>{toast.message}</p>
      <button type="button" className={styles.toastClose} aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
        <X {...ICON_PROPS} />
      </button>
    </Paper>
  );
}

/** Always in the page, even when empty, so screen readers are listening before the first toast arrives. */
export function ToastRegion() {
  const toasts = useToasts(s => s.toasts);
  return (
    <div className={styles.toasts} role="status" aria-live="polite" aria-label="Notifications">
      {toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
