// The app's own icons for things the game has a symbol for. Ink line with one wax or gold accent; they take the
// text colour, so on the iron bar they turn gold. They sit beside the lucide interface icons, not instead of them.
import type { ReactNode } from 'react';
import styles from './GameIcon.module.css';

const wax = styles.wax;
const gold = styles.gold;

const ICONS = {
  d20: (
    <>
      <path className={gold} d="M12 7l5 8H7z" />
      <path d="M12 2l9 5v10l-9 5-9-5V7z" />
      <path d="M12 7l5 8H7zM12 7V2M12 7H3M12 7h9M7 15l-4 2M7 15l5 7M17 15l4 2M17 15l-5 7M7 15L3 7M17 15l4-8" />
    </>
  ),
  shield: (
    <>
      <path className={wax} d="M12 2v20c-4.5-1.500-8-5.500-8-11V5z" />
      <path d="M12 2l8 3v6c0 5.500-3.500 9.500-8 11-4.500-1.500-8-5.500-8-11V5zM12 2v20M4 10h16" />
    </>
  ),
  blades: (
    <>
      <path d="M4 3l13 13M20 3L7 16M14.500 17.500l3-3M9.500 17.500l-3-3M16.500 16.500L20 20M7.500 16.500L4 20" />
      <circle className={wax} cx="20.300" cy="20.300" r="1.500" />
      <circle className={wax} cx="3.700" cy="20.300" r="1.500" />
    </>
  ),
  potion: (
    <>
      <path className={wax} d="M5.800 14h12.400a6.300 6.300 0 0 1-12.400 0z" />
      <path d="M9.500 3h5M10.500 3v5.300a6.500 6.500 0 1 0 3 0V3" />
    </>
  ),
  scroll: (
    <>
      <path d="M7 4h12v13a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h11v1a3 3 0 0 0 2 2.800M7 4a2 2 0 0 0-2 2v10M9.500 8.500h6M9.500 11.500h6" />
      <circle className={wax} cx="16" cy="19" r="2.200" />
    </>
  ),
  spellbook: (
    <>
      <path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12" />
      <path
        className={gold}
        d="M12 6.500l1.100 2.300 2.500.3-1.800 1.700.5 2.500-2.300-1.300-2.300 1.300.5-2.500-1.800-1.700 2.500-.3z"
      />
    </>
  ),
  torch: (
    <>
      <path
        className={gold}
        d="M12 2c3 3 5 5.200 5 8a5 5 0 0 1-10 0c0-2 1-3.200 2-4.200.2 2 1 3 2 3 0-3 .1-5 1-6.800z"
      />
      <path d="M12 2c3 3 5 5.200 5 8a5 5 0 0 1-10 0c0-2 1-3.200 2-4.200.2 2 1 3 2 3 0-3 .1-5 1-6.800zM9 15.500h6l-1.500 6.500h-3z" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3a8 8 0 0 0-8 8c0 3 1.500 5 3 6v3h10v-3c1.500-1 3-3 3-6a8 8 0 0 0-8-8zM12 14l-1 2h2zM10 20v-2M12 20v-2M14 20v-2" />
      <circle className={wax} cx="9" cy="11" r="1.700" />
      <circle className={wax} cx="15" cy="11" r="1.700" />
    </>
  ),
  pouch: (
    <>
      <path d="M9 3h6l-1.500 4h-3zM10.500 7c-4 2-6 6-6 9a5 5 0 0 0 5 5h5a5 5 0 0 0 5-5c0-3-2-7-6-9M9 7.500h6" />
      <circle className={gold} cx="12" cy="15" r="3" />
      <circle cx="12" cy="15" r="3" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9.500" />
      <path className={wax} d="M12 3l2 7-2 2-2-2z" />
      <path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" />
    </>
  ),
  tower: (
    <>
      <path d="M6 21V9H5V4h3v2h2.500V4h3v2H16V4h3v5h-1v12zM11 11.500h2" />
      <path className={wax} d="M10 21v-4a2 2 0 0 1 4 0v4z" />
    </>
  ),
  key: (
    <>
      <circle cx="7" cy="12" r="4" />
      <circle className={gold} cx="7" cy="12" r="1.500" />
      <path d="M11 12h10M17 12v3.500M20.500 12v3" />
    </>
  ),
  campfire: (
    <>
      <path
        className={wax}
        d="M12 4c2.500 2.500 4 4.500 4 7a4 4 0 0 1-8 0c0-1.500.8-2.500 1.600-3.300.2 1.500.9 2.300 1.600 2.300 0-2.200.1-4 .8-6z"
      />
      <path d="M4 21l16-4M4 17l16 4" />
    </>
  ),
  moon: (
    <>
      <path className={gold} d="M20 14a8 8 0 1 1-9.500-10 6.500 6.500 0 0 0 9.500 10z" />
      <path d="M20 14a8 8 0 1 1-9.500-10 6.500 6.500 0 0 0 9.500 10zM17 4v3M15.500 5.500h3" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 3h12M6 21h12M7 3v3a5 5 0 0 0 2.500 4.300L12 12l2.500-1.700A5 5 0 0 0 17 6V3M7 21v-3a5 5 0 0 1 2.500-4.300L12 12l2.500 1.700A5 5 0 0 1 17 18v3" />
      <path className={gold} d="M9 21v-2.500l3-2.500 3 2.500V21z" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12c3-5 6.500-7 10-7s7 2 10 7c-3 5-6.500 7-10 7s-7-2-10-7z" />
      <path className={wax} d="M12 7.500c1.800 1.800 1.800 7.200 0 9-1.800-1.800-1.800-7.200 0-9z" />
    </>
  ),
  hat: (
    <>
      <path d="M3 19c3 1.600 15 1.600 18 0M6 18.500L11 4l2.200 1.500-1 2 4.800 11" />
      <path className={gold} d="M8 13.500h7.500l1 2.500h-9.500z" />
    </>
  ),
  heart: (
    <>
      <path className={wax} d="M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z" />
      <path d="M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z" />
    </>
  ),
  tankard: (
    <>
      <path d="M5 8h10v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM15 10h2a2.500 2.500 0 0 1 0 6h-2" />
      <path className={gold} d="M5 8c0-2 2-3 3-2 1-2 4-2 5 0 1-1 2 0 2 2z" />
    </>
  ),
  banner: (
    <>
      <path className={wax} d="M6 4h12l-3 4 3 4H6z" />
      <path d="M6 22V3M6 4h12l-3 4 3 4H6" />
    </>
  ),
  claws: <path d="M7 3c1.200 5.500 1.200 12-.8 18M12 2c1.200 6.500 1.200 13-.8 20M17 3c1.200 5.500 1.200 12-.8 18" />,
} satisfies Record<string, ReactNode>;

export type GameIconName = keyof typeof ICONS;

interface GameIconProps {
  name: GameIconName;
  /** A CSS length; the default follows the text beside it. */
  size?: string;
  /** Give a label only when the icon stands alone; beside text it is decoration. */
  label?: string;
  className?: string;
}

export function GameIcon({ name, size = '1.3em', label, className }: GameIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={[styles.icon, className ?? ''].filter(Boolean).join(' ')}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {ICONS[name]}
    </svg>
  );
}
