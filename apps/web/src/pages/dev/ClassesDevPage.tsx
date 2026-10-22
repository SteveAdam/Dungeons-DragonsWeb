// /dev/classes (development builds only): browse the SRD classes, species and backgrounds as imported into the
// database, so each can be checked against the SRD: a class's core traits, table, features (levels 1 to 3) and
// subclass; a species' creature type, size, speed and traits; a background's abilities, feat, skills, tool and
// equipment; a spell's heading lines, text and the mechanics read from it.
import { useQuery } from '@tanstack/react-query';
import { classProgression } from '@dnd-manager/rules-engine';
import type { SrdBackground, SrdClass, SrdFeature, SrdSpecies, SrdSpell } from '@dnd-manager/srd-data';
import { useId, useState } from 'react';
import { useAuth } from '../../auth/authContext';
import { ErrorNotice } from '../../components/ErrorNotice';
import { Paper, RibbonTabs, Tag } from '../../components/ui';
import { listSrdBackgrounds, listSrdClasses, listSrdSpecies, listSrdSpells } from '../../data/srd';
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
const SPECIES_TAB = 'species';
const BACKGROUNDS_TAB = 'backgrounds';
const SPELLS_TAB = 'spells';
const ORDINAL = [
  'Cantrips',
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4',
  'Level 5',
  'Level 6',
  'Level 7',
  'Level 8',
  'Level 9',
];

export default function ClassesDevPage() {
  const { session } = useAuth();
  const classes = useQuery({ queryKey: ['srd', 'classes'], queryFn: listSrdClasses, enabled: !!session });
  const species = useQuery({ queryKey: ['srd', 'species'], queryFn: listSrdSpecies, enabled: !!session });
  const backgrounds = useQuery({ queryKey: ['srd', 'backgrounds'], queryFn: listSrdBackgrounds, enabled: !!session });
  const spells = useQuery({ queryKey: ['srd', 'spells'], queryFn: listSrdSpells, enabled: !!session });
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
  const other = picked === SPECIES_TAB || picked === BACKGROUNDS_TAB || picked === SPELLS_TAB ? picked : null;
  const current = other ? null : (classes.data.find(c => c.id === picked) ?? classes.data[0]);
  return (
    <main className={styles.page}>
      <RibbonTabs
        aria-label="Classes and species"
        tabs={[
          ...classes.data.map(c => ({ id: c.id, label: c.name })),
          { id: SPECIES_TAB, label: 'Species' },
          { id: BACKGROUNDS_TAB, label: 'Backgrounds' },
          { id: SPELLS_TAB, label: 'Spells' },
        ]}
        value={current?.id ?? other ?? SPECIES_TAB}
        onChange={setPicked}
      />
      {current ? (
        <ClassView key={current.id} cls={current} />
      ) : other === SPELLS_TAB ? (
        spells.isError ? (
          <ErrorNotice error={spells.error} onRetry={() => void spells.refetch()} />
        ) : spells.isPending ? (
          <p role="status">Unrolling the scrolls…</p>
        ) : spells.data.length === 0 ? (
          <p>No spells imported yet. Run pnpm srd:import.</p>
        ) : (
          ORDINAL.map((label, level) => {
            const atLevel = spells.data.filter(s => s.level === level);
            return atLevel.length ? <SpellLevel key={level} label={label} spells={atLevel} /> : null;
          })
        )
      ) : other === BACKGROUNDS_TAB ? (
        backgrounds.isError ? (
          <ErrorNotice error={backgrounds.error} onRetry={() => void backgrounds.refetch()} />
        ) : backgrounds.isPending ? (
          <p role="status">Reading the life stories…</p>
        ) : backgrounds.data.length === 0 ? (
          <p>No backgrounds imported yet. Run pnpm srd:import.</p>
        ) : (
          backgrounds.data.map(b => <BackgroundView key={b.id} background={b} />)
        )
      ) : species.isError ? (
        <ErrorNotice error={species.error} onRetry={() => void species.refetch()} />
      ) : species.isPending ? (
        <p role="status">Gathering the peoples…</p>
      ) : species.data.length === 0 ? (
        <p>No species imported yet. Run pnpm srd:import.</p>
      ) : (
        species.data.map(s => <SpeciesView key={s.id} species={s} />)
      )}
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

      {cls.sidebars?.map(s => (
        <Paper key={s.title} as="aside" texture="flat" aria-label={s.title} className={styles.card}>
          <h2 className={styles.title}>{s.title}</h2>
          <Text text={s.text} />
        </Paper>
      ))}

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

function SpeciesView({ species }: { species: SrdSpecies }) {
  const id = useId();
  return (
    <Paper as="section" texture="flat" aria-labelledby={`${id}-name`} className={styles.card}>
      <h2 id={`${id}-name`} className={styles.title}>
        {species.name} <Tag>{species.source}</Tag>
      </h2>
      <table className={styles.table}>
        <tbody>
          <Trait label="Creature Type">{species.creatureType}</Trait>
          <Trait label="Size">{species.sizeText}</Trait>
          <Trait label="Speed">{`${species.speed} feet`}</Trait>
        </tbody>
      </table>
      {species.traits.map(t => (
        <Feature key={t.name} feature={t} />
      ))}
    </Paper>
  );
}

function SpellLevel({ label, spells }: { label: string; spells: SrdSpell[] }) {
  const id = useId();
  return (
    <Paper as="section" texture="flat" aria-labelledby={`${id}-level`} className={styles.card}>
      <h2 id={`${id}-level`} className={styles.title}>
        {`${label} (${spells.length})`}
      </h2>
      {spells.map(s => (
        <section key={s.id} aria-label={s.name}>
          <h3 className={styles.group}>
            {`${s.name} `}
            <Tag>{s.source}</Tag>
          </h3>
          <p className={styles.note}>
            <i>{`${s.level === 0 ? `${cap(s.school)} Cantrip` : `Level ${s.level} ${cap(s.school)}`} (${s.classes.join(', ')})`}</i>
          </p>
          <table className={styles.table}>
            <tbody>
              <Trait label="Casting Time">{s.castingTime}</Trait>
              <Trait label="Range">{s.range}</Trait>
              <Trait label="Components">{components(s)}</Trait>
              <Trait label="Duration">{s.duration}</Trait>
            </tbody>
          </table>
          <Text text={s.text} />
          {s.higherLevels && <Text text={s.higherLevels} />}
          {s.statBlocks?.map(b => (
            <figure key={b.name} className={styles.note}>
              <figcaption className={styles.group}>{`Stat block: ${b.name}`}</figcaption>
              <pre className={styles.statBlock}>{b.text}</pre>
            </figure>
          ))}
          <p className={styles.note}>
            {s.mechanics ? `Mechanics read: ${JSON.stringify(s.mechanics)}` : 'Text only (no mechanics read)'}
          </p>
        </section>
      ))}
    </Paper>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const components = (s: SrdSpell) =>
  [s.components.v && 'V', s.components.s && 'S', s.components.m && `M (${s.components.materialText})`]
    .filter(Boolean)
    .join(', ');

function BackgroundView({ background }: { background: SrdBackground }) {
  const id = useId();
  return (
    <Paper as="section" texture="flat" aria-labelledby={`${id}-name`} className={styles.card}>
      <h2 id={`${id}-name`} className={styles.title}>
        {background.name} <Tag>{background.source}</Tag>
      </h2>
      <table className={styles.table}>
        <tbody>
          <Trait label="Ability Scores">{background.abilityScores.map(a => ABILITY[a]).join(', ')}</Trait>
          <Trait label="Feat">{background.originFeat.name}</Trait>
          <Trait label="Skill Proficiencies">{background.skillProficiencies.map(skillLabel).join(' and ')}</Trait>
          <Trait label="Tool Proficiency">{background.toolProficiency}</Trait>
          <Trait label="Equipment">
            {background.equipmentOptions.map(o => `(${o.option}) ${o.text}`).join('; or ')}
          </Trait>
        </tbody>
      </table>
      <section aria-label={`Feat: ${background.originFeat.name}`}>
        <h3 className={styles.group}>
          {`${background.originFeat.name} `}
          <Tag>mechanics later</Tag>
        </h3>
        <Text text={background.originFeat.description} />
      </section>
    </Paper>
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

/** A class feature ("Level 1: Rage") or a species trait ("Darkvision"), with its text and tables. */
function Feature({ feature }: { feature: SrdFeature | SrdSpecies['traits'][number] }) {
  const title = 'level' in feature ? `Level ${feature.level}: ${feature.name}` : feature.name;
  return (
    <section aria-label={title}>
      <h3 className={styles.group}>
        {`${title} `}
        {feature.mechanics === 'later' && <Tag>mechanics later</Tag>}
      </h3>
      <Text text={feature.description} />
      {feature.tables?.map(table => (
        <table key={table.title} className={styles.table}>
          <caption className={styles.group}>{table.title}</caption>
          <thead>
            <tr>
              {table.columns.map(c => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map(([level, ...cells]) => (
              <tr key={level}>
                <th scope="row">{level}</th>
                {cells.map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
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
