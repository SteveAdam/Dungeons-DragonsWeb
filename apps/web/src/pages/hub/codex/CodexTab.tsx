// P2-1: the entity registry. The DM gets folders (drag and drop, or "Move to…"), the entity list and the detail
// with relationships; players get a flat, searchable list of what the DM has revealed.
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { FolderPlus, GripVertical, Plus } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { Button, ICON_PROPS, iconClasses, Input, Tag } from '../../../components/ui';
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPES,
  type Entity,
  type EntityFolder,
  type EntityType,
} from '../../../data/entities';
import { friendlyMessage } from '../../../data/errors';
import {
  useCreateEntity,
  useCreateFolder,
  useDeleteFolder,
  useEntities,
  useEntityFolders,
  useEntityLinks,
  useMoveEntity,
  useMoveFolder,
  useRenameFolder,
} from '../../../hooks/useEntities';
import {
  descendantIds,
  filterEntities,
  flattenTree,
  folderTree,
  resolveDrop,
  type DragItem,
} from '../../../lib/entityTree';
import styles from './codex.module.css';
import { EntityDetail } from './EntityDetail';
import { FolderTree, type FolderFilter } from './FolderTree';

export function CodexTab({ campaignId, dmMode }: { campaignId: string; dmMode: boolean }) {
  // a fresh state when DM mode flips: the DM tools and the player view ask for different data
  return dmMode ? <DmCodex key="dm" campaignId={campaignId} /> : <PlayerCodex key="player" campaignId={campaignId} />;
}

function SearchAndType({
  query,
  onQuery,
  type,
  onType,
}: {
  query: string;
  onQuery: (q: string) => void;
  type: EntityType | 'all';
  onType: (t: EntityType | 'all') => void;
}) {
  const id = useId();
  return (
    <div className={styles.filters} role="search">
      <label htmlFor={`${id}-q`} className={styles.visuallyHidden}>
        Search entities
      </label>
      <Input id={`${id}-q`} type="search" placeholder="Search" value={query} onChange={e => onQuery(e.target.value)} />
      <label htmlFor={`${id}-type`} className={styles.visuallyHidden}>
        Type
      </label>
      <select
        id={`${id}-type`}
        value={type}
        onChange={e => onType(e.target.value as EntityType | 'all')}
        className={styles.select}
      >
        <option value="all">All types</option>
        {ENTITY_TYPES.map(t => (
          <option key={t} value={t}>
            {ENTITY_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

function EntityRow({
  entity,
  selected,
  onSelect,
  draggable,
}: {
  entity: Entity;
  selected: boolean;
  onSelect: () => void;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-entity:${entity.id}`,
    data: { kind: 'entity', id: entity.id },
    disabled: !draggable,
  });
  return (
    <li ref={setNodeRef} className={`${styles.entityRow} ${isDragging ? styles.dragging : ''}`}>
      {draggable && (
        <span {...listeners} {...attributes} tabIndex={-1} aria-hidden="true" className={styles.grip}>
          <GripVertical {...ICON_PROPS} />
        </span>
      )}
      <button type="button" aria-pressed={selected} className={styles.entityButton} onClick={onSelect}>
        {entity.name}
        <span className={styles.kind}>{ENTITY_TYPE_LABELS[entity.type]}</span>
        {draggable && !entity.visibleToPlayers && <span className={styles.kind}>· hidden</span>}
      </button>
    </li>
  );
}

function DmCodex({ campaignId }: { campaignId: string }) {
  const entities = useEntities(campaignId, true);
  const folders = useEntityFolders(campaignId, true);
  const links = useEntityLinks(campaignId, true);
  const moveEntity = useMoveEntity(campaignId);
  const moveFolder = useMoveFolder(campaignId);
  const [filter, setFilter] = useState<FolderFilter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [type, setType] = useState<EntityType | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  // a small movement before a drag starts, so a click on the handle is not a drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const tree = useMemo(() => folderTree(folders.data ?? []), [folders.data]);
  const counts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const e of entities.data ?? []) m.set(e.folderId, (m.get(e.folderId) ?? 0) + 1);
    return m;
  }, [entities.data]);

  if (entities.isPending || folders.isPending) return <p role="status">Opening the codex…</p>;
  if (entities.isError) return <ErrorNotice error={entities.error} onRetry={() => entities.refetch()} />;
  if (folders.isError) return <ErrorNotice error={folders.error} onRetry={() => folders.refetch()} />;

  const all = entities.data;
  const inFilter = all.filter(e =>
    filter.kind === 'all' ? true : filter.kind === 'root' ? e.folderId === null : e.folderId === filter.id,
  );
  const shown = filterEntities(inFilter, query, type);
  const selected = all.find(e => e.id === selectedId) ?? null;
  const currentFolder = filter.kind === 'folder' ? (folders.data.find(f => f.id === filter.id) ?? null) : null;
  const error = moveEntity.error ?? moveFolder.error;

  function onDragEnd(event: DragEndEvent) {
    setDropError(null);
    const item = event.active.data.current as DragItem | undefined;
    if (!item) return;
    const action = resolveDrop(item, event.over ? String(event.over.id) : null, folders.data ?? []);
    if (action.kind === 'move-entity') moveEntity.mutate({ id: action.id, folderId: action.folderId });
    else if (action.kind === 'move-folder') moveFolder.mutate({ id: action.id, parentId: action.parentId });
    else if (action.kind === 'refuse') setDropError(action.reason);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className={styles.codex}>
        <div className={styles.column}>
          <FolderTree tree={tree} filter={filter} onFilter={setFilter} counts={counts} />
          <NewFolder campaignId={campaignId} parent={currentFolder} />
          {currentFolder && (
            <FolderTools
              key={currentFolder.id}
              campaignId={campaignId}
              folder={currentFolder}
              folders={folders.data}
              onDeleted={() => setFilter({ kind: 'all' })}
            />
          )}
        </div>

        <div className={styles.column}>
          <SearchAndType query={query} onQuery={setQuery} type={type} onType={setType} />
          {(error || dropError) && (
            <p role="alert" className={styles.error}>
              {dropError ?? friendlyMessage(error)}
            </p>
          )}
          <ul aria-label="Entities" className={styles.entityList}>
            {shown.map(e => (
              <EntityRow
                key={e.id}
                entity={e}
                selected={e.id === selectedId}
                onSelect={() => setSelectedId(e.id)}
                draggable
              />
            ))}
          </ul>
          {shown.length === 0 && <p className={styles.muted}>Nothing here yet.</p>}
          <NewEntity
            campaignId={campaignId}
            folderId={currentFolder?.id ?? null}
            folderName={currentFolder?.name ?? null}
            onCreated={setSelectedId}
          />
        </div>

        <div className={styles.column}>
          {selected ? (
            <EntityDetail
              campaignId={campaignId}
              entity={selected}
              entities={all}
              links={links.data ?? []}
              canEdit
              folders={folders.data}
              onDeleted={() => setSelectedId(null)}
              onOpen={setSelectedId}
            />
          ) : (
            <p className={styles.muted}>Choose an entity to see its details and relationships.</p>
          )}
        </div>
      </div>
    </DndContext>
  );
}

function NewEntity({
  campaignId,
  folderId,
  folderName,
  onCreated,
}: {
  campaignId: string;
  folderId: string | null;
  folderName: string | null;
  onCreated: (id: string) => void;
}) {
  const id = useId();
  const create = useCreateEntity(campaignId);
  const [name, setName] = useState('');
  const [type, setType] = useState<EntityType>('npc');
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { type, name, folderId },
      {
        onSuccess: entity => {
          setName('');
          onCreated(entity.id);
        },
      },
    );
  }
  return (
    <form onSubmit={onSubmit} className={styles.newForm} aria-label="New entity" noValidate>
      <h4 className={styles.subTitle}>{folderName ? `New entity in ${folderName}` : 'New entity'}</h4>
      <label htmlFor={`${id}-type`} className={styles.visuallyHidden}>
        Type
      </label>
      <select
        id={`${id}-type`}
        value={type}
        onChange={e => setType(e.target.value as EntityType)}
        className={styles.select}
      >
        {ENTITY_TYPES.map(t => (
          <option key={t} value={t}>
            {ENTITY_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-name`} className={styles.visuallyHidden}>
        Name
      </label>
      <Input
        id={`${id}-name`}
        placeholder="Name"
        maxLength={120}
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <Button type="submit" className={iconClasses.host} disabled={create.isPending}>
        <Plus {...ICON_PROPS} className={iconClasses.icon} />
        Create
      </Button>
      {create.isError && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(create.error)}
        </p>
      )}
    </form>
  );
}

function NewFolder({ campaignId, parent }: { campaignId: string; parent: EntityFolder | null }) {
  const id = useId();
  const create = useCreateFolder(campaignId);
  const [name, setName] = useState('');
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ name, parentId: parent?.id ?? null }, { onSuccess: () => setName('') });
  }
  return (
    <form onSubmit={onSubmit} className={styles.newForm} aria-label="New folder" noValidate>
      <label htmlFor={`${id}-name`} className={styles.visuallyHidden}>
        {parent ? `New folder inside ${parent.name}` : 'New folder'}
      </label>
      <Input
        id={`${id}-name`}
        placeholder={parent ? `New folder in ${parent.name}` : 'New folder'}
        maxLength={120}
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <Button type="submit" variant="ghost" className={iconClasses.host} disabled={create.isPending}>
        <FolderPlus {...ICON_PROPS} className={iconClasses.icon} />
        Add folder
      </Button>
      {create.isError && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(create.error)}
        </p>
      )}
    </form>
  );
}

/** Rename, move ("Move to…", the keyboard way) or delete the chosen folder. */
function FolderTools({
  campaignId,
  folder,
  folders,
  onDeleted,
}: {
  campaignId: string;
  folder: EntityFolder;
  folders: readonly EntityFolder[];
  onDeleted: () => void;
}) {
  const id = useId();
  const rename = useRenameFolder(campaignId);
  const move = useMoveFolder(campaignId);
  const remove = useDeleteFolder(campaignId);
  const [name, setName] = useState(folder.name);
  const [confirm, setConfirm] = useState(false);
  const blocked = descendantIds(folder.id, folders);
  const options = flattenTree(folderTree(folders)).filter(n => !blocked.has(n.folder.id));
  const error = rename.error ?? move.error ?? remove.error;
  return (
    <section aria-label={`Folder: ${folder.name}`} className={styles.folderTools}>
      <form
        onSubmit={e => {
          e.preventDefault();
          rename.mutate({ id: folder.id, name });
        }}
        className={styles.inlineForm}
        aria-label="Rename folder"
      >
        <label htmlFor={`${id}-name`} className={styles.visuallyHidden}>
          Folder name
        </label>
        <Input id={`${id}-name`} value={name} maxLength={120} onChange={e => setName(e.target.value)} />
        <Button type="submit" variant="ghost" disabled={rename.isPending || name.trim() === folder.name}>
          Rename
        </Button>
      </form>
      <span className={styles.moveTo}>
        <label htmlFor={`${id}-move`}>Move folder to…</label>
        <select
          id={`${id}-move`}
          value={folder.parentId ?? ''}
          onChange={e => move.mutate({ id: folder.id, parentId: e.target.value || null })}
          className={styles.select}
        >
          <option value="">Top level</option>
          {options.map(n => (
            <option key={n.folder.id} value={n.folder.id}>
              {`${'— '.repeat(n.depth)}${n.folder.name}`}
            </option>
          ))}
        </select>
      </span>
      {confirm ? (
        <span className={styles.confirm}>
          <span>Delete this folder? Everything in it moves up one level.</span>
          <Button disabled={remove.isPending} onClick={() => remove.mutate(folder.id, { onSuccess: onDeleted })}>
            Yes, delete
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Keep
          </Button>
        </span>
      ) : (
        <Button variant="ghost" onClick={() => setConfirm(true)}>
          Delete folder
        </Button>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(error)}
        </p>
      )}
    </section>
  );
}

function PlayerCodex({ campaignId }: { campaignId: string }) {
  const entities = useEntities(campaignId, false);
  const links = useEntityLinks(campaignId, false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<EntityType | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (entities.isPending) return <p role="status">Opening the codex…</p>;
  if (entities.isError) return <ErrorNotice error={entities.error} onRetry={() => entities.refetch()} />;
  const shown = filterEntities(entities.data, query, type);
  const selected = entities.data.find(e => e.id === selectedId) ?? null;
  return (
    <div className={`${styles.codex} ${styles.codexPlayer}`}>
      <div className={styles.column}>
        <SearchAndType query={query} onQuery={setQuery} type={type} onType={setType} />
        <ul aria-label="Entities" className={styles.entityList}>
          {shown.map(e => (
            <EntityRow
              key={e.id}
              entity={e}
              selected={e.id === selectedId}
              onSelect={() => setSelectedId(e.id)}
              draggable={false}
            />
          ))}
        </ul>
        {shown.length === 0 && <p className={styles.muted}>Nothing has been revealed yet.</p>}
      </div>
      <div className={styles.column}>
        {selected ? (
          <EntityDetail
            campaignId={campaignId}
            entity={selected}
            entities={entities.data}
            links={links.data ?? []}
            canEdit={false}
            folders={[]}
            onDeleted={() => setSelectedId(null)}
            onOpen={setSelectedId}
          />
        ) : (
          <p className={styles.muted}>
            Choose a name to read about it. <Tag>Only what your DM has revealed</Tag>
          </p>
        )}
      </div>
    </div>
  );
}
