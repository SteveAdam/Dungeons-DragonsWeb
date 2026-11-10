// P3-4, P3-5: a monster's stat block, as the SRD prints it. The library and the /dev/monsters check page share it.
import { abilityModifier } from '@dnd-manager/rules-engine';
import type { SrdMonster } from '@dnd-manager/srd-data/schemas';
import styles from './Library.module.css';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

type Entry = SrdMonster['traits'][number];

function Line({ label, children }: { label: string; children: string }) {
  if (!children) return null;
  return (
    <p className={styles.statLine}>
      <strong>{label}</strong> {children}
    </p>
  );
}

function Entries({ title, intro, entries }: { title: string; intro?: string; entries: Entry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className={styles.statSection}>
      <h3>{title}</h3>
      {intro && <p>{intro}</p>}
      {entries.map(e => (
        <div key={e.name} className={styles.entryText}>
          {e.description.split(/\n+/).map((paragraph, i) => (
            <p key={i}>
              {i === 0 && <strong>{`${e.name}${e.usage ? ` (${e.usage})` : ''}. `}</strong>}
              {paragraph}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}

function subtitle(m: SrdMonster) {
  const type = m.creatureTags ? `${m.creatureType} (${m.creatureTags})` : m.creatureType;
  return `${m.size.join(' or ')} ${type}, ${m.alignment}`;
}

function challengeLine(m: SrdMonster) {
  const xp = m.xpInLair ? `${m.xp.toLocaleString()}, or ${m.xpInLair.toLocaleString()} in lair` : m.xp.toLocaleString();
  return `${m.challengeRating} (XP ${xp}; PB ${signed(m.proficiencyBonus)})`;
}

export function StatBlock({ monster: m }: { monster: SrdMonster }) {
  const senses = [...m.senses, `Passive Perception ${m.passivePerception}`].join(', ');
  return (
    <article className={styles.statBlock} aria-label={`${m.name} stat block`}>
      <header>
        <h2 className={styles.detailName} tabIndex={-1}>
          {m.name}
        </h2>
        <p className={styles.detailSub}>{subtitle(m)}</p>
      </header>

      <div className={styles.statRule}>
        <Line label="Armour Class">{`${m.armourClass}${m.armourNote ? ` (${m.armourNote})` : ''}`}</Line>
        <Line label="Initiative">{`${signed(m.initiative.bonus)} (${m.initiative.score})`}</Line>
        <Line label="Hit Points">{`${m.hitPoints} (${m.hitDice})`}</Line>
        <Line label="Speed">{m.speedText}</Line>
      </div>

      <table className={styles.abilities}>
        <caption className="visually-hidden">Ability scores</caption>
        <thead>
          <tr>
            <td aria-hidden="true" />
            <th scope="col">Score</th>
            <th scope="col">Mod</th>
            <th scope="col">Save</th>
          </tr>
        </thead>
        <tbody>
          {ABILITIES.map(a => (
            <tr key={a}>
              <th scope="row">{a.toUpperCase()}</th>
              <td>{m.abilityScores[a]}</td>
              <td>{signed(abilityModifier(m.abilityScores[a]))}</td>
              <td>{signed(m.saves[a])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.statRule}>
        <Line label="Skills">{m.skills.map(s => `${s.name} ${signed(s.bonus)}`).join(', ')}</Line>
        <Line label="Vulnerabilities">{m.damageVulnerabilities.join(', ')}</Line>
        <Line label="Resistances">{m.damageResistances.join(', ')}</Line>
        <Line label="Immunities">{[...m.damageImmunities, ...m.conditionImmunities].join(', ')}</Line>
        <Line label="Gear">{m.gear.join(', ')}</Line>
        <Line label="Senses">{senses}</Line>
        <Line label="Languages">{m.languages}</Line>
        <Line label="Challenge">{challengeLine(m)}</Line>
      </div>

      <Entries title="Traits" entries={m.traits} />
      <Entries title="Actions" entries={m.actions} />
      <Entries title="Bonus Actions" entries={m.bonusActions} />
      <Entries title="Reactions" entries={m.reactions} />
      <Entries title="Legendary Actions" intro={m.legendaryIntro} entries={m.legendaryActions} />
    </article>
  );
}
