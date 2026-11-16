// P4-4: making or changing a handout. A text handout is written here (plain text, up to 8,000 characters); an image
// handout takes a PNG, JPG or WebP of up to 10 MB and an optional caption. The kind is fixed once made.
import { useId, useState, type FormEvent } from 'react';
import { Button, Input } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import {
  HANDOUT_BODY_MAX,
  HANDOUT_TITLE_MAX,
  type Handout,
  type HandoutInput,
  type HandoutKind,
} from '../../../data/handouts';
import { validateHandoutImageFile } from '../../../lib/storage';
import styles from './handouts.module.css';

interface HandoutFormProps {
  /** The handout being changed, or none for a new one. */
  handout?: Handout;
  busy: boolean;
  error: unknown;
  onSave: (input: HandoutInput) => void;
  onCancel: () => void;
}

export function HandoutForm({ handout, busy, error, onSave, onCancel }: HandoutFormProps) {
  const id = useId();
  const [title, setTitle] = useState(handout?.title ?? '');
  const [kind, setKind] = useState<HandoutKind>(handout?.kind ?? 'text');
  const [body, setBody] = useState(handout?.body ?? '');
  const [image, setImage] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (kind === 'image' && !image && !handout?.imagePath) {
      setProblem('Choose an image for the handout.');
      return;
    }
    onSave({ title, kind, body, image });
  }

  const message = problem ?? (error ? friendlyMessage(error) : null);

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.formTitle}>
        {handout ? `Change “${handout.title}”` : 'A new handout'}
      </h3>
      <div className={styles.field}>
        <label htmlFor={`${id}-name`} className={styles.label}>
          Title
        </label>
        <Input
          id={`${id}-name`}
          value={title}
          maxLength={HANDOUT_TITLE_MAX}
          required
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {!handout && (
        <fieldset className={styles.choices}>
          <legend className={styles.label}>Kind</legend>
          {(['text', 'image'] as const).map(k => (
            <label key={k} className={styles.choice}>
              <input type="radio" name={`${id}-kind`} checked={kind === k} onChange={() => setKind(k)} />
              {k === 'text' ? 'Text' : 'Image'}
            </label>
          ))}
        </fieldset>
      )}

      {kind === 'image' && (
        <div className={styles.field}>
          <label htmlFor={`${id}-image`} className={styles.label}>
            {handout?.imagePath
              ? 'Replace the image (PNG, JPG or WebP, up to 10 MB)'
              : 'Image (PNG, JPG or WebP, up to 10 MB)'}
          </label>
          <input
            id={`${id}-image`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e => {
              const file = e.target.files?.[0] ?? null;
              setProblem(null);
              if (file) {
                try {
                  validateHandoutImageFile(file);
                } catch (err) {
                  setProblem(friendlyMessage(err));
                  setImage(null);
                  return;
                }
              }
              setImage(file);
            }}
          />
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor={`${id}-body`} className={styles.label}>
          {kind === 'text' ? 'Text (shown exactly as written, line breaks and all)' : 'Caption (optional)'}
        </label>
        <textarea
          id={`${id}-body`}
          className={styles.textarea}
          value={body}
          maxLength={HANDOUT_BODY_MAX}
          required={kind === 'text'}
          onChange={e => setBody(e.target.value)}
        />
        <span
          className={styles.count}
        >{`${body.length.toLocaleString('en')} / ${HANDOUT_BODY_MAX.toLocaleString('en')}`}</span>
      </div>

      {message && (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      )}
      <div className={styles.buttons}>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : handout ? 'Save changes' : 'Make the handout'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
