// P4-4: "Show to…": everyone, one party group, or chosen players. The database works out who that is and tells each of
// them; this form only says who the DM means.
import { useId, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import type { HandoutAudience } from '../../../data/handouts';
import styles from './handouts.module.css';

export interface ShowToPlayer {
  userId: string;
  name: string;
}
export interface ShowToGroup {
  id: string;
  name: string;
}

interface ShowToFormProps {
  title: string;
  players: readonly ShowToPlayer[];
  groups: readonly ShowToGroup[];
  busy: boolean;
  error: unknown;
  onShow: (audience: HandoutAudience) => void;
  onCancel: () => void;
}

export function ShowToForm({ title, players, groups, busy, error, onShow, onCancel }: ShowToFormProps) {
  const id = useId();
  const [kind, setKind] = useState<HandoutAudience['kind']>('everyone');
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (kind === 'group') {
      if (!groupId) return setProblem('There are no party groups yet.');
      onShow({ kind: 'group', groupId });
    } else if (kind === 'players') {
      if (chosen.size === 0) return setProblem('Choose at least one player.');
      onShow({ kind: 'players', userIds: [...chosen] });
    } else {
      onShow({ kind: 'everyone' });
    }
  }

  const message = problem ?? (error ? friendlyMessage(error) : null);

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.formTitle}>{`Show “${title}” to…`}</h3>
      <fieldset className={styles.choices}>
        <legend className="visually-hidden">Who sees it</legend>
        <label className={styles.choice}>
          <input type="radio" name={`${id}-who`} checked={kind === 'everyone'} onChange={() => setKind('everyone')} />
          Everyone
        </label>
        <label className={styles.choice}>
          <input
            type="radio"
            name={`${id}-who`}
            checked={kind === 'group'}
            disabled={groups.length === 0}
            onChange={() => setKind('group')}
          />
          A party group
        </label>
        <label className={styles.choice}>
          <input type="radio" name={`${id}-who`} checked={kind === 'players'} onChange={() => setKind('players')} />
          Chosen players
        </label>
      </fieldset>

      {kind === 'group' && (
        <div className={styles.field}>
          <label htmlFor={`${id}-group`} className={styles.label}>
            Group
          </label>
          <select
            id={`${id}-group`}
            className={styles.select}
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === 'players' && (
        <fieldset className={styles.choices}>
          <legend className={styles.label}>Players</legend>
          {players.length === 0 && <p className={styles.intro}>No players have joined yet.</p>}
          {players.map(p => (
            <label key={p.userId} className={styles.choice}>
              <input
                type="checkbox"
                checked={chosen.has(p.userId)}
                onChange={e =>
                  setChosen(current => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(p.userId);
                    else next.delete(p.userId);
                    return next;
                  })
                }
              />
              {p.name}
            </label>
          ))}
        </fieldset>
      )}

      {message && (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      )}
      <div className={styles.buttons}>
        <Button type="submit" disabled={busy}>
          {busy ? 'Showing…' : 'Show it'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
