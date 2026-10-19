import { useRef, type HTMLAttributes, type KeyboardEvent } from 'react';
import styles from './ui.module.css';

type RibbonTabsProps = {
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>;

/** Ribbon-style tabs. Arrow keys, Home and End move between them. */
export function RibbonTabs({ tabs, value, onChange, className, ...rest }: RibbonTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next = e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : -1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  }

  return (
    <div role="tablist" className={[styles.tabs, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {tabs.map((tab, i) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={selected ? `${styles.tab} ${styles.tabSelected}` : styles.tab}
            onClick={() => onChange(tab.id)}
            onKeyDown={e => onKeyDown(e, i)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
