// /dev/monsters (development builds only): browse the SRD monsters as imported into the database, so each stat block
// can be compared with the SRD's text.
import { useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Input, Paper } from '../../components/ui';
import { useSrdMonsters } from '../../hooks/useLibrary';
import { matchesSearch } from '../library/libraryFilters';
import { StatBlock } from '../library/StatBlock';
import styles from './SrdDevPage.module.css';

export default function MonstersDevPage() {
  const { session } = useAuth();
  const monsters = useSrdMonsters(!!session);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | null>(null);

  if (!session) {
    return (
      <main className={styles.page}>
        <p>Sign in to read the imported SRD monsters.</p>
      </main>
    );
  }
  if (monsters.isError) {
    return (
      <main className={styles.page}>
        <ErrorNotice error={monsters.error} onRetry={() => void monsters.refetch()} />
      </main>
    );
  }
  if (monsters.isPending) {
    return (
      <main className={styles.page}>
        <p role="status">Waking the bestiary…</p>
      </main>
    );
  }
  if (monsters.data.length === 0) {
    return (
      <main className={styles.page}>
        <p>No monsters imported yet: run pnpm srd:import.</p>
      </main>
    );
  }

  const shown = monsters.data.filter(m => matchesSearch(m.name, search));
  const monster = monsters.data.find(m => m.id === picked);
  return (
    <main className={styles.page}>
      <Paper texture="flat">
        <h1>{`SRD monsters (${monsters.data.length})`}</h1>
        <label htmlFor="monster-search">Search monsters</label>
        <Input id="monster-search" type="search" value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="monster-pick">Monster</label>
        <select id="monster-pick" value={picked ?? ''} onChange={e => setPicked(e.target.value || null)}>
          <option value="">Choose one</option>
          {shown.map(m => (
            <option key={m.id} value={m.id}>
              {`${m.name} (CR ${m.challengeRating})`}
            </option>
          ))}
        </select>
      </Paper>
      {monster && (
        <Paper texture="flat">
          <StatBlock monster={monster} />
        </Paper>
      )}
    </main>
  );
}
