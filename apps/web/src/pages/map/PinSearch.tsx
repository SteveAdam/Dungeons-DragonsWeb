import { useId, useState } from 'react';
import { Input } from '../../components/ui';
import type { Pin } from '../../data/pins';
import styles from './MapTools.module.css';
import { PIN_TYPE_LABELS } from './pinIcons';

const MAX_RESULTS = 8;

/** Finds pins by name, tag or type; choosing one opens it and pans the map to it. */
export function PinSearch({ pins, onPick }: { pins: readonly Pin[]; onPick: (pin: Pin) => void }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = q
    ? pins
        .filter(p => [p.title, PIN_TYPE_LABELS[p.type], ...p.tags].some(text => text.toLowerCase().includes(q)))
        .slice(0, MAX_RESULTS)
    : [];
  return (
    <div className={styles.search} role="search">
      <label htmlFor={`${id}-q`} className={styles.visuallyHidden}>
        Find a pin
      </label>
      <Input
        id={`${id}-q`}
        type="search"
        placeholder="Find a pin"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-controls={`${id}-results`}
      />
      {q && (
        <ul id={`${id}-results`} aria-label="Pins found" className={styles.results}>
          {matches.length === 0 && <li className={styles.none}>No pin matches.</li>}
          {matches.map(p => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setQuery('');
                }}
              >
                {p.title}
                <span className={styles.kind}>{PIN_TYPE_LABELS[p.type]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
