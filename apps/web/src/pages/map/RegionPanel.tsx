import {
  milesPerDay,
  rollWeather,
  TERRAIN_INFO,
  TERRAINS,
  WEATHER_INFO,
  WEATHERS,
  type Terrain,
  type Weather,
} from '@dnd-manager/rules-engine';
import { Dices, Footprints, Save, Trash2, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Paper, Tag, Toggle } from '../../components/ui';
import { DataError, friendlyMessage } from '../../data/errors';
import { MIN_REGION_RADIUS, validateRegionChanges, type Region, type RegionChanges } from '../../data/regions';
import { useDeleteRegion, useUpdateRegion } from '../../hooks/useRegions';
import type { ImageSize } from '../../lib/mapCoordinates';
import styles from './MapView.module.css';
import { TERRAIN_ICONS, WEATHER_ICONS } from './regionIcons';

interface Props {
  region: Region;
  mapId: string;
  mapSize: ImageSize;
  /** DM with DM mode on: the editor. Otherwise a read-only view. */
  canEdit: boolean;
  onClose: () => void;
}

const SEVERITY_LABELS = { calm: 'Calm', harsh: 'Harsh', hazard: 'Hazard' } as const;

/** What this terrain and weather mean at the table: travel, the land, and the weather's game effects. */
function Conditions({ terrain, weather }: { terrain: Terrain; weather: Weather }) {
  const land = TERRAIN_INFO[terrain];
  const sky = WEATHER_INFO[weather];
  const TerrainIcon = TERRAIN_ICONS[terrain];
  const WeatherIcon = WEATHER_ICONS[weather];
  return (
    <section aria-label="Conditions" className={styles.conditions}>
      <p className={styles.type}>
        <TerrainIcon {...ICON_PROPS} />
        {land.label}
      </p>
      <p className={styles.prose}>{land.note}</p>
      <p className={styles.travel}>
        <Footprints {...ICON_PROPS} />
        {`Travel: ${milesPerDay(terrain)} miles a day at a normal pace${land.difficult ? ' (difficult terrain)' : ''}`}
      </p>
      <p className={styles.type}>
        <WeatherIcon {...ICON_PROPS} />
        {sky.label}
        <Tag>{SEVERITY_LABELS[sky.severity]}</Tag>
      </p>
      {sky.effects.length > 0 ? (
        <ul className={styles.effects}>
          {sky.effects.map(e => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : (
        <p className={styles.prose}>No game effect.</p>
      )}
    </section>
  );
}

function RegionEditor({ region, mapId, mapSize, onClose }: Omit<Props, 'canEdit'>) {
  const id = useId();
  const update = useUpdateRegion(mapId);
  const remove = useDeleteRegion(mapId);
  const [draft, setDraft] = useState({
    name: region.name,
    terrain: region.terrain,
    weather: region.weather,
    description: region.description,
    visibleToPlayers: region.visibleToPlayers,
  });
  // null until typed in, so a circle moved on the map shows its new place here instead of a stale copy
  const [shape, setShape] = useState<{ cx: string; cy: string; radius: string } | null>(null);
  const shownShape = shape ?? {
    cx: String(Math.round(region.cx)),
    cy: String(Math.round(region.cy)),
    radius: String(Math.round(region.radius)),
  };
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const setShapeField = (key: 'cx' | 'cy' | 'radius', value: string) => {
    setShape({ ...shownShape, [key]: value });
    setSaved(false);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let changes: RegionChanges;
    try {
      const circle = shape ? { cx: Number(shape.cx), cy: Number(shape.cy), radius: Number(shape.radius) } : undefined;
      if (circle && !(circle.cx >= 0 && circle.cx <= mapSize.width && circle.cy >= 0 && circle.cy <= mapSize.height)) {
        throw new DataError(
          'validation',
          `The centre must be on the map: X from 0 to ${mapSize.width}, Y from 0 to ${mapSize.height}.`,
        );
      }
      changes = validateRegionChanges({ ...circle, ...draft });
    } catch (validationError) {
      setError(friendlyMessage(validationError));
      return;
    }
    try {
      await update.mutateAsync({ regionId: region.id, changes });
      setShape(null);
      setSaved(true);
    } catch (saveError) {
      setError(friendlyMessage(saveError));
    }
  }

  return (
    // noValidate: every field is checked in onSubmit, with messages in the app's own words
    <form onSubmit={onSubmit} className={styles.form} aria-label="Edit region" noValidate>
      <label htmlFor={`${id}-name`}>Name</label>
      <Input id={`${id}-name`} value={draft.name} maxLength={120} onChange={e => set('name', e.target.value)} />

      <label htmlFor={`${id}-terrain`}>Terrain</label>
      <select
        id={`${id}-terrain`}
        value={draft.terrain}
        onChange={e => set('terrain', e.target.value as Terrain)}
        className={styles.select}
      >
        {TERRAINS.map(t => (
          <option key={t} value={t}>
            {TERRAIN_INFO[t].label}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-weather`}>Weather today</label>
      <span className={styles.colorRow}>
        <select
          id={`${id}-weather`}
          value={draft.weather}
          onChange={e => set('weather', e.target.value as Weather)}
          className={styles.select}
        >
          {WEATHERS.map(w => (
            <option key={w} value={w}>
              {WEATHER_INFO[w].label}
            </option>
          ))}
        </select>
        <Button variant="ghost" className={iconClasses.host} onClick={() => set('weather', rollWeather(draft.terrain))}>
          <Dices {...ICON_PROPS} className={iconClasses.icon} />
          Roll weather
        </Button>
      </span>

      <Conditions terrain={draft.terrain} weather={draft.weather} />

      <fieldset className={styles.position}>
        <legend>Circle in pixels (or drag its middle and its edge on the map)</legend>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={`${id}-cx`}>{`Centre X (0–${mapSize.width})`}</label>
            <Input
              id={`${id}-cx`}
              type="number"
              value={shownShape.cx}
              onChange={e => setShapeField('cx', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-cy`}>{`Centre Y (0–${mapSize.height})`}</label>
            <Input
              id={`${id}-cy`}
              type="number"
              value={shownShape.cy}
              onChange={e => setShapeField('cy', e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-radius`}>{`Radius (${MIN_REGION_RADIUS} or more)`}</label>
            <Input
              id={`${id}-radius`}
              type="number"
              value={shownShape.radius}
              onChange={e => setShapeField('radius', e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      <Toggle checked={draft.visibleToPlayers} onChange={v => set('visibleToPlayers', v)} label="Visible to players" />

      <label htmlFor={`${id}-description`}>Description</label>
      <textarea
        id={`${id}-description`}
        rows={3}
        value={draft.description}
        onChange={e => set('description', e.target.value)}
        className={styles.textarea}
      />

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className={styles.saved}>
          Saved
        </p>
      )}

      <div className={styles.actions}>
        <Button type="submit" className={iconClasses.host} disabled={update.isPending}>
          <Save {...ICON_PROPS} className={iconClasses.icon} />
          {update.isPending ? 'Saving…' : 'Save region'}
        </Button>
        {confirmDelete ? (
          <span className={styles.confirm}>
            <span>Delete this region?</span>
            <Button
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(region.id, {
                  onSuccess: onClose,
                  onError: err => {
                    setError(friendlyMessage(err));
                    setConfirmDelete(false);
                  },
                })
              }
            >
              {remove.isPending ? 'Deleting…' : 'Yes, delete'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button variant="ghost" className={iconClasses.host} onClick={() => setConfirmDelete(true)}>
            <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
            Delete region
          </Button>
        )}
      </div>
    </form>
  );
}

/** The right-hand panel (a bottom sheet on phones) for the selected region. */
export function RegionPanel({ region, mapId, mapSize, canEdit, onClose }: Props) {
  return (
    <Paper as="aside" texture="flat" aria-label={`Region: ${region.name}`} className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{region.name}</h2>
        {!region.visibleToPlayers && <Tag>Hidden from players</Tag>}
        <Button variant="ghost" aria-label="Close the region panel" onClick={onClose} className={styles.close}>
          <X {...ICON_PROPS} />
        </Button>
      </header>
      {/* key: a different region starts a fresh form */}
      {canEdit ? (
        <RegionEditor key={region.id} region={region} mapId={mapId} mapSize={mapSize} onClose={onClose} />
      ) : (
        <div className={styles.view}>
          <Conditions terrain={region.terrain} weather={region.weather} />
          {region.description && <p className={styles.prose}>{region.description}</p>}
        </div>
      )}
    </Paper>
  );
}
