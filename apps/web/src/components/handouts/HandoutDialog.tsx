// P4-4: the parchment card the handout popup and viewer sit on: a modal dialog that keeps focus inside, closes on
// Escape or a click on the dim desk, and gives focus back to where it was.
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Button, ICON_PROPS, Paper } from '../ui';
import styles from './Handouts.module.css';

interface HandoutDialogProps {
  /** The dialog's accessible name. */
  title: string;
  kicker?: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}

export function HandoutDialog({ title, kicker, onClose, wide, children }: HandoutDialogProps) {
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = card.current?.querySelector<HTMLElement>('[data-autofocus]') ?? card.current;
    first?.focus();
    return () => before?.focus?.();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !card.current) return;
    const focusable = [
      ...card.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea'),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog}
      >
        <Paper as="div" texture="full" className={styles.sheet}>
          {kicker && <p className={styles.kicker}>{kicker}</p>}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </Paper>
        <Button variant="ghost" aria-label="Close" className={styles.close} onClick={onClose}>
          <X {...ICON_PROPS} />
        </Button>
      </div>
    </>
  );
}
