// P2-11: the Details tab. The owner (or the DM) writes it; each change is saved a moment after typing stops, and
// the tab says whether it is saved. Text is shown and stored as plain text, within each field's limit.
import { ALIGNMENTS } from '@dnd-manager/rules-engine';
import {
  Anchor,
  BookOpen,
  Crown,
  Feather,
  Flame,
  Gem,
  KeyRound,
  Leaf,
  Moon,
  Mountain,
  PawPrint,
  Shield,
  Skull,
  Star,
  Sun,
  Sword,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { ICON_PROPS, Input } from '../../../components/ui';
import {
  DETAIL_LIMITS,
  SYMBOLS,
  type CharacterDetailsData,
  type CharacterSymbol,
  type DetailField,
} from '../../../data/details';
import { friendlyMessage } from '../../../data/errors';
import { useDetails, useSaveDetails } from '../../../hooks/useSpells';
import styles from './spells.module.css';

const SYMBOL_ICONS: Record<CharacterSymbol, LucideIcon> = {
  shield: Shield,
  sword: Sword,
  crown: Crown,
  skull: Skull,
  flame: Flame,
  moon: Moon,
  sun: Sun,
  star: Star,
  feather: Feather,
  leaf: Leaf,
  anchor: Anchor,
  book: BookOpen,
  gem: Gem,
  key: KeyRound,
  mountain: Mountain,
  paw: PawPrint,
};

const SHORT: { key: DetailField; label: string }[] = [
  { key: 'age', label: 'Age' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'eyes', label: 'Eyes' },
  { key: 'skin', label: 'Skin' },
  { key: 'hair', label: 'Hair' },
];
const LONG: { key: DetailField; label: string; rows: number }[] = [
  { key: 'appearance', label: 'Character appearance', rows: 3 },
  { key: 'backstory', label: 'Backstory', rows: 6 },
  { key: 'personalityTraits', label: 'Personality traits', rows: 2 },
  { key: 'ideals', label: 'Ideals', rows: 2 },
  { key: 'bonds', label: 'Bonds', rows: 2 },
  { key: 'flaws', label: 'Flaws', rows: 2 },
  { key: 'allies', label: 'Allies and organisations', rows: 3 },
  { key: 'treasure', label: 'Treasure', rows: 3 },
  { key: 'languages', label: 'Languages', rows: 2 },
];
const AUTOSAVE_MS = 800;

export function DetailsTab({ characterId, campaignId }: { characterId: string; campaignId: string }) {
  const details = useDetails(characterId);
  if (details.isError) return <ErrorNotice error={details.error} onRetry={() => details.refetch()} />;
  if (!details.data)
    return (
      <p role="status" className={styles.muted}>
        Reading the character’s story…
      </p>
    );
  return <DetailsForm characterId={characterId} campaignId={campaignId} initial={details.data} />;
}

function DetailsForm({
  characterId,
  campaignId,
  initial,
}: {
  characterId: string;
  campaignId: string;
  initial: CharacterDetailsData;
}) {
  const id = useId();
  const save = useSaveDetails(characterId, campaignId);
  const [data, setData] = useState<CharacterDetailsData>(initial);
  const [dirty, setDirty] = useState(false);
  const { mutate } = save;

  // save a moment after the last change
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      setDirty(false);
      mutate(data);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [data, dirty, mutate]);

  const set = (key: DetailField, value: string) => {
    setData(d => ({ ...d, [key]: value.slice(0, DETAIL_LIMITS[key]) }));
    setDirty(true);
  };
  const status = dirty || save.isPending ? 'Saving…' : save.isError ? '' : save.isSuccess ? 'Saved' : 'All saved';

  return (
    <form className={styles.tab} aria-label="Character details" onSubmit={e => e.preventDefault()}>
      <p role="status" className={styles.saved}>
        {status}
      </p>
      {save.isError && (
        <p role="alert" className={styles.alert}>
          {`Not saved: ${friendlyMessage(save.error)}`}
        </p>
      )}

      <fieldset className={styles.symbols}>
        <legend className={styles.label}>Symbol</legend>
        {SYMBOLS.map(s => {
          const Icon = SYMBOL_ICONS[s];
          return (
            <label key={s} className={styles.symbol} title={s}>
              <input
                type="radio"
                name={`${id}-symbol`}
                value={s}
                checked={data.symbol === s}
                aria-label={s}
                onChange={() => {
                  setData(d => ({ ...d, symbol: s }));
                  setDirty(true);
                }}
              />
              <Icon {...ICON_PROPS} />
            </label>
          );
        })}
      </fieldset>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-alignment`} className={styles.label}>
            Alignment
          </label>
          <select
            id={`${id}-alignment`}
            value={data.alignment ?? ''}
            onChange={e => set('alignment', e.target.value)}
            className={styles.select}
          >
            <option value="">None chosen</option>
            {ALIGNMENTS.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {SHORT.map(f => (
          <div key={f.key} className={styles.field}>
            <label htmlFor={`${id}-${f.key}`} className={styles.label}>
              {f.label}
            </label>
            <Input
              id={`${id}-${f.key}`}
              value={data[f.key] ?? ''}
              maxLength={DETAIL_LIMITS[f.key]}
              onChange={e => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {LONG.map(f => (
        <div key={f.key} className={styles.field}>
          <label htmlFor={`${id}-${f.key}`} className={styles.label}>
            {f.label}
          </label>
          <textarea
            id={`${id}-${f.key}`}
            rows={f.rows}
            value={data[f.key] ?? ''}
            maxLength={DETAIL_LIMITS[f.key]}
            onChange={e => set(f.key, e.target.value)}
            className={styles.textarea}
          />
          <span className={styles.count}>{`${(data[f.key] ?? '').length} / ${DETAIL_LIMITS[f.key]}`}</span>
        </div>
      ))}
    </form>
  );
}
