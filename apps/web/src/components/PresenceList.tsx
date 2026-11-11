import type { PresenceEntry, PresenceStatus } from '../lib/realtime';
import shell from '../App.module.css';
import styles from './LiveHeader.module.css';

const STATUS_TEXT: Record<PresenceStatus, string> = { active: 'Active', away: 'Away', 'in-scene': 'In scene' };

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('');

/** A round avatar. The dot's shape, as well as its colour, says the status. */
function Avatar({ person, label }: { person: PresenceEntry; label?: string }) {
  return (
    <span className={styles.avatar} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {initials(person.name)}
      <span className={styles.dot} data-status={person.status} />
    </span>
  );
}

/** Everyone at the table, with their status in words. */
export function PresenceList({ people }: { people: PresenceEntry[] }) {
  return (
    <ul className={styles.people} aria-label="At the table">
      {people.map(person => (
        <li key={person.userId} className={styles.person}>
          <Avatar person={person} />
          <span className={styles.name}>{person.name}</span>
          <span className={styles.status}>{STATUS_TEXT[person.status]}</span>
        </li>
      ))}
    </ul>
  );
}

/** The header's row of avatars; opening it shows the list. */
export function HeaderPresence({ people }: { people: PresenceEntry[] }) {
  if (people.length === 0) return null;
  return (
    <details className={shell.display}>
      <summary className={styles.avatars} aria-label={`${people.length} at the table`}>
        {people.map(person => (
          <Avatar key={person.userId} person={person} label={`${person.name}, ${STATUS_TEXT[person.status]}`} />
        ))}
      </summary>
      <div className={shell.displayMenu}>
        <PresenceList people={people} />
      </div>
    </details>
  );
}
