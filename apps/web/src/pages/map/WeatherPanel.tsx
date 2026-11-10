// P3-8: the DM's weather for this map: today in each zone (its own, or the one it inherits), the week ahead, overrides
// and history. Also where a newly drawn zone is named.
import {
  CLIMATES,
  dmNotes,
  TEMPERATURE_BANDS,
  WEATHER_CONDITIONS,
  weatherForMap,
  WIND_LEVELS,
  type CalendarDefinition,
  type Climate,
  type TemperatureBand,
  type WeatherCondition,
  type WindLevel,
} from '@dnd-manager/rules-engine';
import { Trash2, X } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { GameDatePicker } from '../../components/GameDatePicker';
import { Button, ICON_PROPS, iconClasses, Input, Paper, Tag } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { CampaignMap } from '../../data/maps';
import { DEFAULT_PIN_COLOR, PIN_COLOR_PATTERN } from '../../data/pins';
import { todayOf, weatherOfDay, type WeatherDayRow, type WeatherZone } from '../../data/weather';
import { useCampaign } from '../../hooks/useCampaigns';
import { useCalendar } from '../../hooks/useCalendar';
import { useAllMaps } from '../../hooks/useMapView';
import {
  useClearWeatherOverride,
  useCreateWeatherZone,
  useDeleteWeatherZone,
  useLinkPoints,
  useSaveWeatherOverride,
  useUpdateWeatherZone,
  useWeatherDays,
  useWeatherZones,
} from '../../hooks/useWeather';
import { dayLabel } from '../../lib/gameClock';
import { CLIMATE_LABELS, CONDITION_LABELS, titled, TREND_TEXT, weatherLine } from '../../lib/weatherText';
import type { RegionCircle } from './MapCanvas';
import styles from './WeatherPanel.module.css';

const PREVIEW_DAYS = 7;

function NewZone({
  campaignId,
  mapId,
  circle,
  onDone,
}: {
  campaignId: string;
  mapId: string;
  circle: RegionCircle;
  onDone: () => void;
}) {
  const id = useId();
  const create = useCreateWeatherZone(campaignId);
  const [name, setName] = useState('');
  const [climate, setClimate] = useState<Climate>('temperate');
  const [color, setColor] = useState(DEFAULT_PIN_COLOR.toLowerCase());

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        campaignId,
        mapId,
        name,
        x: circle.cx,
        y: circle.cy,
        radius: circle.radius,
        climate,
        color: PIN_COLOR_PATTERN.test(color) ? color : DEFAULT_PIN_COLOR.toLowerCase(),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form className={styles.form} aria-label="New weather zone" onSubmit={submit}>
      <h4>New weather zone</h4>
      <div className={styles.field}>
        <label htmlFor={`${id}-name`}>Name</label>
        <Input id={`${id}-name`} maxLength={120} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-climate`}>Climate</label>
        <select
          id={`${id}-climate`}
          className={styles.select}
          value={climate}
          onChange={e => setClimate(e.target.value as Climate)}
        >
          {CLIMATES.map(c => (
            <option key={c} value={c}>
              {CLIMATE_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-color`}>Colour</label>
        <input id={`${id}-color`} type="color" value={color} onChange={e => setColor(e.target.value)} />
      </div>
      <div className={styles.actions}>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending ? 'Saving…' : 'Save zone'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {create.isError && (
        <p role="alert" className={styles.problem}>
          {friendlyMessage(create.error)}
        </p>
      )}
    </form>
  );
}

function OverrideForm({
  zone,
  day,
  calendar,
  rows,
  onDone,
}: {
  zone: WeatherZone;
  day: number;
  calendar: CalendarDefinition | null;
  rows: readonly WeatherDayRow[];
  onDone: () => void;
}) {
  const id = useId();
  const shown = weatherOfDay(zone, day, calendar, rows);
  const save = useSaveWeatherOverride(zone.campaignId);
  const [target, setTarget] = useState<number | null>(day);
  const [condition, setCondition] = useState<WeatherCondition>(shown.condition);
  const [temperature, setTemperature] = useState<TemperatureBand>(shown.temperature);
  const [wind, setWind] = useState<WindLevel>(shown.wind);
  const [note, setNote] = useState(shown.note);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (target === null) return;
    save.mutate({ zoneId: zone.id, day: target, condition, temperature, wind, note }, { onSuccess: onDone });
  }

  return (
    <form className={styles.form} aria-label={`Override the weather in ${zone.name}`} onSubmit={submit}>
      <GameDatePicker legend="Day" calendar={calendar} value={target} onChange={setTarget} />
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor={`${id}-condition`}>Condition</label>
          <select
            id={`${id}-condition`}
            className={styles.select}
            value={condition}
            onChange={e => setCondition(e.target.value as WeatherCondition)}
          >
            {WEATHER_CONDITIONS.map(c => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-temperature`}>Temperature</label>
          <select
            id={`${id}-temperature`}
            className={styles.select}
            value={temperature}
            onChange={e => setTemperature(e.target.value as TemperatureBand)}
          >
            {TEMPERATURE_BANDS.map(t => (
              <option key={t} value={t}>
                {titled(t)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-wind`}>Wind</label>
          <select
            id={`${id}-wind`}
            className={styles.select}
            value={wind}
            onChange={e => setWind(e.target.value as WindLevel)}
          >
            {WIND_LEVELS.map(w => (
              <option key={w} value={w}>
                {titled(w)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-note`}>Note for players</label>
        <Input id={`${id}-note`} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <div className={styles.actions}>
        <Button type="submit" disabled={target === null || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save override'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {save.isError && (
        <p role="alert" className={styles.problem}>
          {friendlyMessage(save.error)}
        </p>
      )}
    </form>
  );
}

function ZoneCard({
  zone,
  inherited,
  today,
  calendar,
  rows,
}: {
  zone: WeatherZone;
  inherited: boolean;
  today: number;
  calendar: CalendarDefinition | null;
  rows: readonly WeatherDayRow[];
}) {
  const update = useUpdateWeatherZone(zone.campaignId);
  const remove = useDeleteWeatherZone(zone.campaignId);
  const clear = useClearWeatherOverride(zone.campaignId);
  const [overriding, setOverriding] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const now = weatherOfDay(zone, today, calendar, rows);
  const notes = dmNotes(now);
  const history = rows.filter(r => r.zoneId === zone.id && r.day <= today);
  const trend = TREND_TEXT[now.trend];
  const days = Array.from({ length: PREVIEW_DAYS }, (_, i) => today + 1 + i);
  const isFixed = (day: number) => rows.some(r => r.zoneId === zone.id && r.day === day && r.overridden);

  return (
    <section aria-label={zone.name} className={styles.zone}>
      <h4>{zone.name}</h4>
      <p className={styles.tags}>
        <Tag>{CLIMATE_LABELS[zone.climate].toUpperCase()}</Tag>
        {inherited && <Tag>INHERITED</Tag>}
        {now.overridden && <Tag>OVERRIDDEN</Tag>}
      </p>
      <p className={styles.today}>{`Today: ${weatherLine(now)}`}</p>
      {trend && <p className={styles.trend}>{trend}</p>}
      {notes.length > 0 && (
        <ul className={styles.notes} aria-label="Ideas for the table">
          {notes.map(n => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => setOverriding(today)}>
          Override today
        </Button>
        {isFixed(today) && (
          <Button variant="ghost" onClick={() => clear.mutate({ zoneId: zone.id, day: today })}>
            Clear override
          </Button>
        )}
      </div>
      {overriding !== null && (
        <OverrideForm
          key={overriding}
          zone={zone}
          day={overriding}
          calendar={calendar}
          rows={rows}
          onDone={() => setOverriding(null)}
        />
      )}

      <h5>The week ahead</h5>
      <ul className={styles.days}>
        {days.map(day => (
          <li key={day}>
            <span className={styles.date}>{dayLabel(calendar, day)}</span>
            <span>{weatherLine(weatherOfDay(zone, day, calendar, rows))}</span>
            <Button
              variant="ghost"
              aria-label={`Override ${dayLabel(calendar, day)}`}
              onClick={() => setOverriding(day)}
            >
              Override
            </Button>
          </li>
        ))}
      </ul>

      {history.length > 0 && (
        <>
          <h5>History</h5>
          <ul className={styles.days}>
            {history.map(r => (
              <li key={r.day}>
                <span className={styles.date}>{dayLabel(calendar, r.day)}</span>
                <span>{weatherLine(r)}</span>
                {r.overridden && <Tag>OVERRIDDEN</Tag>}
              </li>
            ))}
          </ul>
        </>
      )}

      {!inherited && (
        <div className={styles.manage}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={zone.showBorder}
              onChange={e => update.mutate({ id: zone.id, changes: { showBorder: e.target.checked } })}
            />{' '}
            Show zone borders to players
          </label>
          <Button
            variant="ghost"
            className={iconClasses.host}
            disabled={remove.isPending}
            onClick={() => (asking ? remove.mutate(zone) : setAsking(true))}
          >
            <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
            {asking ? 'Yes, delete this zone' : 'Delete zone'}
          </Button>
        </div>
      )}
      {(update.isError || remove.isError || clear.isError) && (
        <p role="alert" className={styles.problem}>
          {friendlyMessage(update.error ?? remove.error ?? clear.error)}
        </p>
      )}
    </section>
  );
}

interface Props {
  campaignId: string;
  map: CampaignMap;
  /** A circle just drawn on the map, waiting for its name. */
  draft: RegionCircle | null;
  onDraftDone: () => void;
  onClose: () => void;
}

export function WeatherPanel({ campaignId, map, draft, onDraftDone, onClose }: Props) {
  const campaign = useCampaign(campaignId);
  const calendar = useCalendar(campaignId);
  const zones = useWeatherZones(campaignId);
  const maps = useAllMaps(campaignId, true);
  const links = useLinkPoints(campaignId, true);
  const all = useMemo(() => zones.data ?? [], [zones.data]);
  const own = all.filter(z => z.mapId === map.id);
  const today = todayOf(campaign.data?.gameSeconds ?? 0);
  const cal = calendar.data ?? null;

  const zonesByMap = useMemo(() => {
    const byMap: Record<string, WeatherZone[]> = {};
    for (const z of all) (byMap[z.mapId] ??= []).push(z);
    return byMap;
  }, [all]);
  // a map with no zones of its own takes the weather of the place above it
  const hasOwn = own.length > 0;
  const fromAbove = useMemo(() => {
    if (hasOwn || !maps.data || !links.data) return null;
    const points = links.data;
    const byId = Object.fromEntries(
      maps.data.map(m => [m.id, { ...m, parentMapId: points[m.parentPinId ?? m.parentRegionId ?? '']?.mapId ?? null }]),
    );
    return byId[map.id] ? weatherForMap(byId[map.id], byId, zonesByMap, points) : null;
  }, [hasOwn, maps.data, links.data, map.id, zonesByMap]);

  const shownZones = fromAbove ? [fromAbove] : own;
  const days = useWeatherDays(
    campaignId,
    shownZones.map(z => z.id),
  );
  const rows = days.data ?? [];

  return (
    <Paper as="aside" texture="flat" aria-label="Weather" className={styles.panel}>
      <div className={styles.head}>
        <h3>Weather</h3>
        <Button variant="ghost" aria-label="Close the weather panel" onClick={onClose}>
          <X {...ICON_PROPS} />
        </Button>
      </div>
      {draft && <NewZone campaignId={campaignId} mapId={map.id} circle={draft} onDone={onDraftDone} />}
      {(zones.isError || links.isError) && <p role="alert">{friendlyMessage(zones.error ?? links.error)}</p>}
      {zones.isSuccess && shownZones.length === 0 && !draft && (
        <p className={styles.hint}>No weather here yet. Draw a weather zone on this map, or on the map above it.</p>
      )}
      {shownZones.map(z => (
        <ZoneCard key={z.id} zone={z} inherited={z.mapId !== map.id} today={today} calendar={cal} rows={rows} />
      ))}
      <p className={styles.hint}>Weather builds and clears over several days. Ideas here are only suggestions.</p>
    </Paper>
  );
}
