import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import styles from './Paper.module.css';

type PaperProps = {
  /** The element to render, for the right semantics (section, header, div…). */
  as?: ElementType;
  /** "torn" gives a deep ragged edge; "framed" adds an illuminated double-rule border with corner bosses. */
  variant?: 'flat' | 'torn' | 'framed';
  /**
   * "full" (default) is worn paper: noise, two stains and an inset shadow, for large surfaces.
   * "flat" is plain parchment for forms and dense panels, where legibility matters more.
   */
  texture?: 'full' | 'flat';
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

/** A parchment surface. "Reduce texture" flattens every Paper, whatever its texture. */
export function Paper({
  as: As = 'div',
  variant = 'flat',
  texture = 'full',
  className,
  children,
  ...rest
}: PaperProps) {
  const classes = [
    styles.paper,
    texture === 'flat' ? styles.plain : styles.worn,
    variant === 'torn' ? styles.torn : variant === 'framed' ? styles.framed : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <As className={classes} data-variant={variant} data-texture={texture} {...rest}>
      {children}
    </As>
  );
}
