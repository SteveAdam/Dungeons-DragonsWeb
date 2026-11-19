// P4-6: what an NPC has said to the viewer's group, from the session log. A player reads only the lines their group
// heard (the database decides); lines the DM never said, or did not log, are not there.
import { useDialogueLog } from '../../../hooks/useDialogue';
import styles from './codex.module.css';

export function HeardFrom({ campaignId, npcId, npcName }: { campaignId: string; npcId: string; npcName: string }) {
  const log = useDialogueLog(campaignId, npcId);
  if (!log.data || log.data.length === 0) return null;
  return (
    <section aria-label={`What ${npcName} said to you`} className={styles.relationships}>
      <h4 className={styles.subTitle}>{`What ${npcName} said`}</h4>
      <ul className={styles.linkList}>
        {log.data.map(e => (
          <li key={e.id}>
            {`“${e.text}”`}{' '}
            <span className={styles.muted}>
              {new Date(e.saidAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
