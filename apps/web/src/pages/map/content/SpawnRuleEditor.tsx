import { spawnRuleSummary, validateSpawnRule, type SpawnRule } from '@dnd-manager/rules-engine';
import { useId } from 'react';
import { Input } from '../../../components/ui';
import mapStyles from '../MapView.module.css';
import styles from './content.module.css';

const MODE_LABELS = { always: 'Always', chance: 'By chance', time: 'At a time of day' } as const;
const TIME_LABELS = { any: 'Any time', day: 'By day', night: 'At night' } as const;

/** Mode, chance, time of day and count, with the rule read back in plain words as it is edited. */
export function SpawnRuleEditor({ rule, onChange }: { rule: SpawnRule; onChange: (rule: SpawnRule) => void }) {
  const id = useId();
  const num = (v: string) => (v === '' ? Number.NaN : Number(v));
  const errors = validateSpawnRule(rule);
  return (
    <fieldset className={styles.rule}>
      <legend>Spawn rule</legend>
      <div className={mapStyles.row}>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-mode`}>When</label>
          <select
            id={`${id}-mode`}
            className={mapStyles.select}
            value={rule.mode}
            onChange={e => onChange({ ...rule, mode: e.target.value as SpawnRule['mode'] })}
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {rule.mode === 'chance' && (
          <div className={mapStyles.field}>
            <label htmlFor={`${id}-chance`}>Chance (%)</label>
            <Input
              id={`${id}-chance`}
              type="number"
              min={0}
              max={100}
              value={Number.isNaN(rule.chance) ? '' : rule.chance}
              onChange={e => onChange({ ...rule, chance: num(e.target.value) })}
            />
          </div>
        )}
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-time`}>Time of day</label>
          <select
            id={`${id}-time`}
            className={mapStyles.select}
            value={rule.timeOfDay}
            onChange={e => onChange({ ...rule, timeOfDay: e.target.value as SpawnRule['timeOfDay'] })}
          >
            {Object.entries(TIME_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={mapStyles.row}>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-min`}>At least</label>
          <Input
            id={`${id}-min`}
            type="number"
            min={0}
            max={100}
            value={Number.isNaN(rule.count.min) ? '' : rule.count.min}
            onChange={e => onChange({ ...rule, count: { ...rule.count, min: num(e.target.value) } })}
          />
        </div>
        <div className={mapStyles.field}>
          <label htmlFor={`${id}-max`}>At most</label>
          <Input
            id={`${id}-max`}
            type="number"
            min={0}
            max={100}
            value={Number.isNaN(rule.count.max) ? '' : rule.count.max}
            onChange={e => onChange({ ...rule, count: { ...rule.count, max: num(e.target.value) } })}
          />
        </div>
      </div>
      <p className={styles.summary} aria-live="polite">
        {errors.length > 0 ? errors[0] : spawnRuleSummary(rule)}
      </p>
    </fieldset>
  );
}
