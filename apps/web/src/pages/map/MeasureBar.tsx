import { journeyTime, TERRAIN_INFO, TRAVEL_PACE, type Pace } from '@dnd-manager/rules-engine';
import { Eraser, Undo2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, ICON_PROPS, iconClasses } from '../../components/ui';
import type { MapTools } from '../../data/maps';
import type { Region } from '../../data/regions';
import type { ImagePoint, ImageSize } from '../../lib/mapCoordinates';
import {
  FEET_PER_MILE,
  formatDistance,
  formatDuration,
  pathLengthPx,
  routeLegs,
  unitsPerPixel,
} from '../../lib/mapGeometry';
import styles from './MapTools.module.css';

interface Props {
  points: readonly ImagePoint[];
  size: ImageSize;
  tools: MapTools;
  /** The zones the viewer can see: a route through them is limited by their terrain's maximum pace. */
  regions: readonly Region[];
  isDm: boolean;
  onUndo: () => void;
  onClear: () => void;
}

/** The measuring tool's readout: distance, and for maps in miles, travel time at the chosen pace (SRD rules). */
export function MeasureBar({ points, size, tools, regions, isDm, onUndo, onClear }: Props) {
  const id = useId();
  const [pace, setPace] = useState<Pace>('normal');
  const upp = unitsPerPixel(size, tools);

  let readout: string;
  let travel: string | null = null;
  if (!upp) {
    readout = isDm
      ? 'This map has no scale yet: set its width in Map settings to measure.'
      : 'This map has no scale yet, so distances cannot be measured.';
  } else if (points.length < 2) {
    readout = 'Click the map to start a route; each click adds a point.';
  } else {
    const units = pathLengthPx(points) * upp;
    readout = formatDistance(units, tools.scaleUnit);
    if (tools.scaleUnit === 'mi') {
      const journey = journeyTime(routeLegs(points, regions, upp), pace);
      const parts = [
        `${TRAVEL_PACE[pace].label} pace: ${journey.hours > 0 ? formatDuration(journey.hours, journey.days) : 'no overland travel'}`,
      ];
      if (journey.slowedBy.length > 0) {
        parts.push(`slowed by ${journey.slowedBy.map(t => TERRAIN_INFO[t].label.toLowerCase()).join(', ')}`);
      }
      if (journey.waterborneMiles > 0)
        parts.push(`${formatDistance(journey.waterborneMiles, 'mi')} by vessel not counted`);
      travel = parts.join(' · ');
    } else if (units >= FEET_PER_MILE / 4) {
      readout += ` (${formatDistance(units / FEET_PER_MILE, 'mi')})`;
    }
  }

  return (
    <div className={styles.measure} role="status" aria-live="polite">
      <p className={styles.readout}>
        <strong>{readout}</strong>
        {travel && <span>{travel}</span>}
      </p>
      {upp && tools.scaleUnit === 'mi' && (
        <span className={styles.pace}>
          <label htmlFor={`${id}-pace`}>Pace</label>
          <select
            id={`${id}-pace`}
            value={pace}
            onChange={e => setPace(e.target.value as Pace)}
            className={styles.select}
          >
            {(['slow', 'normal', 'fast'] as const).map(p => (
              <option key={p} value={p}>
                {`${TRAVEL_PACE[p].label} (${TRAVEL_PACE[p].milesPerDay} miles a day)`}
              </option>
            ))}
          </select>
        </span>
      )}
      <Button variant="ghost" className={iconClasses.host} disabled={points.length === 0} onClick={onUndo}>
        <Undo2 {...ICON_PROPS} className={iconClasses.icon} />
        Undo point
      </Button>
      <Button variant="ghost" className={iconClasses.host} disabled={points.length === 0} onClick={onClear}>
        <Eraser {...ICON_PROPS} className={iconClasses.icon} />
        Clear
      </Button>
    </div>
  );
}
