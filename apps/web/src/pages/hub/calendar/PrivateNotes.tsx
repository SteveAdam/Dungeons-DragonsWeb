// P4-5: a player's private notes: whispers the DM chose to keep for them. Only that player reads them (the DM who saved
// one cannot). Plain text; the player may remove any of them.
import { Trash2 } from 'lucide-react';
import { Button, ICON_PROPS } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import { useMyRole } from '../../../hooks/useMembers';
import { useDeletePrivateNote, usePrivateNotes } from '../../../hooks/useMessages';
import styles from './calendar.module.css';

export function PrivateNotes({ campaignId }: { campaignId: string }) {
  const role = useMyRole(campaignId);
  const isPlayer = role.data === 'player';
  const notes = usePrivateNotes(campaignId, isPlayer);
  const remove = useDeletePrivateNote(campaignId);
  if (!isPlayer || !notes.data || notes.data.length === 0) return null;

  return (
    <section aria-labelledby="private-notes" className={styles.privateNotes}>
      <h3 id="private-notes" className={styles.privateTitle}>
        Your private notes
      </h3>
      <p className={styles.privateHint}>Whispers the DM kept for you. Nobody else can read these.</p>
      {remove.isError && <p role="alert">{friendlyMessage(remove.error)}</p>}
      <ul className={styles.privateList}>
        {notes.data.map(n => (
          <li key={n.id} className={styles.privateNote}>
            <p className={styles.privateText}>{n.body}</p>
            <Button
              variant="ghost"
              aria-label="Remove this private note"
              disabled={remove.isPending}
              onClick={() => remove.mutate(n.id)}
            >
              <Trash2 {...ICON_PROPS} />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
