import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

type PaperProps = {
  /** The element to render, for the right semantics (section, header, div…). */
  as?: ElementType;
  /** "torn" gives the ragged-edge banner look. */
  variant?: 'flat' | 'torn';
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function Paper({ as: As = 'div', variant = 'flat', className, children, ...rest }: PaperProps) {
  const classes = [styles.paper, variant === 'torn' ? styles.torn : '', className ?? ''].filter(Boolean).join(' ');
  return <As className={classes} {...rest}>{children}</As>;
}
