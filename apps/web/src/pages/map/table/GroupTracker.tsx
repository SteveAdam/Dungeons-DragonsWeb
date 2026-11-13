// P4-2: the DM's split-party tracker, in table mode. Each group with its colour, members and their hit points, where it
// is, and what the DM can do with it: jump to its map, bring it here, move it to a region, give it the spotlight.
import { useId, useState, type FormEvent } from 'react';
import { Button, GameIcon, Input, Paper, Toggle } from '../../../components/ui';
import type { MemberVitals, Spotlight } from '../../../data/groupTokens';
import type { PartyGroup } from '../../../data/partyGroups';
import { healthWord, locationText, safeGroupColor } from '../../../lib/groupTokens';
import styles from './GroupTracker.module.css';

const SUMMARY_MAX = 200;

function MemberRow({ vitals }: { vitals: MemberVitals }) {
  const hp = vitals.hp;
  const state = hp ? healthWord(hp.current, hp.max) : null;
  return (
    <li className={styles.member}>
      <span className={styles.memberName}>
        {vitals.name}
        {vitals.className && <i className={styles.memberClass}>{` ${vitals.className}`}</i>}
      </span>
      {hp && state ? (
        <>
          <span
            role="meter"
            aria-label={`${vitals.name} hit points`}
            aria-valuemin={0}
            aria-valuemax={hp.max}
            aria-valuenow={hp.current}
            aria-valuetext={`${hp.current} of ${hp.max}, ${state.word}`}
            className={styles.bar}
          >
            <span
              className={styles.fill}
              data-tone={state.tone}
              style={{ width: `${hp.max > 0 ? Math.min(100, (hp.current / hp.max) * 100) : 0}%` }}
            />
          </span>
          <span className={styles.hpText}>{`${hp.current}/${hp.max}`}</span>
        </>
      ) : (
        <span className={styles.hpText}>No sheet yet</span>
      )}
    </li>
  );
}

export interface GroupTrackerProps {
  groups: readonly PartyGroup[];
  vitals: readonly MemberVitals[];
  /** The map on screen, and the regions on it. */
  mapId: string;
  regions: readonly { id: string; name: string }[];
  selectedGroupId: string | null;
  spotlight: Spotlight | null;
  sharePositions: boolean;
  busy: boolean;
  onSelect: (groupId: string) => void;
  onJump: (mapId: string) => void;
  onBringHere: (group: PartyGroup) => void;
  onMoveToRegion: (group: PartyGroup, regionId: string) => void;
  onSpotlight: (groupId: string | null, summary: string) => void;
  onNewGroup: () => void;
  onShare: (on: boolean) => void;
}

function SpotlightForm({
  group,
  summary,
  onSave,
  onClear,
}: {
  group: PartyGroup;
  summary: string;
  onSave: (summary: string) => void;
  onClear: () => void;
}) {
  const id = useId();
  const [line, setLine] = useState(summary);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(line);
  };
  return (
    <form className={styles.spotlightForm} onSubmit={submit} aria-label={`Spotlight for ${group.name}`}>
      <label htmlFor={`${id}-line`} className={styles.label}>
        A line for the other groups
      </label>
      <Input
        id={`${id}-line`}
        value={line}
        maxLength={SUMMARY_MAX}
        placeholder="Picking the vault's lock"
        onChange={e => setLine(e.target.value)}
      />
      <div className={styles.row}>
        <Button type="submit">Save line</Button>
        <Button variant="ghost" onClick={onClear}>
          End the spotlight
        </Button>
      </div>
    </form>
  );
}

export function GroupTracker({
  groups,
  vitals,
  mapId,
  regions,
  selectedGroupId,
  spotlight,
  sharePositions,
  busy,
  onSelect,
  onJump,
  onBringHere,
  onMoveToRegion,
  onSpotlight,
  onNewGroup,
  onShare,
}: GroupTrackerProps) {
  const id = useId();
  const byId = new Map(vitals.map(v => [v.characterId, v]));
  return (
    <Paper as="aside" texture="flat" className={styles.tracker} aria-label="Party groups">
      <div className={styles.head}>
        <h2 className={styles.title}>
          <GameIcon name="banner" /> Groups
        </h2>
        <Button onClick={onNewGroup} disabled={busy}>
          + New group
        </Button>
      </div>

      {groups.length === 0 && <p className={styles.muted}>No groups yet. Make one, then put characters in it.</p>}

      <ul className={styles.groups}>
        {groups.map(group => {
          const here = group.mapId === mapId;
          const spotlit = spotlight?.groupId === group.id;
          return (
            <li
              key={group.id}
              className={styles.group}
              data-selected={selectedGroupId === group.id || undefined}
              style={{ '--group-color': safeGroupColor(group.color) } as React.CSSProperties}
            >
              <button
                type="button"
                className={styles.groupName}
                aria-pressed={selectedGroupId === group.id}
                onClick={() => onSelect(group.id)}
              >
                <span className={styles.swatch} aria-hidden="true" />
                {group.name}
                {spotlit && <span className={styles.spotTag}>Spotlight</span>}
              </button>
              <p className={styles.where}>{locationText(group)}</p>

              {group.characterIds.length === 0 ? (
                <p className={styles.muted}>No characters in this group.</p>
              ) : (
                <ul className={styles.members} aria-label={`${group.name} members`}>
                  {group.characterIds.map(characterId => {
                    const v = byId.get(characterId);
                    return v ? (
                      <MemberRow key={characterId} vitals={v} />
                    ) : (
                      <li key={characterId} className={styles.member}>
                        <span className={styles.hpText}>A character</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className={styles.row}>
                <Button
                  variant="ghost"
                  disabled={!group.mapId || here}
                  onClick={() => group.mapId && onJump(group.mapId)}
                  aria-label={here ? `${group.name} is on this map` : `Jump to the map of ${group.name}`}
                >
                  {here ? 'Viewing now' : 'Jump to their map'}
                </Button>
                {!here && (
                  <Button variant="ghost" disabled={busy} onClick={() => onBringHere(group)}>
                    {`Bring ${group.name} here`}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-pressed={spotlit}
                  disabled={busy}
                  onClick={() => onSpotlight(spotlit ? null : group.id, '')}
                >
                  {spotlit ? 'Stop the spotlight' : 'Spotlight'}
                </Button>
              </div>

              {regions.length > 0 && (
                <div className={styles.regionPick}>
                  <label
                    htmlFor={`${id}-${group.id}`}
                    className={styles.label}
                  >{`Move ${group.name} to a region`}</label>
                  <select
                    id={`${id}-${group.id}`}
                    className={styles.select}
                    value=""
                    disabled={busy}
                    onChange={e => e.target.value && onMoveToRegion(group, e.target.value)}
                  >
                    <option value="">Move to region…</option>
                    {regions.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {spotlit && (
                <SpotlightForm
                  key={spotlight.summary}
                  group={group}
                  summary={spotlight.summary}
                  onSave={line => onSpotlight(group.id, line)}
                  onClear={() => onSpotlight(null, '')}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.share}>
        <Toggle checked={sharePositions} onChange={onShare} label="Players see where other groups are" />
        <p className={styles.muted}>
          {sharePositions
            ? 'Every player sees each group’s token, name and place, but never their hit points.'
            : 'Each player sees only their own group.'}
        </p>
      </div>
    </Paper>
  );
}
