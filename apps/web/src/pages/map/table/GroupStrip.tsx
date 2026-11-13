// P4-2: the strip under the map in table mode: one small card per group, where it is, and the way to its map.
import { Button } from '../../../components/ui';
import type { MemberVitals } from '../../../data/groupTokens';
import type { PartyGroup } from '../../../data/partyGroups';
import { locationText, safeGroupColor } from '../../../lib/groupTokens';
import styles from './GroupStrip.module.css';

interface GroupStripProps {
  groups: readonly PartyGroup[];
  vitals: readonly MemberVitals[];
  mapId: string;
  onJump: (mapId: string) => void;
}

export function GroupStrip({ groups, vitals, mapId, onJump }: GroupStripProps) {
  if (groups.length === 0) return null;
  const names = new Map(vitals.map(v => [v.characterId, v.name]));
  return (
    <ul className={styles.strip} aria-label="Where the groups are">
      {groups.map(group => {
        const here = group.mapId === mapId;
        const members = group.characterIds.map(id => names.get(id)).filter(Boolean);
        return (
          <li
            key={group.id}
            className={styles.card}
            style={{ '--group-color': safeGroupColor(group.color) } as React.CSSProperties}
          >
            <p className={styles.name}>
              {group.name}
              {members.length > 0 && <span className={styles.members}>{` · ${members.join(', ')}`}</span>}
            </p>
            <p className={styles.where}>{locationText(group)}</p>
            <Button
              variant="ghost"
              disabled={!group.mapId || here}
              onClick={() => group.mapId && onJump(group.mapId)}
              aria-label={here ? `${group.name} is on this map` : `Jump to ${group.name} (strip)`}
            >
              {here ? 'Viewing now' : 'Jump to their map'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
