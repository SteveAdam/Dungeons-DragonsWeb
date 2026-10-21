import { useRef, type HTMLAttributes, type KeyboardEvent } from 'react';
import { ICON_PROPS, iconClasses, type LucideIcon } from './icons';
import styles from './RibbonTabs.module.css';

type RibbonTabsProps = {
  tabs: { id: string; label: string; icon?: LucideIcon }[];
  value: string;
  onChange: (id: string) => void;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>;

/**
 * Tabs drawn as bookmark ribbons hanging from a rule, each with an optional icon. The selected ribbon hangs
 * lower, so the state never depends on colour alone. Arrow keys, Home and End move between tabs.
 */
export function RibbonTabs({ tabs, value, onChange, className, ...rest }: RibbonTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
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
            ref={el => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={[styles.tab, selected ? styles.selected : '', tab.icon ? iconClasses.host : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(tab.id)}
            onKeyDown={e => onKeyDown(e, i)}
          >
            {tab.icon && <tab.icon {...ICON_PROPS} className={iconClasses.icon} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
