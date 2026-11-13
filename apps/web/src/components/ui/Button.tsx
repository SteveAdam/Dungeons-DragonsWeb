import type { ButtonHTMLAttributes, Ref } from 'react';
import styles from './Button.module.css';
import { GameIcon } from './GameIcon';

export type ButtonVariant = 'primary' | 'ghost' | 'iron' | 'ribbon' | 'die' | 'danger' | 'rune';

type ButtonProps = {
  /**
   * primary: a wax seal, the one main action on a screen. ghost: a torn scrap, for quiet actions on parchment.
   * iron: a riveted plate, for actions on the dark desk. ribbon: a pennant, for rewards. die: a gilded button that
   * carries a d20, for anything that rolls. danger: outlined in wax, for destructive actions. rune: a round stone
   * for an icon alone (give it an aria-label).
   */
  variant?: ButtonVariant;
  ref?: Ref<HTMLButtonElement>;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = 'primary', type = 'button', className, children, ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], className ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} data-variant={variant} {...rest}>
      {variant === 'die' && <GameIcon name="d20" className={styles.dieIcon} />}
      {children}
    </button>
  );
}
