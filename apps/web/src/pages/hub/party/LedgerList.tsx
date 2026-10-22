import { formatPurse } from '@dnd-manager/rules-engine';
import { useId, useState } from 'react';
import type { CharacterSummary } from '../../../data/characters';
import { LEDGER_SOURCES, WALLET_COINS, type Coins, type LedgerEntry, type Party } from '../../../data/party';
import hub from '../hub.module.css';
import styles from './party.module.css';

const signedCoins = (c: Coins) =>
  WALLET_COINS.filter(k => c[k] !== 0)
    .map(k => `${c[k] > 0 ? '+' : '−'}${Math.abs(c[k]).toLocaleString('en')} ${k.toUpperCase()}`)
    .join(', ');

function amountText(e: LedgerEntry): string {
  if (e.kind === 'xp') {
    if (typeof e.remainder === 'number') return `${e.remainder} XP left over`;
    return `${e.xp > 0 ? '+' : '−'}${Math.abs(e.xp).toLocaleString('en')} XP`;
  }
  if (e.remainder && typeof e.remainder === 'object') return `${formatPurse(e.remainder)} left in the pool`;
  return signedCoins(e.coins);
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The ledger, newest first, with filters for kind, who it concerns and source. */
export function LedgerList({
  entries,
  party,
  characters,
}: {
  entries: LedgerEntry[];
  party: Party;
  characters: CharacterSummary[];
}) {
  const id = useId();
  const [kind, setKind] = useState<'all' | 'xp' | 'coin'>('all');
  const [who, setWho] = useState('all');
  const [source, setSource] = useState('all');
  const names = new Map(characters.map(c => [c.id, c.name]));
  const nameOf = (e: LedgerEntry) =>
    e.targetType === 'party' ? party.name : (names.get(e.targetId) ?? 'A character no longer here');
  const shown = entries.filter(
    e =>
      (kind === 'all' || e.kind === kind) &&
      (who === 'all' || (who === 'party' ? e.targetType === 'party' : e.targetId === who)) &&
      (source === 'all' || e.source === source),
  );

  return (
    <>
      <div className={styles.fields} role="group" aria-label="Filter the ledger">
        <div className={styles.field}>
          <label htmlFor={`${id}-kind`} className={styles.label}>
            Kind
          </label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={e => setKind(e.target.value as typeof kind)}
            className={styles.select}
          >
            <option value="all">XP and coins</option>
            <option value="xp">XP</option>
            <option value="coin">Coins</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-who`} className={styles.label}>
            Who
          </label>
          <select id={`${id}-who`} value={who} onChange={e => setWho(e.target.value)} className={styles.select}>
            <option value="all">Everyone</option>
            <option value="party">{party.name}</option>
            {characters.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-source`} className={styles.label}>
            Source
          </label>
          <select
            id={`${id}-source`}
            value={source}
            onChange={e => setSource(e.target.value)}
            className={styles.select}
          >
            <option value="all">Any source</option>
            {LEDGER_SOURCES.map(s => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className={hub.muted}>{entries.length === 0 ? 'Nothing recorded yet.' : 'No entries match.'}</p>
      ) : (
        <ol className={styles.ledger} aria-label="Ledger entries">
          {shown.map(e => (
            <li key={e.id} className={styles.entry}>
              <time dateTime={e.createdAt} className={styles.when}>
                {when(e.createdAt)}
              </time>
              <span className={styles.who}>{nameOf(e)}</span>
              <b>{amountText(e)}</b>
              <span className={styles.source}>{e.source}</span>
              {e.note && <span className={styles.note}>{e.note}</span>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
