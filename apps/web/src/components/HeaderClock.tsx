import { Clock } from 'lucide-react';
import { useCalendar } from '../hooks/useCalendar';
import { useCampaign } from '../hooks/useCampaigns';
import { calendarClock } from '../lib/gameClock';
import styles from './LiveHeader.module.css';
import { ICON_PROPS } from './ui';

/** The game time, always in view while a campaign is open. Moving it stays with the full clock on the hub and sheet. */
export function HeaderClock({ campaignId }: { campaignId: string }) {
  const campaign = useCampaign(campaignId);
  const calendar = useCalendar(campaignId);
  if (!campaign.data) return null;
  return (
    <p className={styles.clock} aria-label="Game time">
      <Clock {...ICON_PROPS} />
      <time>{calendarClock(campaign.data.gameSeconds, calendar.data)}</time>
    </p>
  );
}
