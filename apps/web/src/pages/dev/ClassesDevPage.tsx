// /dev/classes (development builds only): browse the SRD classes as imported into the database, levels 1 to 3,
// so each can be checked against the SRD: core traits, the class table, every feature's text and the subclass.
import { useQuery } from '@tanstack/react-query';
import { classProgression, type ClassFeature } from '@dnd-manager/rules-engine';
import type { SrdClass } from '@dnd-manager/srd-data';
import { useId, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Paper, RibbonTabs, Tag } from '../../components/ui';
import { listSrdClasses } from '../../data/srd';
import styles from './SrdDevPage.module.css';

const ABILITY = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};
const SKILL_LABELS: Record<string, string> = { animalHandling: 'Animal Handling', sleightOfHand: 'Sleight of Hand' };
const skillLabel = (key: string) => SKILL_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

export default function ClassesDevPage() {
  const { session } = useAuth();
  const classes = useQuery({ queryKey: ['srd', 'classes'], queryFn: listSrdClasses, enabled: !!session });
  const [picked, setPicked] = useState<string | null>(null);

  if (!session) {
    return (
      <main className={styles.page}>
        <p>Sign in to read the imported SRD classes.</p>
      </main>
    );
  }
  if (classes.isError) {
    return (
      <main className={styles.page}>
        <ErrorNotice error={classes.error} onRetry={() => void classes.refetch()} />
      </main>
    );
  }
  if (classes.isPending) {
    return (
      <main className={styles.page}>
        <p role="status">Opening the class tomes…</p>
      </main>
    );
  }
  if (classes.data.length === 0) {
    return (
      <main className={styles.page}>
        <p>No classes imported yet. Run pnpm srd:import.</p>
      </main>
    );
  }
  const current = classes.data.find(c => c.id === picked) ?? classes.data[0];
  return (
    <main className={styles.page}>
      <RibbonTabs
        aria-label="Classes"
        tabs={classes.data.map(c => ({ id: c.id, label: c.name }))}
        value={current.id}
        onChange={setPicked}
      />
      <ClassView key={current.id} cls={current} />
    </main>
  );
}

function ClassView({ cls }: { cls: SrdClass }) {
  const id = useId();
  return (
    <>
      <Paper as="section" texture="flat" aria-labelledby={`${id}-name`} className={styles.card}>
        <h1 id={`${id}-name`} className={styles.title}>
          {cls.name} <Tag>{cls.source}</Tag>
        </h1>
        <table className={styles.table}>
          <tbody>
            <Trait label="Primary Ability">{cls.primaryAbilityText}</Trait>
            <Trait label="Hit Point Die">{`${cls.hitDie.toUpperCase()} per ${cls.name} level`}</Trait>
            <Trait label="Saving Throw Proficiencies">{cls.saveProficiencies.map(a => ABILITY[a]).join(' and ')}</Trait>
            <Trait label="Skill Proficiencies">
              {`Choose ${cls.skillChoices.count}: ${cls.skillChoices.from.map(skillLabel).join(', ')}`}
            </Trait>
            <Trait label="Weapon Proficiencies">{cls.weaponProficiencies}</Trait>
            {cls.toolProficiencies && <Trait label="Tool Proficiencies">{cls.toolProficiencies}</Trait>}
            <Trait label="Armor Training">{cls.armorTraining.text}</Trait>
            <Trait label="Starting Equipment">
              {cls.startingEquipmentOptions.map(o => `(${o.option}) ${o.text}`).join('; or ')}
            </Trait>
          </tbody>
        </table>
      </Paper>

      <Paper as="section" texture="flat" aria-labelledby={`${id}-table`} className={styles.card}>
        <h2 id={`${id}-table`} className={styles.title}>
          {`${cls.name} Features, levels 1 to 3`}
        </h2>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Proficiency Bonus</th>
                <th scope="col">Class Features</th>
                {cls.columns.map(c => (
                  <th scope="col" key={c.key}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cls.levels.map(l => {
                const p = classProgression(cls, l.level);
                return (
                  <tr key={l.level}>
                    <th scope="row">{l.level}</th>
                    <td>{`+${p.proficiencyBonus}`}</td>
                    <td>{p.features.map(f => f.name).join(', ')}</td>
                    {cls.columns.map(c => (
                      <td key={c.key}>{String(p.columns[c.key])}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cls.levels
          .flatMap(l => l.features)
          .map(f => (
            <Feature key={`${f.level}-${f.name}`} feature={f} />
          ))}
      </Paper>

      {cls.subclasses.map(s => (
        <Paper key={s.id} as="section" texture="flat" aria-labelledby={`${id}-${s.id}`} className={styles.card}>
          <h2 id={`${id}-${s.id}`} className={styles.title}>
            {`${cls.name} Subclass: ${s.name}`}
          </h2>
          <p className={styles.note}>
            <i>{s.tagline}</i>
          </p>
          <Text text={s.description} />
          {s.features.map(f => (
            <Feature key={`${f.level}-${f.name}`} feature={f} />
          ))}
        </Paper>
      ))}
    </>
  );
}

function Trait({ label, children }: { label: string; children: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}

function Feature({ feature }: { feature: ClassFeature }) {
  return (
    <section aria-label={`Level ${feature.level}: ${feature.name}`}>
      <h3 className={styles.group}>
        {`Level ${feature.level}: ${feature.name} `}
        {feature.mechanics === 'later' && <Tag>mechanics later</Tag>}
      </h3>
      <Text text={feature.description} />
    </section>
  );
}

/** SRD text: paragraphs split by a blank line; bullet lines start with "• ". */
function Text({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((para, i) =>
        para.startsWith('• ') ? (
          <ul key={i}>
            {para.split('\n').map(b => (
              <li key={b}>{b.slice(2)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className={styles.note}>
            {para}
          </p>
        ),
      )}
    </>
  );
}
