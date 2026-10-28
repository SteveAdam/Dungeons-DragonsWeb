import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { MapPin, Plus, Trash2, UsersRound } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Tag } from '../../../components/ui';
import type { CharacterSummary } from '../../../data/characters';
import { friendlyMessage } from '../../../data/errors';
import type { GroupDiscovery, PartyGroup } from '../../../data/partyGroups';
import {
  useAssignCharacter,
  useCreateGroup,
  useDeleteGroup,
  useGroupDiscoveries,
  useMoveGroup,
  usePartyGroups,
} from '../../../hooks/useHere';
import { useAllMaps } from '../../../hooks/useMapView';
import { useRegions } from '../../../hooks/useRegions';
import styles from './party.module.css';

const NO_GROUP = 'no-group';

/** A character card: drag it onto a group, or pick the group from its menu (the keyboard way). */
function CharacterCard({
  character,
  groups,
  groupId,
  onAssign,
}: {
  character: CharacterSummary;
  groups: readonly PartyGroup[];
  groupId: string | null;
  onAssign: (groupId: string | null) => void;
}) {
  const id = useId();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: character.id });
  return (
    <li ref={setNodeRef} className={`${styles.card} ${isDragging ? styles.dragging : ''}`}>
      <span className={styles.grip} {...listeners} {...attributes} aria-label={`Drag ${character.name}`}>
        {character.name}
      </span>
      <label htmlFor={`${id}-group`} className="visually-hidden">{`Group for ${character.name}`}</label>
      <select
        id={`${id}-group`}
        className={styles.select}
        value={groupId ?? ''}
        onChange={e => onAssign(e.target.value || null)}
      >
        <option value="">No group</option>
        {groups.map(g => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </li>
  );
}

function Column({ id, children, label }: { id: string; label: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={label} className={`${styles.column} ${isOver ? styles.over : ''}`}>
      {children}
    </section>
  );
}

/** Where the group is, and "Move group here": the server works out the members' passives on arrival. */
function GroupPlace({
  campaignId,
  group,
  discoveries,
}: {
  campaignId: string;
  group: PartyGroup;
  discoveries: readonly GroupDiscovery[];
}) {
  const id = useId();
  const maps = useAllMaps(campaignId, true);
  const [mapId, setMapId] = useState(group.mapId ?? '');
  const [regionId, setRegionId] = useState(group.regionId ?? '');
  const regions = useRegions(mapId || undefined, true);
  const move = useMoveGroup(campaignId);
  const [revealed, setRevealed] = useState<string[] | null>(null);
  const remove = useDeleteGroup(campaignId);
  return (
    <div className={styles.place}>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-map`}>Map</label>
          <select
            id={`${id}-map`}
            className={styles.select}
            value={mapId}
            onChange={e => {
              setMapId(e.target.value);
              setRegionId('');
            }}
          >
            <option value="">Nowhere</option>
            {(maps.data ?? []).map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-region`}>Region</label>
          <select
            id={`${id}-region`}
            className={styles.select}
            value={regionId}
            disabled={!mapId}
            onChange={e => setRegionId(e.target.value)}
          >
            <option value="">No region</option>
            {(regions.data ?? []).map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles.fields}>
        <Button
          className={iconClasses.host}
          disabled={move.isPending}
          onClick={() =>
            move.mutate(
              { groupId: group.id, mapId: mapId || null, regionId: regionId || null },
              { onSuccess: names => setRevealed(names) },
            )
          }
        >
          <MapPin {...ICON_PROPS} className={iconClasses.icon} />
          {move.isPending ? 'Moving…' : 'Move group here'}
        </Button>
        <Button
          variant="ghost"
          className={iconClasses.host}
          disabled={remove.isPending}
          onClick={() => remove.mutate(group.id)}
        >
          <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
          Remove group
        </Button>
      </div>
      {revealed && (
        <p className={styles.note} aria-live="polite">
          {revealed.length === 0 ? 'Nothing new revealed.' : `Revealed: ${revealed.join(', ')}.`}
        </p>
      )}
      {(move.error ?? remove.error) && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(move.error ?? remove.error)}
        </p>
      )}
      {discoveries.length > 0 && (
        <ul className={styles.discoveries} aria-label={`${group.name} has discovered`}>
          {discoveries.map(d => (
            <li key={d.contentId}>
              {d.name} <Tag>{d.state.toUpperCase()}</Tag>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * DM only (P3-3): location groups. Create groups, drag characters into them (or pick from each card's menu), choose
 * the map and region, and move the group there. Each group lists what it has discovered.
 */
export function PartyGroupsPanel({
  campaignId,
  characters,
}: {
  campaignId: string;
  characters: readonly CharacterSummary[];
}) {
  const id = useId();
  const groups = usePartyGroups(campaignId, true);
  const discoveries = useGroupDiscoveries(
    (groups.data ?? []).map(g => g.id),
    true,
  );
  const create = useCreateGroup(campaignId);
  const assign = useAssignCharacter(campaignId);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8E2A22');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const list = groups.data ?? [];
  const groupOf = (characterId: string) => list.find(g => g.characterIds.includes(characterId))?.id ?? null;
  const onAssign = (characterId: string, groupId: string | null) => {
    if (groupOf(characterId) !== groupId) assign.mutate({ characterId, groupId });
  };
  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    onAssign(String(e.active.id), e.over.id === NO_GROUP ? null : String(e.over.id));
  }
  function onCreate(e: FormEvent) {
    e.preventDefault();
    create.mutate({ name, color }, { onSuccess: () => setName('') });
  }

  const card = (c: CharacterSummary) => (
    <CharacterCard key={c.id} character={c} groups={list} groupId={groupOf(c.id)} onAssign={g => onAssign(c.id, g)} />
  );

  return (
    <section aria-labelledby={`${id}-title`} className={`${styles.section} ${styles.wide}`}>
      <h2 id={`${id}-title`} className={`${styles.heading} ${iconClasses.host}`}>
        <UsersRound {...ICON_PROPS} className={iconClasses.icon} />
        Party groups
      </h2>
      <p className={styles.note}>
        Where each set of characters is. Moving a group into a region reveals what its members notice there.
      </p>
      <form className={styles.fields} onSubmit={onCreate} aria-label="New group">
        <div className={styles.field}>
          <label htmlFor={`${id}-name`}>Group name</label>
          <Input id={`${id}-name`} value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-color`}>Colour</label>
          <Input id={`${id}-color`} value={color} maxLength={7} onChange={e => setColor(e.target.value)} />
        </div>
        <Button type="submit" className={iconClasses.host} disabled={create.isPending || !name.trim()}>
          <Plus {...ICON_PROPS} className={iconClasses.icon} />
          Create group
        </Button>
      </form>
      {(create.error ?? assign.error ?? groups.error) && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(create.error ?? assign.error ?? groups.error)}
        </p>
      )}
      {groups.isPending ? (
        <p role="status">Gathering the groups…</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className={styles.columns}>
            <Column id={NO_GROUP} label="No group">
              <h3 className={styles.formTitle}>No group</h3>
              <ul className={styles.cards}>{characters.filter(c => !groupOf(c.id)).map(card)}</ul>
            </Column>
            {list.map(g => (
              <Column key={g.id} id={g.id} label={g.name}>
                <h3 className={styles.formTitle}>
                  <span className={styles.swatch} style={{ background: g.color }} aria-hidden="true" />
                  {g.name}
                </h3>
                <ul className={styles.cards}>{characters.filter(c => g.characterIds.includes(c.id)).map(card)}</ul>
                <GroupPlace
                  campaignId={campaignId}
                  group={g}
                  discoveries={(discoveries.data ?? []).filter(d => d.groupId === g.id)}
                />
              </Column>
            ))}
          </div>
        </DndContext>
      )}
    </section>
  );
}
