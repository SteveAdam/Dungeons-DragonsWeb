// P4-6: the small editors of the dialogue tool: a line's response options, a line's condition, and the skill picker.
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_KEYS,
  SKILLS,
  type DialogueConditionType,
} from '@dnd-manager/rules-engine';
import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button, ICON_PROPS, iconClasses, Input } from '../../components/ui';
import { OPTION_LABEL_MAX, OPTIONS_MAX, type DialogueOption, type OptionKind } from '../../data/dialogue';
import styles from './dialogue.module.css';

/** Every skill, then every ability, for a check. */
export function SkillSelect({
  id,
  value,
  onChange,
  abilitiesOnly = false,
}: {
  id: string;
  value: string;
  onChange: (key: string) => void;
  abilitiesOnly?: boolean;
}) {
  return (
    <select id={id} className={styles.select} value={value} onChange={e => onChange(e.target.value)}>
      {!abilitiesOnly && (
        <optgroup label="Skills">
          {SKILL_KEYS.map(k => (
            <option key={k} value={k}>
              {SKILLS[k].label}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Abilities">
        {ABILITY_KEYS.map(k => (
          <option key={k} value={k}>
            {ABILITY_LABELS[k].label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

const KIND_WORDS: Record<OptionKind, string> = { say: 'Say', check: 'Check', end: 'End the talk' };

/** A line's response options: say something, make a check, or end the talk (at most six). */
export function OptionsEditor({
  options,
  onChange,
}: {
  options: readonly DialogueOption[];
  onChange: (next: DialogueOption[]) => void;
}) {
  const id = useId();
  const set = (i: number, o: DialogueOption) => onChange(options.map((x, j) => (j === i ? o : x)));
  return (
    <div className={styles.section}>
      <span className={styles.label}>Response options</span>
      {options.length > 0 && (
        <ul className={styles.optionList} aria-label="Response options">
          {options.map((o, i) => (
            <li key={i} className={styles.optionRow}>
              <label className={styles.field}>
                <span className={styles.label}>{`Option ${i + 1}`}</span>
                <Input
                  value={o.label}
                  maxLength={OPTION_LABEL_MAX}
                  onChange={e => set(i, { ...o, label: e.target.value })}
                  aria-label={`Option ${i + 1} label`}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Kind</span>
                <select
                  className={styles.select}
                  value={o.kind}
                  aria-label={`Option ${i + 1} kind`}
                  onChange={e => {
                    const kind = e.target.value as OptionKind;
                    set(
                      i,
                      kind === 'check'
                        ? { label: o.label, kind, check: o.check ?? { skill: 'persuasion', dc: 13, showOdds: true } }
                        : { label: o.label, kind },
                    );
                  }}
                >
                  {(['say', 'check', 'end'] as const).map(k => (
                    <option key={k} value={k}>
                      {KIND_WORDS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {o.kind === 'check' && o.check && (
                <>
                  <label className={styles.field}>
                    <span className={styles.label}>Skill</span>
                    <SkillSelect
                      id={`${id}-skill-${i}`}
                      value={o.check.skill}
                      onChange={skill => set(i, { ...o, check: { ...o.check!, skill } })}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>DC</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className={`${styles.input} ${styles.short}`}
                      value={o.check.dc}
                      aria-label={`Option ${i + 1} DC`}
                      onChange={e =>
                        set(i, {
                          ...o,
                          check: { ...o.check!, dc: Math.min(30, Math.max(1, Number(e.target.value) || 1)) },
                        })
                      }
                    />
                  </label>
                  <label className={styles.choice}>
                    <input
                      type="checkbox"
                      checked={o.check.showOdds}
                      onChange={e => set(i, { ...o, check: { ...o.check!, showOdds: e.target.checked } })}
                    />
                    Show the odds
                  </label>
                </>
              )}
              <Button
                variant="ghost"
                aria-label={`Remove option ${i + 1}`}
                onClick={() => onChange(options.filter((_, j) => j !== i))}
              >
                <Trash2 {...ICON_PROPS} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {options.length < OPTIONS_MAX && (
        <div>
          <Button
            variant="ghost"
            className={iconClasses.host}
            onClick={() => onChange([...options, { label: '', kind: 'say' }])}
          >
            <Plus {...ICON_PROPS} className={iconClasses.icon} />
            Add an option
          </Button>
        </div>
      )}
    </div>
  );
}

const CONDITION_WORDS: Record<DialogueConditionType | 'none', string> = {
  none: 'Always',
  always: 'Always',
  has_item: 'Someone carries an item',
  in_region: 'The group is in a region',
  level_at_least: 'Someone has reached a level',
  is_party_member: 'A character is in the group',
};

/** When a line suits a group: always, or one of the engine's conditions. */
export function ConditionEditor({
  condition,
  onChange,
  regions,
  characters,
}: {
  condition: unknown;
  onChange: (next: unknown) => void;
  regions: readonly { id: string; name: string }[];
  characters: readonly { id: string; name: string }[];
}) {
  const id = useId();
  const c = (condition ?? null) as Record<string, unknown> | null;
  const type = (c?.type as DialogueConditionType | undefined) ?? 'none';
  return (
    <div className={styles.row}>
      <label className={styles.field}>
        <span className={styles.label}>When it suits</span>
        <select
          id={`${id}-type`}
          className={styles.select}
          value={type === 'always' ? 'none' : type}
          onChange={e => {
            const t = e.target.value;
            if (t === 'none') onChange(null);
            else if (t === 'has_item') onChange({ type: t, item: '' });
            else if (t === 'in_region') onChange({ type: t, regionId: regions[0]?.id ?? '' });
            else if (t === 'level_at_least') onChange({ type: t, level: 3 });
            else if (t === 'is_party_member') onChange({ type: t, characterId: characters[0]?.id ?? '' });
          }}
        >
          {(['none', 'has_item', 'in_region', 'level_at_least', 'is_party_member'] as const).map(t => (
            <option key={t} value={t}>
              {CONDITION_WORDS[t]}
            </option>
          ))}
        </select>
      </label>
      {type === 'has_item' && (
        <label className={styles.field}>
          <span className={styles.label}>Item name</span>
          <Input value={String(c?.item ?? '')} onChange={e => onChange({ type, item: e.target.value })} />
        </label>
      )}
      {type === 'in_region' && (
        <label className={styles.field}>
          <span className={styles.label}>Region</span>
          <select
            className={styles.select}
            value={String(c?.regionId ?? '')}
            onChange={e => onChange({ type, regionId: e.target.value })}
          >
            {regions.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {type === 'level_at_least' && (
        <label className={styles.field}>
          <span className={styles.label}>Level</span>
          <input
            type="number"
            min={1}
            max={20}
            className={`${styles.input} ${styles.short}`}
            value={Number(c?.level ?? 1)}
            onChange={e => onChange({ type, level: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </label>
      )}
      {type === 'is_party_member' && (
        <label className={styles.field}>
          <span className={styles.label}>Character</span>
          <select
            className={styles.select}
            value={String(c?.characterId ?? '')}
            onChange={e => onChange({ type, characterId: e.target.value })}
          >
            {characters.map(ch => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
