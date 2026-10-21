import { ScrollText } from 'lucide-react';
import { ErrorNotice } from '../../components/ErrorNotice';
import { IconLink } from '../../components/ui';
import { useCharacters } from '../../hooks/useCharacters';
import styles from './hub.module.css';

/** The characters the viewer may see: their own, or every one for the DM. Each opens its sheet. */
export function CharactersTab({ campaignId }: { campaignId: string }) {
  const characters = useCharacters(campaignId);
  if (characters.isPending)
    return (
      <p role="status" className={styles.status}>
        Gathering the party…
      </p>
    );
  if (characters.isError) return <ErrorNotice error={characters.error} onRetry={() => characters.refetch()} />;
  if (characters.data.length === 0) return <p className={styles.status}>No characters yet.</p>;
  return (
    <ul className={styles.list}>
      {characters.data.map(c => (
        <li key={c.id} className={styles.row}>
          <IconLink to={`/campaigns/${campaignId}/characters/${c.id}`} icon={ScrollText}>
            {c.name}
          </IconLink>
        </li>
      ))}
    </ul>
  );
}
