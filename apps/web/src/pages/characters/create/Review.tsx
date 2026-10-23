// P2-9: the review step. The sheet shown is the rules engine's own computeSheet of what the server will build.
import {
  ABILITY_KEYS,
  buildCharacter,
  computeSheet,
  formatPurse,
  previewItems,
  type CreationChoices,
} from '@dnd-manager/rules-engine';
import type { WizardSrd } from '../../../data/creation';
import styles from './create.module.css';

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

export function Review({ srd, choices }: { srd: WizardSrd; choices: CreationChoices }) {
  const built = buildCharacter(choices, srd);
  const sheet = computeSheet(built.sheet, [], { seconds: 0 }, undefined, previewItems(built));
  return (
    <section className={styles.review} aria-label="Your character">
      <h3 className={styles.heading}>{sheet.name}</h3>
      <p>{`${built.sheet.species} ${built.sheet.className} 1 · ${built.sheet.background} · ${built.sheet.alignment || 'no alignment'}`}</p>
      <dl className={styles.stats}>
        <div>
          <dt>Hit points</dt>
          <dd>{sheet.hp.max}</dd>
        </div>
        <div>
          <dt>Armour class</dt>
          <dd>{sheet.armorClass.value}</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{`${sheet.speed.value} ft`}</dd>
        </div>
        <div>
          <dt>Initiative</dt>
          <dd>{signed(sheet.initiative.bonus)}</dd>
        </div>
        <div>
          <dt>Proficiency</dt>
          <dd>{signed(sheet.proficiencyBonus)}</dd>
        </div>
      </dl>
      <table className={styles.scores}>
        <caption className={styles.label}>Abilities and saving throws</caption>
        <thead>
          <tr>
            <th scope="col">Ability</th>
            <th scope="col">Score</th>
            <th scope="col">Modifier</th>
            <th scope="col">Save</th>
          </tr>
        </thead>
        <tbody>
          {ABILITY_KEYS.map(a => {
            const ab = sheet.abilities[a];
            const save = sheet.saves.find(s => s.ability === a)!;
            return (
              <tr key={a}>
                <th scope="row">{ab.label}</th>
                <td>{ab.score}</td>
                <td>{signed(ab.modifier)}</td>
                <td>{`${signed(save.bonus)}${save.proficient ? ' (proficient)' : ''}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        <span className={styles.label}>Skills </span>
        {sheet.skills
          .filter(s => s.proficient)
          .map(s => `${s.label} ${signed(s.bonus)}`)
          .join(', ')}
      </p>
      {sheet.attacks.length > 0 && (
        <p>
          <span className={styles.label}>Attacks </span>
          {sheet.attacks.map(a => `${a.name} ${signed(a.bonus)} (${a.damage} ${a.damageType})`).join(', ')}
        </p>
      )}
      {built.sheet.spells && (
        <p>
          <span className={styles.label}>Spells </span>
          {[
            built.sheet.spells.cantrips.length ? `Cantrips: ${built.sheet.spells.cantrips.join(', ')}` : '',
            built.sheet.spells.prepared.length ? `Prepared: ${built.sheet.spells.prepared.join(', ')}` : '',
            built.sheet.spells.spellbook?.length ? `Spellbook: ${built.sheet.spells.spellbook.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('. ')}
        </p>
      )}
      <p>
        <span className={styles.label}>Equipment </span>
        {[
          ...built.items.map(
            i => `${i.quantity > 1 ? `${i.quantity} × ` : ''}${i.name}${i.equipped ? ' (equipped)' : ''}`,
          ),
          formatPurse({ gp: built.gp }),
        ].join(', ')}
      </p>
      <p>
        <span className={styles.label}>Origin feat </span>
        {built.sheet.originFeat}
      </p>
    </section>
  );
}
