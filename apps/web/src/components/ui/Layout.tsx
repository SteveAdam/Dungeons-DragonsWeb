import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ICON_PROPS, type LucideIcon } from './icons';
import styles from './Layout.module.css';
import { Paper } from './Paper';

type Span = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * The page grid: 12 columns (1100px and wider), 6 (700 to 1099px) or one (phones), with the kit's gutters and
 * margins, at most --page-max wide. Lay pages out with Cells inside it.
 */
export function PageGrid({
  as: As = 'main',
  className,
  children,
  ...rest
}: { as?: ElementType; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <As className={[styles.grid, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </As>
  );
}

/**
 * One area of the page grid. `span` is out of 12 columns, `spanMd` out of the 6 on mid-sized screens (by default
 * half of `span`, rounded up); on phones every cell takes the whole width.
 */
export function Cell({
  as: As = 'div',
  span = 12,
  spanMd,
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType;
  span?: Span;
  spanMd?: 1 | 2 | 3 | 4 | 5 | 6;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const md = spanMd ?? Math.min(6, Math.ceil(span / 2));
  return (
    <As
      className={[styles.cell, className ?? ''].filter(Boolean).join(' ')}
      style={{ '--span': span, '--span-md': md, ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </As>
  );
}

/** A section heading: blackletter over a double rule. `onDesk` for one that sits on the brick, not on paper. */
export function SectionTitle({
  as: As = 'h2',
  onDesk = false,
  className,
  children,
  ...rest
}: { as?: ElementType; onDesk?: boolean; children?: ReactNode } & HTMLAttributes<HTMLHeadingElement>) {
  return (
    <As
      className={[styles.sectionTitle, onDesk ? styles.onDesk : '', className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </As>
  );
}

/** The red band: one line of news across the grid. Each item is separated by a small star. */
export function Band({ items, className }: { items: ReactNode[]; className?: string }) {
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <p className={[styles.band, className ?? ''].filter(Boolean).join(' ')}>
      {shown.map((item, i) => (
        <span key={i}>
          {i > 0 && (
            <span aria-hidden="true" className={styles.bandMark}>
              {'✦ '}
            </span>
          )}
          {item}
        </span>
      ))}
    </p>
  );
}

/** A numbered step card that links somewhere: icon, title, a line of text, and its number on a coin below. */
export function StepCard({
  to,
  icon: Icon,
  title,
  number,
  children,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  number: number;
  children?: ReactNode;
}) {
  return (
    // Paper renders the Link; `to` passes through its other props
    <Paper as={Link} texture="flat" className={styles.step} {...({ to } as HTMLAttributes<HTMLElement>)}>
      <Icon {...ICON_PROPS} size="2.5rem" className={styles.stepIcon} />
      <span className={styles.stepTitle}>{title}</span>
      {children && <span className={styles.stepText}>{children}</span>}
      <span aria-hidden="true" className={styles.stepNumber}>
        {number}
      </span>
    </Paper>
  );
}

/** A d20 for a spread's corner. Decoration only: hidden from screen readers and from pointer events. */
export function Dice({
  face = 20,
  tone = 'red',
  style,
}: {
  face?: number;
  tone?: 'red' | 'gold';
  style?: CSSProperties;
}) {
  const fill = tone === 'red' ? 'var(--wax-red)' : 'var(--gold)';
  const mark = tone === 'red' ? 'var(--paper)' : 'var(--ink)';
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" width="56" height="56" className={styles.dice} style={style}>
      {/* colours through style: SVG presentation attributes cannot read CSS variables */}
      <polygon points="50,4 92,28 92,72 50,96 8,72 8,28" strokeWidth="3" style={{ fill, stroke: 'var(--iron)' }} />
      <polygon points="50,24 74,64 26,64" fill="none" strokeWidth="3" style={{ stroke: mark }} />
      <text x="50" y="58" textAnchor="middle" fontSize="20" style={{ fill: mark, fontFamily: 'var(--font-heading)' }}>
        {face}
      </text>
    </svg>
  );
}
