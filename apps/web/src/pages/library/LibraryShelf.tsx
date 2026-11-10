// P3-5: one shelf of the library: filters on the left, the entries in the middle, the open entry on the right.
// On a phone the list comes first, the filters open on request, and an entry takes the whole screen.
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Button, ICON_PROPS, iconClasses, Input, Paper, Tag } from '../../components/ui';
import styles from './Library.module.css';
import type { LibraryFilters, LibrarySource } from './libraryFilters';

const SOURCES: { id: LibrarySource; label: string }[] = [
  { id: 'srd', label: 'SRD' },
  { id: 'campaign', label: 'Campaign' },
];

interface Props<T> {
  /** Plural and lower case, e.g. "spells". */
  what: string;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  /** How many are on the shelf before filtering. */
  total: number;
  entries: T[];
  meta: (entry: T) => string;
  filters: LibraryFilters;
  onFilters: (filters: LibraryFilters) => void;
  /** The filters only this shelf has. */
  extraFilters?: ReactNode;
  /** "New from template" buttons. */
  templates?: ReactNode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  detail: (entry: T) => ReactNode;
}

function emptyMessage(what: string, total: number, filters: LibraryFilters) {
  if (!filters.sources.includes('srd')) return `No campaign ${what} yet. Clone an SRD entry or start from a template.`;
  if (total === 0) return `The ${what} shelf is empty: the SRD has not been imported yet.`;
  return 'Nothing on this shelf matches these filters.';
}

export function LibraryShelf<T extends { id: string; name: string; custom?: unknown }>({
  what,
  pending,
  error,
  onRetry,
  total,
  entries,
  meta,
  filters,
  onFilters,
  extraFilters,
  templates,
  selectedId,
  onSelect,
  detail,
}: Props<T>) {
  const id = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const selected = entries.find(e => e.id === selectedId);
  const open = !!selected;

  // the phone's full-screen entry starts at its title, for sight and for screen readers
  useEffect(() => {
    if (selectedId && window.matchMedia?.('(max-width: 699px)').matches) {
      panel.current?.querySelector<HTMLElement>('h2')?.focus();
    }
  }, [selectedId]);

  const toggleSource = (source: LibrarySource, on: boolean) =>
    onFilters({ ...filters, sources: on ? [...filters.sources, source] : filters.sources.filter(s => s !== source) });

  return (
    <>
      <Paper
        as="section"
        texture="flat"
        aria-label="Filters"
        className={[styles.filters, filtersOpen ? styles.filtersOpen : '', open ? styles.phoneHidden : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.filterField}>
          <label htmlFor={`${id}-search`}>{`Search ${what}`}</label>
          <Input
            id={`${id}-search`}
            type="search"
            value={filters.search}
            onChange={e => onFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <fieldset className={styles.filterGroup}>
          <legend>Source</legend>
          {SOURCES.map(s => (
            <label key={s.id} className={styles.check}>
              <input
                type="checkbox"
                checked={filters.sources.includes(s.id)}
                onChange={e => toggleSource(s.id, e.target.checked)}
              />{' '}
              {s.label}
            </label>
          ))}
        </fieldset>
        {extraFilters}
      </Paper>

      <Paper
        as="section"
        texture="flat"
        aria-label={`${what} list`}
        className={[styles.list, open ? styles.phoneHidden : ''].filter(Boolean).join(' ')}
      >
        <Button
          variant="ghost"
          className={[iconClasses.host, styles.phoneOnly].join(' ')}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(on => !on)}
        >
          <SlidersHorizontal {...ICON_PROPS} className={iconClasses.icon} />
          Filters
        </Button>
        {templates && <div className={styles.actions}>{templates}</div>}
        {error ? (
          <ErrorNotice error={error} onRetry={onRetry} />
        ) : pending ? (
          <p role="status">Taking the volumes down…</p>
        ) : entries.length === 0 ? (
          <p className={styles.note}>{emptyMessage(what, total, filters)}</p>
        ) : (
          <ul className={styles.entries}>
            {entries.map(entry => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={styles.entry}
                  aria-current={entry.id === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(entry.id)}
                >
                  <span className={styles.entryName}>{entry.name}</span>
                  <span className={styles.entryMeta}>{meta(entry)}</span>
                  {entry.custom ? <Tag tone="wax">CAMPAIGN</Tag> : <Tag>SRD</Tag>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Paper>

      <Paper
        as="section"
        texture="flat"
        aria-label="Entry"
        className={[styles.detail, open ? '' : styles.phoneHidden].filter(Boolean).join(' ')}
      >
        <div ref={panel} className={styles.detailBody}>
          {selected ? (
            <>
              <Button
                variant="ghost"
                className={[iconClasses.host, styles.phoneOnly].join(' ')}
                onClick={() => onSelect(null)}
              >
                <ArrowLeft {...ICON_PROPS} className={iconClasses.icon} />
                Back to the list
              </Button>
              {/* a new entry starts afresh, with no half-filled placing form from the last one */}
              <div key={selected.id} className={styles.detailContent}>
                {detail(selected)}
              </div>
            </>
          ) : (
            <p className={styles.note}>Choose an entry to read it here.</p>
          )}
        </div>
      </Paper>
    </>
  );
}
