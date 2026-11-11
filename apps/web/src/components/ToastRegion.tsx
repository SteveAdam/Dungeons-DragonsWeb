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
