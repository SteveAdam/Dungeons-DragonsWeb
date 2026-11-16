// P4-5: every player's Pause button and Anonymous X-card, in the header. One press, no questions asked: a safety tool
// must never be in the way. The X-card never says who played it, to the DM or anyone. A pause blocks nothing; it is
// a signal and a banner.
import { Hand, ShieldAlert } from 'lucide-react';
import { useMyRole } from '../../hooks/useMembers';
import { useRequestPause } from '../../hooks/useSafety';
import { friendlyMessage } from '../../data/errors';
import { useToasts } from '../../state/toasts';
import { ICON_PROPS, iconClasses } from '../ui';
import styles from './Safety.module.css';

export function SafetyControls({ campaignId }: { campaignId: string }) {
  const role = useMyRole(campaignId);
  const request = useRequestPause(campaignId);
  const push = useToasts(s => s.push);
  if (role.data !== 'player') return null;

  const ask = (anonymous: boolean) =>
    request.mutate(anonymous, {
      onSuccess: () =>
        push(anonymous ? 'X-card played. The DM is told, without your name.' : 'The DM has been asked for a pause.'),
      onError: e => push(friendlyMessage(e)),
    });

  return (
    <span role="group" aria-label="Table safety" className={styles.controls}>
      <button
        type="button"
        className={`${styles.headerButton} ${iconClasses.host}`}
        disabled={request.isPending}
        onClick={() => ask(false)}
      >
        <Hand {...ICON_PROPS} className={iconClasses.icon} />
        Pause
      </button>
      <button
        type="button"
        className={`${styles.headerButton} ${iconClasses.host}`}
        disabled={request.isPending}
        onClick={() => ask(true)}
      >
        <ShieldAlert {...ICON_PROPS} className={iconClasses.icon} />
        Anonymous X-card
      </button>
    </span>
  );
}
