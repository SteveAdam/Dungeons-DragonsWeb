// P3-8: "Today's weather" for where a character's group is, in the Here tab and on the hub.
import { useCampaign } from '../hooks/useCampaigns';
import { useCalendar } from '../hooks/useCalendar';
import { useWeatherHere } from '../hooks/useWeather';
import { dayLabel } from '../lib/gameClock';
import { CONDITION_ICONS, CONDITION_LABELS, titled, TREND_TEXT } from '../lib/weatherText';
import styles from './WeatherCard.module.css';
import { ICON_PROPS, Paper } from './ui';
import { absoluteDayFromSeconds } from '@dnd-manager/rules-engine';

export function WeatherCard({ campaignId, characterId }: { campaignId: string; characterId: string | undefined }) {
  const campaign = useCampaign(campaignId);
  const calendar = useCalendar(campaignId);
  const day = absoluteDayFromSeconds(campaign.data?.gameSeconds ?? 0);
  const weather = useWeatherHere(campaignId, campaign.data ? characterId : undefined, day);
  if (!weather.data) return null;
  const w = weather.data;
  const Icon = CONDITION_ICONS[w.condition];
  const trend = TREND_TEXT[w.trend];
  return (
    <Paper as="section" texture="flat" aria-label="Today's weather" className={styles.card}>
      <Icon {...ICON_PROPS} size="2.5rem" className={styles.icon} />
      <div className={styles.text}>
        <h3 className={styles.title}>{`Today's weather: ${CONDITION_LABELS[w.condition]}`}</h3>
        <p>{`${titled(w.temperature)}, wind ${w.wind}. ${dayLabel(calendar.data ?? null, w.day)}`}</p>
        {trend && <p className={styles.trend}>{trend}</p>}
        {w.note && <p>{w.note}</p>}
      </div>
    </Paper>
  );
}
