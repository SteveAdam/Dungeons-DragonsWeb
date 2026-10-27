import { DoorOpen, ImagePlus, Link2, Unlink } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, ICON_PROPS, iconClasses, IconLink, Tag } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { LinkableMap, MapParent, SubMap } from '../../data/maps';
import { useAllMaps, useLinkMap } from '../../hooks/useMapView';
import { MapUploadForm } from '../hub/MapUploadForm';
import styles from './MapView.module.css';

interface Props {
  parent: MapParent;
  /** The pin's title or the region's name, for headings. */
  parentName: string;
  campaignId: string;
  /** The map beneath this pin or region, if it has one (and the viewer may see it). */
  subMap?: SubMap;
  /** DM with DM mode on: Link and Unlink. */
  canEdit: boolean;
  /** False hides "Link detail map" (for example on a pin that is not a location). Enter and Unlink still show. */
  canLink?: boolean;
  /** Maps that cannot go beneath this parent: the map it is on and every map above that. */
  excludeMapIds: readonly string[];
}

function mapLabel(m: LinkableMap): string {
  const where = m.parentPinId || m.parentRegionId ? 'now beneath another place' : 'top level';
  return `${m.name} (${where}${m.visibleToPlayers ? '' : ', hidden'})`;
}

/** The DM's choice between an existing map of the campaign and a new upload. */
function LinkPicker({
  parent,
  parentName,
  campaignId,
  excludeMapIds,
  onDone,
}: Pick<Props, 'parent' | 'parentName' | 'campaignId' | 'excludeMapIds'> & { onDone: () => void }) {
  const id = useId();
  const maps = useAllMaps(campaignId, true);
  const link = useLinkMap(campaignId);
  const [mode, setMode] = useState<'existing' | 'upload'>('existing');
  const [chosen, setChosen] = useState('');
  const choices = (maps.data ?? []).filter(m => !excludeMapIds.includes(m.id));

  if (mode === 'upload') {
    return (
      <MapUploadForm
        campaignId={campaignId}
        parentPinId={parent.kind === 'pin' ? parent.id : undefined}
        parentRegionId={parent.kind === 'region' ? parent.id : undefined}
        title={`A detail map beneath ${parentName}`}
        onCancel={() => setMode('existing')}
        onUploaded={onDone}
      />
    );
  }
  return (
    <div className={styles.linkPicker} role="group" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.fieldHeading}>{`Link a detail map beneath ${parentName}`}</h3>
      {maps.isPending ? (
        <p role="status">Gathering the maps…</p>
      ) : choices.length === 0 ? (
        <p className={styles.prose}>No other map can go here yet. Upload a new one.</p>
      ) : (
        <label className={styles.field}>
          <span>An existing map</span>
          <select value={chosen} onChange={e => setChosen(e.target.value)} className={styles.select}>
            <option value="">Choose a map…</option>
            {choices.map(m => (
              <option key={m.id} value={m.id}>
                {mapLabel(m)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className={styles.actions}>
        <Button
          className={iconClasses.host}
          disabled={!chosen || link.isPending}
          onClick={() => link.mutate({ mapId: chosen, parent }, { onSuccess: onDone })}
        >
          <Link2 {...ICON_PROPS} className={iconClasses.icon} />
          {link.isPending ? 'Linking…' : 'Link this map'}
        </Button>
        <Button variant="ghost" className={iconClasses.host} onClick={() => setMode('upload')}>
          <ImagePlus {...ICON_PROPS} className={iconClasses.icon} />
          Upload a new map
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {(maps.error ?? link.error) && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(maps.error ?? link.error)}
        </p>
      )}
    </div>
  );
}

/**
 * The map beneath a pin or region (MAP-2): an "Enter" link for everyone who can see it. For a DM, "Unlink" turns
 * it back into a top-level map, and without one, "Link detail map" picks an existing map or uploads a new one.
 * It sits outside the pin and region editors because the upload is a form of its own.
 */
export function DetailMapSection({
  parent,
  parentName,
  campaignId,
  subMap,
  canEdit,
  canLink = true,
  excludeMapIds,
}: Props) {
  const [linking, setLinking] = useState(false);
  const unlink = useLinkMap(campaignId);
  if (subMap) {
    return (
      <div className={styles.subMap}>
        <IconLink to={`/campaigns/${campaignId}/maps/${subMap.id}`} icon={DoorOpen} className={styles.enter}>
          {`Enter ${subMap.name}`}
        </IconLink>
        {canEdit && !subMap.visibleToPlayers && <Tag>Map hidden from players</Tag>}
        {canEdit && (
          <Button
            variant="ghost"
            className={iconClasses.host}
            disabled={unlink.isPending}
            onClick={() => unlink.mutate({ mapId: subMap.id, parent: null })}
          >
            <Unlink {...ICON_PROPS} className={iconClasses.icon} />
            {unlink.isPending ? 'Unlinking…' : 'Unlink'}
          </Button>
        )}
        {unlink.error && (
          <p role="alert" className={styles.error}>
            {friendlyMessage(unlink.error)}
          </p>
        )}
      </div>
    );
  }
  if (!canEdit || !canLink) return null;
  return linking ? (
    <LinkPicker
      parent={parent}
      parentName={parentName}
      campaignId={campaignId}
      excludeMapIds={excludeMapIds}
      onDone={() => setLinking(false)}
    />
  ) : (
    <Button variant="ghost" className={iconClasses.host} onClick={() => setLinking(true)}>
      <Link2 {...ICON_PROPS} className={iconClasses.icon} />
      Link detail map
    </Button>
  );
}
