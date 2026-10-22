import { ArrowRightLeft, Eye, EyeOff, Link2, Pencil, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Tag, Toggle } from '../../../components/ui';
import { ENTITY_TYPE_LABELS, type Entity, type EntityFolder, type EntityLink } from '../../../data/entities';
import { friendlyMessage } from '../../../data/errors';
import {
  useAddLink,
  useDeleteEntity,
  useMoveEntity,
  useRemoveLink,
  useRenameEntity,
  useSetEntityVisibility,
  useSetLinkHidden,
} from '../../../hooks/useEntities';
import { flattenTree, folderTree, linksOf } from '../../../lib/entityTree';
import styles from './codex.module.css';

interface Props {
  campaignId: string;
  entity: Entity;
  entities: readonly Entity[];
  links: readonly EntityLink[];
  /** DM mode: editing, folders, hidden links. Otherwise read-only. */
  canEdit: boolean;
  folders: readonly EntityFolder[];
  onDeleted: () => void;
  onOpen: (entityId: string) => void;
}

/** One entity: its name, type and place, and its relationships read from its own side. */
export function EntityDetail({ campaignId, entity, entities, links, canEdit, folders, onDeleted, onOpen }: Props) {
  const id = useId();
  const nameOf = (eid: string) => entities.find(e => e.id === eid)?.name ?? 'Unknown';
  const mine = linksOf(entity.id, links);

  return (
    <section aria-labelledby={`${id}-title`} className={styles.detail}>
      <header className={styles.detailHeader}>
        <h3 id={`${id}-title`} className={styles.detailTitle}>
          {entity.name}
        </h3>
        <Tag>{ENTITY_TYPE_LABELS[entity.type]}</Tag>
        {canEdit && !entity.visibleToPlayers && <Tag>Hidden from players</Tag>}
      </header>

      {canEdit && (
        <DmTools key={entity.id} campaignId={campaignId} entity={entity} folders={folders} onDeleted={onDeleted} />
      )}

      <section aria-labelledby={`${id}-rel`} className={styles.relationships}>
        <h4 id={`${id}-rel`} className={styles.subTitle}>
          Relationships
        </h4>
        {mine.length === 0 ? (
          <p className={styles.muted}>No relationships yet.</p>
        ) : (
          <ul className={styles.linkList}>
            {mine.map(({ link, otherId, label }) => (
              <LinkRow
                key={link.id}
                campaignId={campaignId}
                link={link}
                text={`${entity.name} ${label} ${nameOf(otherId)}`}
                otherName={nameOf(otherId)}
                canEdit={canEdit}
                onOpen={() => onOpen(otherId)}
              />
            ))}
          </ul>
        )}
        {canEdit && <AddLink campaignId={campaignId} entity={entity} entities={entities} />}
      </section>
    </section>
  );
}

function DmTools({
  campaignId,
  entity,
  folders,
  onDeleted,
}: Pick<Props, 'campaignId' | 'entity' | 'folders' | 'onDeleted'>) {
  const id = useId();
  const rename = useRenameEntity(campaignId);
  const move = useMoveEntity(campaignId);
  const visibility = useSetEntityVisibility(campaignId);
  const remove = useDeleteEntity(campaignId);
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const error = rename.error ?? move.error ?? visibility.error ?? remove.error;
  const options = flattenTree(folderTree(folders));

  function onRename(e: FormEvent) {
    e.preventDefault();
    if (name === null) return;
    rename.mutate({ id: entity.id, name }, { onSuccess: () => setName(null) });
  }

  return (
    <div className={styles.tools}>
      {name === null ? (
        <Button variant="ghost" className={iconClasses.host} onClick={() => setName(entity.name)}>
          <Pencil {...ICON_PROPS} className={iconClasses.icon} />
          Rename
        </Button>
      ) : (
        <form onSubmit={onRename} className={styles.inlineForm} aria-label="Rename entity">
          <label htmlFor={`${id}-name`} className={styles.visuallyHidden}>
            New name
          </label>
          <Input id={`${id}-name`} value={name} maxLength={120} onChange={e => setName(e.target.value)} />
          <Button type="submit" disabled={rename.isPending}>
            Save
          </Button>
          <Button variant="ghost" onClick={() => setName(null)}>
            Cancel
          </Button>
        </form>
      )}

      <Toggle
        checked={entity.visibleToPlayers}
        onChange={visible => visibility.mutate({ id: entity.id, visible })}
        label="Visible to players"
      />

      <span className={styles.moveTo}>
        <label htmlFor={`${id}-move`} className={iconClasses.host}>
          <ArrowRightLeft {...ICON_PROPS} className={iconClasses.icon} />
          Move to…
        </label>
        <select
          id={`${id}-move`}
          value={entity.folderId ?? ''}
          onChange={e => move.mutate({ id: entity.id, folderId: e.target.value || null })}
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
          <span>{`Delete ${entity.name} and its relationships?`}</span>
          <Button disabled={remove.isPending} onClick={() => remove.mutate(entity.id, { onSuccess: onDeleted })}>
            Yes, delete
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Keep
          </Button>
        </span>
      ) : (
        <Button variant="ghost" className={iconClasses.host} onClick={() => setConfirm(true)}>
          <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
          Delete
        </Button>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(error)}
        </p>
      )}
    </div>
  );
}

function LinkRow({
  campaignId,
  link,
  text,
  otherName,
  canEdit,
  onOpen,
}: {
  campaignId: string;
  link: EntityLink;
  text: string;
  otherName: string;
  canEdit: boolean;
  onOpen: () => void;
}) {
  const setHidden = useSetLinkHidden(campaignId);
  const remove = useRemoveLink(campaignId);
  return (
    <li className={styles.linkRow}>
      <button type="button" className={styles.linkText} onClick={onOpen} aria-label={`${text}: open ${otherName}`}>
        <Link2 {...ICON_PROPS} />
        {text}
      </button>
      {canEdit && (
        <>
          <Button
            variant="ghost"
            aria-pressed={link.hidden}
            aria-label={link.hidden ? `Reveal: ${text}` : `Hide: ${text}`}
            title={link.hidden ? 'Hidden from players: select to reveal' : 'Visible to players: select to hide'}
            disabled={setHidden.isPending}
            onClick={() => setHidden.mutate({ id: link.id, hidden: !link.hidden })}
            className={styles.iconButton}
          >
            {link.hidden ? <EyeOff {...ICON_PROPS} /> : <Eye {...ICON_PROPS} />}
          </Button>
          <Button
            variant="ghost"
            aria-label={`Remove: ${text}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(link.id)}
            className={styles.iconButton}
          >
            <Trash2 {...ICON_PROPS} />
          </Button>
        </>
      )}
      {(setHidden.error ?? remove.error) && (
        <span role="alert" className={styles.error}>
          {friendlyMessage(setHidden.error ?? remove.error)}
        </span>
      )}
    </li>
  );
}

/** "Mira [owns] the Lantern; the Lantern [is owned by] Mira": one relationship, a label for each side. */
function AddLink({
  campaignId,
  entity,
  entities,
}: {
  campaignId: string;
  entity: Entity;
  entities: readonly Entity[];
}) {
  const id = useId();
  const add = useAddLink(campaignId);
  const [form, setForm] = useState({ otherId: '', label: '', reverseLabel: '', hidden: false });
  const others = entities.filter(e => e.id !== entity.id);
  const otherName = others.find(e => e.id === form.otherId)?.name ?? 'the other';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    add.mutate(
      {
        fromId: entity.id,
        toId: form.otherId,
        label: form.label,
        reverseLabel: form.reverseLabel,
        hidden: form.hidden,
      },
      { onSuccess: () => setForm({ otherId: '', label: '', reverseLabel: '', hidden: false }) },
    );
  }

  return (
    <form onSubmit={onSubmit} className={styles.addLink} aria-label="Add a relationship" noValidate>
      <h5 className={styles.subTitle}>Add a relationship</h5>
      <label htmlFor={`${id}-other`}>With</label>
      <select
        id={`${id}-other`}
        value={form.otherId}
        onChange={e => setForm(f => ({ ...f, otherId: e.target.value }))}
        className={styles.select}
      >
        <option value="">Choose an entity</option>
        {others.map(o => (
          <option key={o.id} value={o.id}>
            {`${o.name} (${ENTITY_TYPE_LABELS[o.type]})`}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-ab`}>{`${entity.name} …`}</label>
      <Input
        id={`${id}-ab`}
        placeholder="owns"
        maxLength={80}
        value={form.label}
        onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
      />
      <label htmlFor={`${id}-ba`}>{`${otherName} …`}</label>
      <Input
        id={`${id}-ba`}
        placeholder="is owned by"
        maxLength={80}
        value={form.reverseLabel}
        onChange={e => setForm(f => ({ ...f, reverseLabel: e.target.value }))}
      />
      <Toggle checked={form.hidden} onChange={hidden => setForm(f => ({ ...f, hidden }))} label="Hidden from players" />
      {add.isError && (
        <p role="alert" className={styles.error}>
          {friendlyMessage(add.error)}
        </p>
      )}
      <Button type="submit" className={iconClasses.host} disabled={!form.otherId || add.isPending}>
        <Link2 {...ICON_PROPS} className={iconClasses.icon} />
        Add relationship
      </Button>
    </form>
  );
}
