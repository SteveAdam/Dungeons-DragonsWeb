import { rulesEngineInfo } from '@dnd-manager/rules-engine';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/authContext';
import { Paper } from '../components/ui';
import styles from './HomePage.module.css';

export function HomePage() {
  const { session } = useAuth();
  const rules = rulesEngineInfo();

  return (
    <main className={styles.page}>
      <Paper as="section" variant="framed" aria-labelledby="home-title" className={styles.card}>
        <h1 id="home-title" className={styles.title}>
          DM Manager
        </h1>
        <p className={styles.lead}>Maps, pins and notes for your table. Players see only what the DM reveals.</p>
        <p className={styles.cta}>
          {session ? <Link to="/campaigns">Open your campaigns</Link> : <Link to="/login">Enter the hall</Link>}
        </p>
        <p className={styles.small}>{`Rules: D&D 5e, ${rules.editions.join(' and ')} editions.`}</p>
      </Paper>
    </main>
  );
}
