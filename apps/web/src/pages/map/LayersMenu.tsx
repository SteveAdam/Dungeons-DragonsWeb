import { TERRAIN_INFO, WEATHER_INFO, type Terrain, type Weather } from '@dnd-manager/rules-engine';
import { Layers } from 'lucide-react';
import { ICON_PROPS, iconClasses, Toggle } from '../../components/ui';
import type { Region } from '../../data/regions';
import styles from './MapTools.module.css';
import { WEATHER_ICONS } from './regionIcons';

export interface LayerState {
  pins: boolean;
  regions: boolean;
  grid: boolean;
  compass: boolean;
}

interface Props {
  layers: LayerState;
  onChange: (layers: LayerState) => void;
  /** False when the map has no grid set, so the toggle is pointless. */
  gridAvailable: boolean;
  /** The zones on show, for the legend. */
  regions: readonly Region[];
}

/** What the map shows, and a legend for the terrains and weather on it. */
export function LayersMenu({ layers, onChange, gridAvailable, regions }: Props) {
  const set = (key: keyof LayerState) => (on: boolean) => onChange({ ...layers, [key]: on });
  const terrains = [...new Set(regions.map(r => r.terrain))] as Terrain[];
  const weathers = [...new Set(regions.map(r => r.weather))] as Weather[];
  return (
    <details className={styles.layers}>
      <summary className={iconClasses.host}>
        <Layers {...ICON_PROPS} className={iconClasses.icon} />
        Layers
      </summary>
      <div className={styles.layersBody}>
        <Toggle checked={layers.pins} onChange={set('pins')} label="Pins" />
        <Toggle checked={layers.regions} onChange={set('regions')} label="Regions and weather" />
        {gridAvailable && <Toggle checked={layers.grid} onChange={set('grid')} label="Grid" />}
        <Toggle checked={layers.compass} onChange={set('compass')} label="Compass" />
        {layers.regions && terrains.length > 0 && (
          <section aria-label="Legend" className={styles.legend}>
            <h3 className={styles.legendTitle}>Legend</h3>
            <ul>
              {terrains.map(t => (
                <li key={t}>
                  <svg width="22" height="16" aria-hidden="true" className={styles.swatch}>
                    <rect width="22" height="16" style={{ fill: `url(#terrain-${t})` }} />
                  </svg>
                  {TERRAIN_INFO[t].label}
                </li>
              ))}
              {weathers.map(w => {
                const Icon = WEATHER_ICONS[w];
                return (
                  <li key={w}>
                    <Icon {...ICON_PROPS} />
                    {WEATHER_INFO[w].label}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
