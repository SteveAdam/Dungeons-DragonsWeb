import { DISCOVERY_STATES, SKILL_KEYS, SKILLS, type ContentKind, type DiscoveryState } from '@dnd-manager/rules-engine';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import { contentToRow, emptyDraft, type ContentDraft, type RegionContent } from '../../../data/regionContent';
import { useEntities } from '../../../hooks/useEntities';
import { useContentNotes, useDeleteContent, useSaveContent } from '../../../hooks/useRegionContent';
import mapStyles from '../MapView.module.css';
import styles from './content.module.css';
import { KIND_LABELS, STATE_LABELS } from './contentLabels';
import { SpawnRuleEditor } from './SpawnRuleEditor';

interface Props {
  regionId: string;
  campaignId: string;
  /** The entry being edited, or undefined for a new one of `kind`. */
  entry?: RegionContent;
  kind: ContentKind;
  /** The kinds this form may switch between (Finds also holds interactables). */
  kinds: readonly ContentKind[];
  onDone: () => void;
}

const toDraft = (e: RegionContent): ContentDraft => ({
  kind: e.kind,
  name: e.name,
  entityId: e.entityId,
  monsterRef: e.monsterRef,
  description: e.description,
  quantity: e.quantity,
  stock: e.stock,
  state: e.state,
  hintText: e.hintText,
  discoveryDc: e.discoveryDc,
  discoverySkill: e.discoverySkill,
  spawnRule: e.spawnRule,
});

/** Add or edit one region entry, with its DM notes. Only for a DM in DM mode. */
export function ContentForm({ regionId, campaignId, entry, kind, kinds, onDone }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<ContentDraft>(() => (entry ? toDraft(entry) : emptyDraft(kind)));
  const notes = useContentNotes(entry?.id, true);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const save = useSaveContent();
  const remove = useDeleteContent();
  const entities = useEntities(campaignId, true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof ContentDraft>(key: K, value: ContentDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const dmNotes = notesDraft ?? notes.data ?? '';
  const linkable = (entities.data ?? []).filter(e => e.type === 'npc' || e.type === 'item');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      contentToRow(draft); // the same checks the save makes, so the message shows before the request
    } catch (err) {
      setError(friendlyMessage(err));
      return;
    }
    save.mutate(
      { regionId, contentId: entry?.id, draft, dmNotes },
      { onSuccess: onDone, onError: err => setError(friendlyMessage(err)) },
    );
  }

  const title = entry ? `Edit ${entry.name}` : `New ${KIND_LABELS[draft.kind].toLowerCase()}`;
  return (
    <form aria-labelledby={`${id}-title`} className={mapStyles.form} onSubmit={onSubmit} noValidate>
      <h4 id={`${id}-title`} className={styles.title}>
        {title}
      </h4>
      <div className={mapStyles.row}>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-name`}>Name</label>
          <Input id={`${id}-name`} value={draft.name} maxLength={120} onChange={e => set('name', e.target.value)} />
        </div>
        {kinds.length > 1 && (
          <div className={mapStyles.field}>
            <label htmlFor={`${id}-kind`}>Kind</label>
            <select
              id={`${id}-kind`}
              className={mapStyles.select}
              value={draft.kind}
              onChange={e => set('kind', e.target.value as ContentKind)}
            >
              {kinds.map(k => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={mapStyles.row}>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-entity`}>Registry entry (NPC or item)</label>
          <select
            id={`${id}-entity`}
            className={mapStyles.select}
            value={draft.entityId ?? ''}
            onChange={e => set('entityId', e.target.value || null)}
          >
            <option value="">None</option>
            {linkable.map(e => (
              <option key={e.id} value={e.id}>
                {`${e.name} (${e.type === 'npc' ? 'NPC' : 'item'})`}
              </option>
            ))}
          </select>
        </div>
        {draft.kind === 'creature' && (
          <div className={mapStyles.field}>
            <label htmlFor={`${id}-monster`}>Monster reference</label>
            <Input
              id={`${id}-monster`}
              value={draft.monsterRef ?? ''}
              maxLength={120}
              placeholder="e.g. srd:wolf"
              onChange={e => set('monsterRef', e.target.value || null)}
            />
          </div>
        )}
      </div>

      <label htmlFor={`${id}-description`}>Description</label>
      <textarea
        id={`${id}-description`}
        className={mapStyles.textarea}
        rows={3}
        maxLength={4000}
        value={draft.description}
        onChange={e => set('description', e.target.value)}
      />

      <div className={mapStyles.row}>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-state`}>Discovery</label>
          <select
            id={`${id}-state`}
            className={mapStyles.select}
            value={draft.state}
            onChange={e => set('state', e.target.value as DiscoveryState)}
          >
            {DISCOVERY_STATES.map(s => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-skill`}>Discovery skill</label>
          <select
            id={`${id}-skill`}
            className={mapStyles.select}
            value={draft.discoverySkill}
            onChange={e => set('discoverySkill', e.target.value as ContentDraft['discoverySkill'])}
          >
            {SKILL_KEYS.map(s => (
              <option key={s} value={s}>
                {SKILLS[s].label}
              </option>
            ))}
          </select>
        </div>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-dc`}>Discovery DC</label>
          <Input
            id={`${id}-dc`}
            type="number"
            min={1}
            max={40}
            value={draft.discoveryDc ?? ''}
            onChange={e => set('discoveryDc', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      </div>
      <div className={mapStyles.field}>
        <label htmlFor={`${id}-hint`}>Hint (what players notice before they find it)</label>
        <Input
          id={`${id}-hint`}
          value={draft.hintText ?? ''}
          maxLength={300}
          placeholder="e.g. Something glints"
          onChange={e => set('hintText', e.target.value || null)}
        />
      </div>

      {(draft.kind === 'find' || draft.kind === 'interactable') && (
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-quantity`}>Quantity</label>
          <Input
            id={`${id}-quantity`}
            type="number"
            min={0}
            value={draft.quantity ?? ''}
            onChange={e => set('quantity', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      )}

      {draft.kind === 'shop' && (
        <fieldset className={styles.rule}>
          <legend>Stock</legend>
          {draft.stock.map((line, i) => (
            <div key={i} className={styles.stockLine}>
              <div className={mapStyles.field}>
                <label htmlFor={`${id}-item-${i}`}>Item</label>
                <Input
                  id={`${id}-item-${i}`}
                  value={line.itemRef}
                  maxLength={120}
                  onChange={e =>
                    set(
                      'stock',
                      draft.stock.map((l, j) => (j === i ? { ...l, itemRef: e.target.value } : l)),
                    )
                  }
                />
              </div>
              <div className={mapStyles.field}>
                <label htmlFor={`${id}-price-${i}`}>Price (cp)</label>
                <Input
                  id={`${id}-price-${i}`}
                  type="number"
                  min={0}
                  value={Number.isNaN(line.priceCp) ? '' : line.priceCp}
                  onChange={e =>
                    set(
                      'stock',
                      draft.stock.map((l, j) => (j === i ? { ...l, priceCp: Number(e.target.value) } : l)),
                    )
                  }
                />
              </div>
              <Button
                variant="ghost"
                aria-label={`Remove ${line.itemRef || 'this line'}`}
                onClick={() =>
                  set(
                    'stock',
                    draft.stock.filter((_, j) => j !== i),
                  )
                }
              >
                <X {...ICON_PROPS} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            className={iconClasses.host}
            onClick={() => set('stock', [...draft.stock, { itemRef: '', priceCp: 0 }])}
          >
            <Plus {...ICON_PROPS} className={iconClasses.icon} />
            Add stock
          </Button>
        </fieldset>
      )}

      <SpawnRuleEditor rule={draft.spawnRule} onChange={rule => set('spawnRule', rule)} />

      <div className={mapStyles.secret}>
        <label htmlFor={`${id}-notes`}>DM notes (only you see these)</label>
        <textarea
          id={`${id}-notes`}
          className={mapStyles.textarea}
          rows={3}
          maxLength={4000}
          value={dmNotes}
          disabled={!!entry && notes.isPending}
          onChange={e => setNotesDraft(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className={mapStyles.error}>
          {error}
        </p>
      )}
      <div className={mapStyles.actions}>
        <Button type="submit" className={iconClasses.host} disabled={save.isPending}>
          <Save {...ICON_PROPS} className={iconClasses.icon} />
          {save.isPending ? 'Saving…' : 'Save entry'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {entry &&
          (confirmDelete ? (
            <span className={mapStyles.confirm}>
              <span>{`Delete ${entry.name}?`}</span>
              <Button
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(entry.id, {
                    onSuccess: onDone,
                    onError: err => {
                      setError(friendlyMessage(err));
                      setConfirmDelete(false);
                    },
                  })
                }
              >
                Delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button variant="ghost" className={iconClasses.host} onClick={() => setConfirmDelete(true)}>
              <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
              Delete entry
            </Button>
          ))}
      </div>
    </form>
  );
}
