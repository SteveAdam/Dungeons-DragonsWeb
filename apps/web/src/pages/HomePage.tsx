import { rulesEngineInfo } from '@dnd-manager/rules-engine';
import { DoorOpen, Swords } from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { IconLink, Paper } from '../components/ui';
import styles from './HomePage.module.css';

export function HomePage() {
  const { session } = useAuth();
  const rules = rulesEngineInfo();

  return (
    <main className={styles.page}>
      <Paper as="section" variant="framed" aria-labelledby="home-title" className={styles.card}>
        <h1 id="home-title" className={styles.title}>
          Dungeons &amp; Dragons Manager.
        </h1>
        <p className={styles.lead}>Maps, pins and notes for your table. Players see only what the DM reveals.</p>
        <p className={styles.cta}>
          {session ? (
            <IconLink to="/campaigns" icon={Swords}>
              Open your campaigns
            </IconLink>
          ) : (
            <IconLink to="/login" icon={DoorOpen}>
              Enter the hall
            </IconLink>
          )}
        </p>
        <p className={styles.small}>{`Rules: D&D 5e, ${rules.editions.join(' and ')} editions.`}</p>
      </Paper>
    </main>
  );
}
