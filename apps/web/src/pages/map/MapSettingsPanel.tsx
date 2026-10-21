import { Save, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Paper } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { CampaignMap, MapTools } from '../../data/maps';
import { useSetMapTools } from '../../hooks/useMapView';
import styles from './MapView.module.css';

const UNIT_WORD = { mi: 'miles', ft: 'feet' } as const;

/** DM only: the map's scale, which way is north, and the grid. */
export function MapSettingsPanel({ map, onClose }: { map: CampaignMap; onClose: () => void }) {
  const id = useId();
  const save = useSetMapTools();
  const [draft, setDraft] = useState({
    scaleWidth: map.tools.scaleWidth === null ? '' : String(map.tools.scaleWidth),
    scaleUnit: map.tools.scaleUnit,
    northDegrees: String(map.tools.northDegrees),
    gridSize: map.tools.gridSize === null ? '' : String(map.tools.gridSize),
  });
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
    setSaved(false);
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const tools: MapTools = {
      scaleWidth: draft.scaleWidth.trim() === '' ? null : Number(draft.scaleWidth),
      scaleUnit: draft.scaleUnit,
      northDegrees: Number(draft.northDegrees),
      gridSize: draft.gridSize.trim() === '' ? null : Number(draft.gridSize),
    };
    save.mutate({ mapId: map.id, tools }, { onSuccess: () => setSaved(true) });
  }

  return (
    <Paper as="aside" texture="flat" aria-label="Map settings" className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Map settings</h2>
        <Button variant="ghost" aria-label="Close map settings" onClick={onClose} className={styles.close}>
          <X {...ICON_PROPS} />
        </Button>
      </header>
      <form onSubmit={onSubmit} className={styles.form} aria-label="Map settings" noValidate>
        <fieldset className={styles.position}>
          <legend>Scale: how far the map's full width spans</legend>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor={`${id}-width`}>Map width</label>
              <Input
                id={`${id}-width`}
                type="number"
                min={0}
                placeholder="e.g. 600"
                value={draft.scaleWidth}
                onChange={e => set('scaleWidth', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-unit`}>Unit</label>
              <select
                id={`${id}-unit`}
                value={draft.scaleUnit}
                onChange={e => set('scaleUnit', e.target.value as MapTools['scaleUnit'])}
                className={styles.select}
              >
                <option value="mi">Miles (regions, travel)</option>
                <option value="ft">Feet (battle maps, buildings)</option>
              </select>
            </div>
          </div>
        </fieldset>

        <label htmlFor={`${id}-north`}>{`North: ${draft.northDegrees}° clockwise from the top`}</label>
        <input
          id={`${id}-north`}
          type="range"
          min={0}
          max={359}
          step={1}
          value={draft.northDegrees}
          onChange={e => set('northDegrees', e.target.value)}
        />

        <label htmlFor={`${id}-grid`}>{`Grid square size in ${UNIT_WORD[draft.scaleUnit]} (empty: no grid)`}</label>
        <Input
          id={`${id}-grid`}
          type="number"
          min={0}
          placeholder={draft.scaleUnit === 'ft' ? 'e.g. 5' : 'e.g. 6'}
          value={draft.gridSize}
          onChange={e => set('gridSize', e.target.value)}
        />
        <p className={styles.hint}>The grid needs a scale. On a battle map, 5-foot squares match the rules.</p>

        {save.isError && (
          <p role="alert" className={styles.error}>
            {friendlyMessage(save.error)}
          </p>
        )}
        {saved && (
          <p role="status" className={styles.saved}>
            Saved
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" className={iconClasses.host} disabled={save.isPending}>
            <Save {...ICON_PROPS} className={iconClasses.icon} />
            {save.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>
    </Paper>
  );
}
