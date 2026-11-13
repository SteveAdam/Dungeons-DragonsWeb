// P4-2: when the DM puts one group in the spotlight, everyone else is told where it is and, if the DM wrote one, what it
// is doing. The group itself is not told (it is the one with the spotlight). Shown on every screen of the campaign.
import { useMyRole } from '../hooks/useMembers';
import { useSpotlight } from '../hooks/useGroupMap';
import styles from './SpotlightBanner.module.css';
import { GameIcon } from './ui';

export function SpotlightBanner({ campaignId }: { campaignId: string }) {
  const role = useMyRole(campaignId);
  const spotlight = useSpotlight(campaignId, !!role.data);
  const s = spotlight.data;
  if (!s || s.mine) return null;
  return (
    <p role="status" className={styles.banner}>
      <GameIcon name="torch" />
      <span>
        <strong>{`${s.groupName} is in ${s.place}`}</strong>
        {s.summary && <span>{`: ${s.summary}`}</span>}
      </span>
    </p>
  );
}
