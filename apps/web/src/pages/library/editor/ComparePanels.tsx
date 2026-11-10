// P3-6: a variant beside its SRD baseline with the changes marked, and the balance guide under it.
import { balanceReport, diffDefinitions, type CustomKind, type Definition } from '@dnd-manager/rules-engine';
import { CR_BENCHMARKS } from '@dnd-manager/srd-data/benchmarks';
import { useMemo } from 'react';
import { useSrdSpells, useSrdWeapons } from '../../../hooks/useLibrary';
import styles from '../Library.module.css';
import { CUSTOM_FORMS, getPath, pathLabel } from './customForms';

function shown(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(shown).join(', ') : '—';
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.name === 'string' && typeof o.description === 'string') return `${o.name}: ${o.description}`;
    if (typeof o.name === 'string') return o.name;
    return Object.values(o).map(shown).join(' ');
  }
  return String(value);
}

interface CompareProps {
  kind: CustomKind;
  parentName: string;
  parent: Definition;
  variantName: string;
  variant: Definition;
}

export function ComparePanel({ kind, parentName, parent, variantName, variant }: CompareProps) {
  const changes = useMemo(() => diffDefinitions(parent, variant), [parent, variant]);
  const changed = new Map(changes.map(c => [c.path, c]));
  const keyFields = CUSTOM_FORMS[kind].flatMap(s => s.fields).filter(f => f.key);
  const rows = [
    ...keyFields.map(f => ({ path: f.path, before: getPath(parent, f.path), after: getPath(variant, f.path) })),
    ...changes.filter(c => !keyFields.some(f => f.path === c.path)),
  ];
  return (
    <section aria-label="Compare with the baseline" className={styles.panel}>
      <h3>Compare</h3>
      <p className={styles.hint}>
        {changes.length === 0 ? 'No changes from the baseline yet.' : `${changes.length} changed from the baseline.`}
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">{`${parentName} (SRD)`}</th>
              <th scope="col">{variantName || 'Your variant'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isChanged = changed.has(row.path);
              return (
                <tr
                  key={row.path}
                  className={isChanged ? styles.changed : undefined}
                  data-changed={isChanged || undefined}
                >
                  <th scope="row">
                    {pathLabel(row.path)}
                    {isChanged && <span className="visually-hidden"> (changed)</span>}
                  </th>
                  <td>{shown(row.before)}</td>
                  <td>{shown(row.after)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function BalancePanel({ kind, definition }: { kind: CustomKind; definition: Definition }) {
  const spells = useSrdSpells(kind === 'spell');
  const weapons = useSrdWeapons(kind === 'weapon');
  const report = useMemo(() => {
    try {
      return balanceReport(kind, definition, {
        monsters: CR_BENCHMARKS,
        spells: spells.data,
        weapons: weapons.data,
      });
    } catch {
      // half-typed dice: the guide waits, and the form says what is wrong when saving
      return null;
    }
  }, [kind, definition, spells.data, weapons.data]);

  return (
    <section aria-label="Balance guide" className={styles.panel}>
      <h3>Balance guide</h3>
      {!report ? (
        <p className={styles.hint}>Finish the numbers to see how this compares.</p>
      ) : (
        <>
          <p>{report.comparedWith}</p>
          {report.warnings.length > 0 && (
            <ul className={styles.warnings} aria-label="Warnings">
              {report.warnings.map(w => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {report.notes.length > 0 && (
            <ul className={styles.notes} aria-label="Notes">
              {report.notes.map(n => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {report.warnings.length === 0 && report.notes.length === 0 && (
            <p className={styles.hint}>Nothing stands out.</p>
          )}
          <p className={styles.hint}>{`${report.heuristic} Warnings never stop a save.`}</p>
        </>
      )}
    </section>
  );
}
