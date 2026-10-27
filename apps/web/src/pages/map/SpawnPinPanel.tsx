import { SPAWN_PIN_KINDS, type SpawnPinKind } from '@dnd-manager/rules-engine';
import { Save, Trash2, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Paper, Tag } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { RegionContent } from '../../data/regionContent';
import type { Region } from '../../data/regions';
import type { SpawnPin } from '../../data/spawnPins';
import { useDeleteSpawnPin, useUpdateSpawnPin } from '../../hooks/useRegionContent';
import styles from './MapView.module.css';
import { SPAWN_PIN_LABELS } from './spawnIcons';

interface Props {
  pin: SpawnPin;
  mapId: string;
  /** The content of this map's regions, for the link. */
  content: readonly RegionContent[];
  regions: readonly Region[];
  onClose: () => void;
}

/** The DM's panel for a spawn pin (P3-2): label, kind, the region entry it stands for, delete. DM mode only. */
export function SpawnPinPanel({ pin, mapId, content, regions, onClose }: Props) {
  const id = useId();
  const update = useUpdateSpawnPin(mapId);
  const remove = useDeleteSpawnPin(mapId);
  const [draft, setDraft] = useState({ label: pin.label, kind: pin.kind, contentId: pin.contentId ?? '' });
  const [error, setError] = useState<string | null>(null);
  const regionName = (regionId: string) => regions.find(r => r.id === regionId)?.name ?? 'Region';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    update.mutate(
      { id: pin.id, changes: { label: draft.label, kind: draft.kind, contentId: draft.contentId || null } },
      { onError: err => setError(friendlyMessage(err)) },
    );
  }

  return (
    <Paper
      as="aside"
      texture="flat"
      aria-label={`Spawn pin: ${pin.label || SPAWN_PIN_LABELS[pin.kind]}`}
      className={styles.panel}
    >
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{pin.label || SPAWN_PIN_LABELS[pin.kind]}</h2>
        <Tag>DM only</Tag>
        <Button variant="ghost" aria-label="Close the spawn pin panel" onClick={onClose} className={styles.close}>
          <X {...ICON_PROPS} />
        </Button>
      </header>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={`${id}-label`}>Label</label>
            <Input
              id={`${id}-label`}
              value={draft.label}
              maxLength={120}
              onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-kind`}>Kind</label>
            <select
              id={`${id}-kind`}
              className={styles.select}
              value={draft.kind}
              onChange={e => setDraft(d => ({ ...d, kind: e.target.value as SpawnPinKind }))}
            >
              {SPAWN_PIN_KINDS.map(k => (
                <option key={k} value={k}>
                  {SPAWN_PIN_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label htmlFor={`${id}-content`}>Region entry</label>
        <select
          id={`${id}-content`}
          className={styles.select}
          value={draft.contentId}
          onChange={e => setDraft(d => ({ ...d, contentId: e.target.value }))}
        >
          <option value="">None</option>
          {content.map(c => (
            <option key={c.id} value={c.id}>
              {`${c.name} (${regionName(c.regionId)})`}
            </option>
          ))}
        </select>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" className={iconClasses.host} disabled={update.isPending}>
            <Save {...ICON_PROPS} className={iconClasses.icon} />
            {update.isPending ? 'Saving…' : 'Save spawn pin'}
          </Button>
          <Button
            variant="ghost"
            className={iconClasses.host}
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(pin.id, { onSuccess: onClose, onError: err => setError(friendlyMessage(err)) })
            }
          >
            <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
            Delete spawn pin
          </Button>
        </div>
      </form>
    </Paper>
  );
}
