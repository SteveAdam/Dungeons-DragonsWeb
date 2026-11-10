// P3-6: draws the form for a kind of custom entry from its description in customForms.ts.
import { averageDamage, parseDice, type CustomKind, type Definition } from '@dnd-manager/rules-engine';
import { Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, ICON_PROPS, iconClasses, Input } from '../../../components/ui';
import styles from '../Library.module.css';
import { CUSTOM_FORMS, EFFECT_FORMS, getPath, setPath, type Column, type Field, type Option } from './customForms';

type Row = Record<string, unknown>;

function NumberBox({
  id,
  label,
  value,
  onChange,
}: {
  id?: string;
  label?: string;
  value: unknown;
  onChange: (v: number | null) => void;
}) {
  return (
    <Input
      id={id}
      aria-label={label}
      type="number"
      step="any"
      value={typeof value === 'number' ? value : ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

function Choice({
  id,
  label,
  value,
  options,
  blank,
  onChange,
}: {
  id?: string;
  label?: string;
  value: unknown;
  options: readonly Option[];
  blank?: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      className={styles.select}
      value={typeof value === 'string' ? value : ''}
      onChange={e => onChange(e.target.value)}
    >
      {blank !== undefined && <option value="">{blank}</option>}
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}

const damageText = (value: unknown) =>
  Array.isArray(value) ? (value as { dice: string; type: string }[]).map(d => `${d.dice} ${d.type}`).join('; ') : '';

/** "1d6 + 2 piercing; 2d6 fire" as damage lines, or null if it does not read. */
function parseDamage(text: string) {
  const parts = text
    .split(';')
    .map(p => p.trim())
    .filter(Boolean);
  const lines = parts.map(part => {
    const m = /^(.+?)\s+([a-z]+)$/i.exec(part);
    return m && parseDice(m[1]) ? { average: Math.floor(averageDamage(m[1])), dice: m[1], type: m[2] } : null;
  });
  return lines.every(Boolean) ? lines : null;
}

/** Typed as words, kept as damage lines; what cannot be read yet stays in the box and is not saved. */
function DamageBox({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => damageText(value));
  const [bad, setBad] = useState(false);
  return (
    <Input
      aria-label={label}
      aria-invalid={bad || undefined}
      placeholder="1d6 + 2 piercing"
      value={text}
      onChange={e => {
        setText(e.target.value);
        const parsed = parseDamage(e.target.value);
        setBad(parsed === null);
        if (parsed) onChange(parsed);
      }}
    />
  );
}

function CellInput({
  column,
  row,
  label,
  onChange,
}: {
  column: Column;
  row: Row;
  label: string;
  onChange: (r: Row) => void;
}) {
  const value = row[column.key];
  const put = (v: unknown) => {
    const copy = { ...row, [column.key]: v };
    if (column.optional && (v === '' || v === null || v === false)) delete copy[column.key];
    onChange(copy);
  };
  switch (column.type) {
    case 'number':
      return <NumberBox label={label} value={value} onChange={put} />;
    case 'select':
      return <Choice label={label} value={value} options={column.options} onChange={put} />;
    case 'bool':
      return (
        <label className={styles.check}>
          <input type="checkbox" checked={value === true} onChange={e => put(e.target.checked)} /> {column.label}
        </label>
      );
    case 'damage':
      return <DamageBox label={label} value={value} onChange={put} />;
    case 'textarea':
      return (
        <textarea
          aria-label={label}
          className={styles.textarea}
          rows={2}
          value={typeof value === 'string' ? value : ''}
          onChange={e => put(e.target.value)}
        />
      );
    default:
      return (
        <Input aria-label={label} value={typeof value === 'string' ? value : ''} onChange={e => put(e.target.value)} />
      );
  }
}

/** A list typed with commas: the words stay as typed, so a trailing comma is not lost mid-word. */
function StringsBox({ id, value, onChange }: { id: string; value: unknown; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(() => (Array.isArray(value) ? value.join(', ') : ''));
  return (
    <Input
      id={id}
      value={text}
      onChange={e => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}

const singular = (label: string) => label.replace(/ies$/, 'y').replace(/s$/, '').toLowerCase();

function RowList({
  field,
  value,
  onChange,
}: {
  field: Extract<Field, { type: 'rows' }>;
  value: unknown;
  onChange: (v: Row[]) => void;
}) {
  const rows = (Array.isArray(value) ? value : []) as Row[];
  const put = (n: number, row: Row) => onChange(rows.map((r, m) => (m === n ? row : r)));
  return (
    <fieldset className={styles.rowList}>
      <legend>{field.label}</legend>
      {field.hint && <p className={styles.hint}>{field.hint}</p>}
      {rows.map((row, n) => (
        // keyed by length too, so a removed row's typed damage text does not stay behind in the next one
        <div key={`${rows.length}-${n}`} className={styles.row}>
          {field.columns.map(column => (
            <div key={column.key} className={column.type === 'textarea' ? styles.rowWide : undefined}>
              <CellInput
                column={column}
                row={row}
                label={`${field.label} ${n + 1}: ${column.label}`}
                onChange={r => put(n, r)}
              />
            </div>
          ))}
          <Button
            variant="ghost"
            aria-label={`Remove ${singular(field.label)} ${n + 1}`}
            onClick={() => onChange(rows.filter((_, m) => m !== n))}
          >
            <Trash2 {...ICON_PROPS} />
          </Button>
        </div>
      ))}
      <Button variant="ghost" className={iconClasses.host} onClick={() => onChange([...rows, { ...field.blank }])}>
        <Plus {...ICON_PROPS} className={iconClasses.icon} />
        {`Add ${singular(field.label)}`}
      </Button>
    </fieldset>
  );
}

const EFFECT_OPTIONS: Option[] = Object.entries(EFFECT_FORMS).map(([type, f]) => [type, f.label]);

function EffectList({ label, value, onChange }: { label: string; value: unknown; onChange: (v: Row[]) => void }) {
  const rows = (Array.isArray(value) ? value : []) as Row[];
  const put = (n: number, row: Row) => onChange(rows.map((r, m) => (m === n ? row : r)));
  return (
    <fieldset className={styles.rowList}>
      <legend>{label}</legend>
      <p className={styles.hint}>
        Only these can be calculated. Anything else is kept as words, and the entry is labelled text only.
      </p>
      {rows.map((row, n) => {
        const form = EFFECT_FORMS[String(row.type)];
        return (
          <div key={n} className={styles.row}>
            <Choice
              label={`Effect ${n + 1}`}
              value={row.type}
              options={EFFECT_OPTIONS}
              onChange={type => put(n, { type, ...EFFECT_FORMS[type].blank })}
            />
            {form?.columns.map(column => (
              <div key={column.key}>
                <CellInput
                  column={column}
                  row={row}
                  label={`Effect ${n + 1}: ${column.label}`}
                  onChange={r => put(n, r)}
                />
              </div>
            ))}
            <Button
              variant="ghost"
              aria-label={`Remove effect ${n + 1}`}
              onClick={() => onChange(rows.filter((_, m) => m !== n))}
            >
              <Trash2 {...ICON_PROPS} />
            </Button>
          </div>
        );
      })}
      <Button
        variant="ghost"
        className={iconClasses.host}
        onClick={() => onChange([...rows, { type: 'damage', ...EFFECT_FORMS.damage.blank }])}
      >
        <Plus {...ICON_PROPS} className={iconClasses.icon} />
        Add effect
      </Button>
    </fieldset>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const id = useId();
  const blankIs = field.path === 'rarity' ? null : undefined;
  const clearable = (v: unknown) => (field.optional && (v === '' || v === null) ? blankIs : v);
  if (field.type === 'rows') return <RowList field={field} value={value} onChange={onChange} />;
  if (field.type === 'effects') return <EffectList label={field.label} value={value} onChange={onChange} />;
  if (field.type === 'bool') {
    return (
      <label className={styles.check}>
        <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} /> {field.label}
      </label>
    );
  }
  if (field.type === 'multi') {
    const picked = (Array.isArray(value) ? value : []) as string[];
    return (
      <fieldset className={styles.multi}>
        <legend>{field.label}</legend>
        {field.options.map(([v, text]) => (
          <label key={v} className={styles.check}>
            <input
              type="checkbox"
              checked={picked.includes(v)}
              onChange={e => onChange(e.target.checked ? [...picked, v] : picked.filter(p => p !== v))}
            />{' '}
            {text}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <div className={field.type === 'textarea' ? styles.formWide : styles.filterField}>
      <label htmlFor={id}>{field.label}</label>
      {field.type === 'number' ? (
        <NumberBox id={id} value={value} onChange={v => onChange(clearable(v))} />
      ) : field.type === 'select' ? (
        <Choice
          id={id}
          value={value}
          options={field.options}
          blank={field.optional ? 'None' : undefined}
          onChange={v => onChange(clearable(v))}
        />
      ) : field.type === 'textarea' ? (
        <textarea
          id={id}
          className={styles.textarea}
          rows={4}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(clearable(e.target.value))}
        />
      ) : field.type === 'strings' ? (
        <StringsBox id={id} value={value} onChange={onChange} />
      ) : (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(clearable(e.target.value))}
        />
      )}
      {field.hint && <p className={styles.hint}>{field.hint}</p>}
    </div>
  );
}

interface Props {
  kind: CustomKind;
  value: Definition;
  onChange: (next: Definition) => void;
  /** The challenge ratings the rules have, for a monster. */
  challengeRatings: readonly string[];
}

export function DefinitionForm({ kind, value, onChange, challengeRatings }: Props) {
  const forField = (field: Field): Field =>
    field.path === 'challengeRating' && field.type === 'select'
      ? { ...field, options: challengeRatings.map(cr => [cr, cr] as const) }
      : field;
  return (
    <>
      {CUSTOM_FORMS[kind].map(section => (
        <section key={section.title} aria-label={section.title} className={styles.formSection}>
          <h3>{section.title}</h3>
          <div className={styles.formFields}>
            {section.fields.map(forField).map(field => (
              <FieldInput
                key={field.path}
                field={field}
                value={getPath(value, field.path)}
                onChange={v => onChange(setPath(value, field.path, v))}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
