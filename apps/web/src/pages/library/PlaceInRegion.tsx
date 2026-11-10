// P3-5: puts a library monster into a region, through the region entry form (P3-2) already filled in with it. The
// first region is already chosen, so one click on "Place in a region" brings up a form ready to save.
import type { SrdMonster } from '@dnd-manager/srd-data/schemas';
import { useId, useState } from 'react';
import { ErrorNotice } from '../../components/ErrorNotice';
import type { CampaignRegion } from '../../data/regions';
import { useCampaignRegions } from '../../hooks/useRegions';
import { ContentForm } from '../map/content/ContentForm';
import mapStyles from '../map/MapView.module.css';
import styles from './Library.module.css';

interface Props {
  campaignId: string;
  monster: SrdMonster;
  onClose: () => void;
  onPlaced: (message: string) => void;
}

function byMap(regions: CampaignRegion[]) {
  const maps = new Map<string, CampaignRegion[]>();
  for (const r of regions) maps.set(r.mapName, [...(maps.get(r.mapName) ?? []), r]);
  return [...maps];
}

export function PlaceInRegion({ campaignId, monster, onClose, onPlaced }: Props) {
  const id = useId();
  const regions = useCampaignRegions(campaignId);
  const [picked, setPicked] = useState('');

  if (regions.isPending) return <p role="status">Reading the regions…</p>;
  if (regions.isError) return <ErrorNotice error={regions.error} onRetry={() => void regions.refetch()} />;
  const region = regions.data.find(r => r.id === picked) ?? regions.data[0];
  if (!region) {
    return (
      <p className={styles.note}>
        This campaign has no regions yet. Draw one on a map first.
        <button type="button" className={styles.linkButton} onClick={onClose}>
          Close
        </button>
      </p>
    );
  }

  return (
    <section aria-label={`Place ${monster.name} in a region`} className={styles.placing}>
      <div className={mapStyles.field}>
        <label htmlFor={`${id}-region`}>Region</label>
        <select
          id={`${id}-region`}
          className={mapStyles.select}
          value={region.id}
          onChange={e => setPicked(e.target.value)}
        >
          {byMap(regions.data).map(([mapName, inMap]) => (
            <optgroup key={mapName} label={mapName}>
              {inMap.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <ContentForm
        key={region.id}
        regionId={region.id}
        campaignId={campaignId}
        kind="creature"
        kinds={['creature']}
        initial={{ name: monster.name, monsterRef: `srd:${monster.id}` }}
        onDone={() => onPlaced(`${monster.name} now lives in ${region.name}.`)}
        onCancel={onClose}
      />
    </section>
  );
}
