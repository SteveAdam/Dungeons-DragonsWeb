// P3-7: notes and session logs with their in-game date. Enough of the Notes tab to date them; the rest of the notes
// spread comes with its own ticket.
import { Pencil, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { GameDatePicker } from '../../../components/GameDatePicker';
import { Button, ICON_PROPS, iconClasses, Input, Tag } from '../../../components/ui';
import type { Note, NoteKind } from '../../../data/notes';
import { friendlyMessage } from '../../../data/errors';
import { useCalendar, useDeleteNote, useNotes, useSaveNote } from '../../../hooks/useCalendar';
import { dayLabel } from '../../../lib/gameClock';
import styles from './calendar.module.css';

function NoteForm({ campaignId, note, onDone }: { campaignId: string; note: Note | null; onDone: () => void }) {
  const id = useId();
  const calendar = useCalendar(campaignId);
  const save = useSaveNote(campaignId);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? 'note');
  const [sessionNo, setSessionNo] = useState(note?.sessionNo ? String(note.sessionNo) : '');
  const [visible, setVisible] = useState(note?.visibleToPlayers ?? false);
  const [day, setDay] = useState<number | null>(note?.ingameDay ?? null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const session = Number(sessionNo);
    save.mutate(
      {
        id: note?.id,
        draft: {
          title,
          body,
          kind,
          sessionNo: kind === 'session' && Number.isInteger(session) && session > 0 ? session : null,
          visibleToPlayers: visible,
          ingameDay: day,
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form className={styles.noteForm} aria-label={note ? `Change ${note.title}` : 'New note'} onSubmit={submit}>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor={`${id}-title`}>Title</label>
          <Input id={`${id}-title`} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-kind`}>Kind</label>
          <select
            id={`${id}-kind`}
            className={styles.select}
            value={kind}
            onChange={e => setKind(e.target.value as NoteKind)}
          >
            <option value="note">Note</option>
            <option value="session">Session log</option>
          </select>
        </div>
        {kind === 'session' && (
          <div className={styles.field}>
            <label htmlFor={`${id}-session`}>Session number</label>
            <Input
              id={`${id}-session`}
              type="number"
              min={1}
              value={sessionNo}
              onChange={e => setSessionNo(e.target.value)}
            />
          </div>
        )}
      </div>
      {note?.legacyDate && <p className={styles.hint}>{`Old date text: ${note.legacyDate}`}</p>}
      {calendar.isPending ? (
        <p role="status">Consulting the almanac…</p>
      ) : (
        <GameDatePicker legend="In-game date" calendar={calendar.data ?? null} value={day} onChange={setDay} />
      )}
      <div className={styles.field}>
        <label htmlFor={`${id}-body`}>Text</label>
        <textarea
          id={`${id}-body`}
          className={styles.textarea}
          rows={4}
          value={body}
          onChange={e => setBody(e.target.value)}
        />
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /> Players can see this
      </label>
      <div className={styles.actions}>
        <Button type="submit" disabled={!title.trim() || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {save.isError && (
        <p role="alert" className={styles.problems}>
          {friendlyMessage(save.error)}
        </p>
      )}
    </form>
  );
}

export function NotesTab({ campaignId, dmMode }: { campaignId: string; dmMode: boolean }) {
  const notes = useNotes(campaignId, dmMode);
  const calendar = useCalendar(campaignId);
  const remove = useDeleteNote(campaignId);
  const [editing, setEditing] = useState<Note | 'new' | null>(null);

  if (notes.isPending) return <p role="status">Turning the pages…</p>;
  if (notes.isError) return <ErrorNotice error={notes.error} onRetry={() => void notes.refetch()} />;

  const cal = calendar.data ?? null;
  return (
    <div className={styles.panel}>
      {dmMode &&
        (editing ? (
          <NoteForm
            key={editing === 'new' ? 'new' : editing.id}
            campaignId={campaignId}
            note={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div className={styles.actions}>
            <Button className={iconClasses.host} onClick={() => setEditing('new')}>
              New note
            </Button>
          </div>
        ))}
      {notes.data.length === 0 ? (
        <EmptyState title="No notes yet">
          {dmMode ? 'Write the first one above.' : 'Your DM has not shared any notes.'}
        </EmptyState>
      ) : (
        <ul className={styles.notes}>
          {notes.data.map(note => (
            <li key={note.id} className={styles.note}>
              <div className={styles.noteHead}>
                <h4>{note.title}</h4>
                <Tag>{note.kind === 'session' ? `SESSION${note.sessionNo ? ` ${note.sessionNo}` : ''}` : 'NOTE'}</Tag>
                {dmMode && !note.visibleToPlayers && <Tag>HIDDEN</Tag>}
                {dmMode && (
                  <span className={styles.actions}>
                    <Button variant="ghost" aria-label={`Change ${note.title}`} onClick={() => setEditing(note)}>
                      <Pencil {...ICON_PROPS} />
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`Delete ${note.title}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(note.id)}
                    >
                      <Trash2 {...ICON_PROPS} />
                    </Button>
                  </span>
                )}
              </div>
              {note.ingameDay !== null ? (
                <p className={styles.hint}>{dayLabel(cal, note.ingameDay)}</p>
              ) : note.legacyDate ? (
                <p className={styles.hint}>
                  {note.legacyDate}{' '}
                  {dmMode && (
                    <Button
                      variant="ghost"
                      aria-label={`Convert the date of ${note.title}`}
                      onClick={() => setEditing(note)}
                    >
                      Convert
                    </Button>
                  )}
                </p>
              ) : null}
              {note.body && <p>{note.body}</p>}
            </li>
          ))}
        </ul>
      )}
      {remove.isError && (
        <p role="alert" className={styles.problems}>
          {friendlyMessage(remove.error)}
        </p>
      )}
    </div>
  );
}
