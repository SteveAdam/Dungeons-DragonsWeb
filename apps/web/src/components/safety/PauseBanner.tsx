// P4-5: while the table is paused, everyone sees it. The DM is told who asked (unless it was an anonymous X-card) and
// has the Resume button. Shown on every screen of the campaign.
import { friendlyMessage } from '../../data/errors';
import { useMyRole } from '../../hooks/useMembers';
import { useResumeTable, useTablePause } from '../../hooks/useSafety';
import { Button } from '../ui';
import styles from './Safety.module.css';

export function PauseBanner({ campaignId }: { campaignId: string }) {
  const role = useMyRole(campaignId);
  const pause = useTablePause(campaignId, !!role.data);
  const resume = useResumeTable(campaignId);
  const p = pause.data;
  if (!p?.paused) return null;
  const isDm = role.data === 'dm';
  const since = p.since
    ? new Date(p.since).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;
  const words = !isDm
    ? 'The table is paused'
    : p.anonymous
      ? 'Pause requested: an anonymous X-card'
      : `Pause requested by ${p.name ?? 'a player'}`;

  return (
    <div role="alert" className={styles.banner}>
      <strong className={styles.message}>{words}</strong>
      {since && <span className={styles.since}>{`since ${since}`}</span>}
      {isDm && (
        <>
          {resume.isError && <span>{friendlyMessage(resume.error)}</span>}
          <Button disabled={resume.isPending} onClick={() => resume.mutate()}>
            {resume.isPending ? 'Resuming…' : 'Resume'}
          </Button>
        </>
      )}
    </div>
  );
}
