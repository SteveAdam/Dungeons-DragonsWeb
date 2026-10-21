import { Music, Save, Trash2, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Paper, Tag, Toggle } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import { PIN_SIZE, PIN_TYPES, validatePinChanges, type Pin, type PinChanges, type PinType } from '../../data/pins';
import { useDeletePin, usePinNotes, useSavePinNotes, useUpdatePin } from '../../hooks/useMapView';
import { PIN_TYPE_ICONS, PIN_TYPE_LABELS } from './pinIcons';
import styles from './MapView.module.css';

interface Props {
  pin: Pin;
  mapId: string;
  /** DM with DM mode on: the editor, with DM notes. Otherwise a read-only view without them. */
  canEdit: boolean;
  onClose: () => void;
}

const splitList = (text: string) =>
  text
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

function PinView({ pin }: { pin: Pin }) {
  const Icon = PIN_TYPE_ICONS[pin.type];
  return (
    <div className={styles.view}>
      <p className={styles.type}>
        <Icon {...ICON_PROPS} />
        {PIN_TYPE_LABELS[pin.type]}
      </p>
      {pin.description && <p className={styles.prose}>{pin.description}</p>}
      {pin.history && (
        <>
          <h3 className={styles.fieldHeading}>History</h3>
          <p className={styles.prose}>{pin.history}</p>
        </>
      )}
      {pin.traits.length > 0 && (
        <>
          <h3 className={styles.fieldHeading}>Traits</h3>
          <p className={styles.tags}>
            {pin.traits.map(t => (
              <Tag key={t}>{t}</Tag>
            ))}
          </p>
        </>
      )}
      {pin.tags.length > 0 && (
        <>
          <h3 className={styles.fieldHeading}>Tags</h3>
          <p className={styles.tags}>
            {pin.tags.map(t => (
              <Tag key={t}>{t}</Tag>
            ))}
          </p>
        </>
      )}
      {pin.musicUrl && (
        <a href={pin.musicUrl} target="_blank" rel="noopener noreferrer" className={iconClasses.host}>
          <Music {...ICON_PROPS} className={iconClasses.icon} />
          Play the music
        </a>
      )}
    </div>
  );
}

function PinEditor({ pin, mapId, onClose }: { pin: Pin; mapId: string; onClose: () => void }) {
  const id = useId();
  const update = useUpdatePin(mapId);
  const remove = useDeletePin(mapId);
  const notes = usePinNotes(pin.id, true);
  const saveNotes = useSavePinNotes();
  const [draft, setDraft] = useState({
    title: pin.title,
    type: pin.type,
    color: pin.color,
    size: String(pin.size),
    visibleToPlayers: pin.visibleToPlayers,
    description: pin.description,
    history: pin.history,
    traits: pin.traits.join(', '),
    tags: pin.tags.join(', '),
    musicUrl: pin.musicUrl ?? '',
  });
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft(d => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const notesValue = notesDraft ?? notes.data ?? '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let changes: PinChanges;
    try {
      changes = validatePinChanges({
        title: draft.title,
        type: draft.type,
        color: draft.color,
        size: Number(draft.size),
        visibleToPlayers: draft.visibleToPlayers,
        description: draft.description,
        history: draft.history,
        traits: splitList(draft.traits),
        tags: splitList(draft.tags),
        musicUrl: draft.musicUrl,
      });
    } catch (validationError) {
      setError(friendlyMessage(validationError));
      return;
    }
    try {
      await update.mutateAsync({ pinId: pin.id, changes });
      if (notesDraft !== null && notesDraft !== (notes.data ?? '')) {
        await saveNotes.mutateAsync({ pinId: pin.id, notes: notesDraft });
        setNotesDraft(null);
      }
      setSaved(true);
    } catch (saveError) {
      setError(friendlyMessage(saveError));
    }
  }

  return (
    <form onSubmit={onSubmit} className={styles.form} aria-label="Edit pin">
      <label htmlFor={`${id}-title`}>Title</label>
      <Input
        id={`${id}-title`}
        value={draft.title}
        maxLength={120}
        required
        onChange={e => set('title', e.target.value)}
      />

      <label htmlFor={`${id}-type`}>Type</label>
      <select
        id={`${id}-type`}
        value={draft.type}
        onChange={e => set('type', e.target.value as PinType)}
        className={styles.select}
      >
        {PIN_TYPES.map(t => (
          <option key={t} value={t}>
            {PIN_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={`${id}-color`}>Colour</label>
          <span className={styles.colorRow}>
            <input
              type="color"
              aria-label="Colour picker"
              value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#000000'}
              onChange={e => set('color', e.target.value.toUpperCase())}
              className={styles.colorPicker}
            />
            <Input id={`${id}-color`} value={draft.color} maxLength={7} onChange={e => set('color', e.target.value)} />
          </span>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-size`}>{`Size (${PIN_SIZE.min}–${PIN_SIZE.max})`}</label>
          <Input
            id={`${id}-size`}
            type="number"
            min={PIN_SIZE.min}
            max={PIN_SIZE.max}
            value={draft.size}
            onChange={e => set('size', e.target.value)}
          />
        </div>
      </div>

      <Toggle checked={draft.visibleToPlayers} onChange={v => set('visibleToPlayers', v)} label="Visible to players" />

      <label htmlFor={`${id}-description`}>Description</label>
      <textarea
        id={`${id}-description`}
        rows={3}
        value={draft.description}
        onChange={e => set('description', e.target.value)}
        className={styles.textarea}
      />
      <label htmlFor={`${id}-history`}>History</label>
      <textarea
        id={`${id}-history`}
        rows={3}
        value={draft.history}
        onChange={e => set('history', e.target.value)}
        className={styles.textarea}
      />
      <label htmlFor={`${id}-traits`}>Traits (separate with commas)</label>
      <Input id={`${id}-traits`} value={draft.traits} onChange={e => set('traits', e.target.value)} />
      <label htmlFor={`${id}-tags`}>Tags (separate with commas)</label>
      <Input id={`${id}-tags`} value={draft.tags} onChange={e => set('tags', e.target.value)} />
      <label htmlFor={`${id}-music`}>Music link (https only)</label>
      <Input
        id={`${id}-music`}
        type="url"
        inputMode="url"
        placeholder="https://"
        value={draft.musicUrl}
        onChange={e => set('musicUrl', e.target.value)}
      />

      <div className={styles.secret}>
        <label htmlFor={`${id}-notes`}>DM notes (never shown to players)</label>
        {notes.isError ? (
          <p role="alert" className={styles.error}>
            {friendlyMessage(notes.error)}
          </p>
        ) : (
          <textarea
            id={`${id}-notes`}
            rows={4}
            value={notesValue}
            disabled={notes.isPending}
            placeholder={notes.isPending ? 'Unsealing the notes…' : ''}
            onChange={e => {
              setNotesDraft(e.target.value);
              setSaved(false);
            }}
            className={styles.textarea}
          />
        )}
      </div>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className={styles.saved}>
          Saved
        </p>
      )}

      <div className={styles.actions}>
        <Button type="submit" className={iconClasses.host} disabled={update.isPending || saveNotes.isPending}>
          <Save {...ICON_PROPS} className={iconClasses.icon} />
          {update.isPending || saveNotes.isPending ? 'Saving…' : 'Save pin'}
        </Button>
        {confirmDelete ? (
          <span className={styles.confirm}>
            <span>Delete this pin?</span>
            <Button
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(pin.id, {
                  onSuccess: onClose,
                  onError: e => {
                    setError(friendlyMessage(e));
                    setConfirmDelete(false);
                  },
                })
              }
            >
              {remove.isPending ? 'Deleting…' : 'Yes, delete'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button variant="ghost" className={iconClasses.host} onClick={() => setConfirmDelete(true)}>
            <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
            Delete pin
          </Button>
        )}
      </div>
    </form>
  );
}

/** The right-hand panel (a bottom sheet on phones) for the selected pin. */
export function PinPanel({ pin, mapId, canEdit, onClose }: Props) {
  return (
    <Paper as="aside" texture="flat" aria-label={`Pin: ${pin.title}`} className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{pin.title}</h2>
        {!pin.visibleToPlayers && <Tag>Hidden from players</Tag>}
        <Button variant="ghost" aria-label="Close the pin panel" onClick={onClose} className={styles.close}>
          <X {...ICON_PROPS} />
        </Button>
      </header>
      {/* key: a different pin starts a fresh form */}
      {canEdit ? <PinEditor key={pin.id} pin={pin} mapId={mapId} onClose={onClose} /> : <PinView pin={pin} />}
    </Paper>
  );
}
