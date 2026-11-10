// P3-5: the right-hand page of the library, one layout for each kind of entry.
import { spellFirstLevel, spellTier, type TierClass } from '@dnd-manager/rules-engine';
import type { SrdArmor, SrdMonster, SrdSpell, SrdWeapon } from '@dnd-manager/srd-data/schemas';
import { Copy, Goal, MapPin, UserPlus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Tag } from '../../components/ui';
import styles from './Library.module.css';
import { PlaceInRegion } from './PlaceInRegion';
import { StatBlock } from './StatBlock';

const capitalised = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const costText = ({ cost }: { cost: { amount: number; coin: string } }) => `${cost.amount} ${cost.coin.toUpperCase()}`;
const weightText = ({ weightLb }: { weightLb: number | null }) => (weightLb === null ? 'None' : `${weightLb} lb.`);

/** The buttons under each entry. Only placing works so far; the others wait for custom content and ability paths. */
function EntryActions({ children }: { children?: ReactNode }) {
  const stubs = [
    { label: 'Clone and modify', icon: Copy, why: 'Arrives with custom content' },
    { label: 'Add to a character', icon: UserPlus, why: 'Not available yet' },
    { label: 'Use as a path goal', icon: Goal, why: 'Arrives with ability paths' },
  ];
  return (
    <div className={styles.actions}>
      {children}
      {stubs.map(s => (
        <Button key={s.label} variant="ghost" disabled title={s.why} className={iconClasses.host}>
          <s.icon {...ICON_PROPS} className={iconClasses.icon} />
          {s.label}
        </Button>
      ))}
    </div>
  );
}

function Facts({ facts }: { facts: [string, string | null | undefined][] }) {
  return (
    <dl className={styles.facts}>
      {facts
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function spellHeading(s: SrdSpell) {
  return s.level === 0 ? `${capitalised(s.school)} cantrip` : `Level ${s.level} ${capitalised(s.school)}`;
}

function tierText(s: SrdSpell, classes: readonly TierClass[]) {
  const tier = spellTier(s, classes);
  if (tier === 'unknown') return 'Tier unknown';
  return s.level === 0 ? `Tier ${tier}, a cantrip` : `Tier ${tier}, from level ${spellFirstLevel(s, classes)}`;
}

function componentsText({ components: c }: SrdSpell) {
  const letters = [c.v && 'V', c.s && 'S', c.m && 'M'].filter(Boolean).join(', ');
  return c.materialText ? `${letters} (${c.materialText})` : letters;
}

export function SpellDetail({ spell: s, classes }: { spell: SrdSpell; classes: readonly TierClass[] }) {
  return (
    <>
      <EntryActions />
      <article aria-label={s.name}>
        <h2 className={styles.detailName} tabIndex={-1}>
          {s.name}
        </h2>
        <p className={styles.detailSub}>{`${spellHeading(s)} · ${s.classes.join(', ')}`}</p>
        <p className={styles.tags}>
          <Tag>SRD</Tag>
          {s.concentration && <Tag>CONCENTRATION</Tag>}
          {s.ritual && <Tag>RITUAL</Tag>}
          <span className={styles.tier}>{tierText(s, classes)}</span>
        </p>
        <Facts
          facts={[
            ['Casting time', s.castingTime],
            ['Range', s.range],
            ['Components', componentsText(s)],
            ['Duration', s.duration],
          ]}
        />
        <div className={styles.prose}>
          {s.text.split(/\n\s*\n/).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {s.higherLevels && <p>{s.higherLevels}</p>}
          {s.statBlocks?.map(b => (
            <section key={b.name}>
              <h3>{b.name}</h3>
              <p className={styles.preserved}>{b.text}</p>
            </section>
          ))}
        </div>
      </article>
    </>
  );
}

export function MonsterDetail({ campaignId, monster }: { campaignId: string; monster: SrdMonster }) {
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState('');
  return (
    <>
      <EntryActions>
        <Button
          className={iconClasses.host}
          aria-expanded={placing}
          onClick={() => {
            setPlaced('');
            setPlacing(on => !on);
          }}
        >
          <MapPin {...ICON_PROPS} className={iconClasses.icon} />
          Place in a region
        </Button>
      </EntryActions>
      {placed && (
        <p role="status" className={styles.placed}>
          {placed}
        </p>
      )}
      {placing && (
        <PlaceInRegion
          campaignId={campaignId}
          monster={monster}
          onClose={() => setPlacing(false)}
          onPlaced={message => {
            setPlaced(message);
            setPlacing(false);
          }}
        />
      )}
      <StatBlock monster={monster} />
    </>
  );
}

/** The rules a DM will be able to set on a custom weapon. Shown now so the shape of them is known. */
function ItemRules() {
  const id = useId();
  return (
    <fieldset disabled className={styles.itemRules}>
      <legend>Item rules</legend>
      <p className={styles.note}>Editable in custom weapons</p>
      <div className={styles.ruleField}>
        <label htmlFor={`${id}-strength`}>Strength requirement</label>
        <Input id={`${id}-strength`} type="number" defaultValue="" />
      </div>
      <div className={styles.ruleField}>
        <label htmlFor={`${id}-effect`}>Granted effect</label>
        <Input id={`${id}-effect`} defaultValue="" />
      </div>
      <label className={styles.check}>
        <input type="checkbox" defaultChecked /> Can be given to others
      </label>
      <label className={styles.check}>
        <input type="checkbox" /> Bound to a character
      </label>
    </fieldset>
  );
}

export function WeaponDetail({ weapon: w }: { weapon: SrdWeapon }) {
  const damage = `${w.damage.dice} ${w.damage.type}${w.versatileDice ? ` (${w.versatileDice} two-handed)` : ''}`;
  return (
    <>
      <EntryActions />
      <article aria-label={w.name}>
        <h2 className={styles.detailName} tabIndex={-1}>
          {w.name}
        </h2>
        <p className={styles.detailSub}>{`${capitalised(w.category)} ${w.kind} weapon`}</p>
        <p className={styles.tags}>
          <Tag>SRD</Tag>
        </p>
        <Facts
          facts={[
            ['Category', `${capitalised(w.category)} ${w.kind}`],
            ['Damage', damage],
            ['Properties', w.propertiesText || 'None'],
            ['Mastery', capitalised(w.mastery)],
            ['Range', w.range ? `${w.range.normal}/${w.range.long} ft.` : null],
            ['Cost', costText(w)],
            ['Weight', weightText(w)],
          ]}
        />
        {w.notes && (
          <div className={styles.prose}>
            {w.notes.map(note => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}
        <ItemRules />
      </article>
    </>
  );
}

export function ArmorDetail({ armor: a }: { armor: SrdArmor }) {
  return (
    <>
      <EntryActions />
      <article aria-label={a.name}>
        <h2 className={styles.detailName} tabIndex={-1}>
          {a.name}
        </h2>
        <p className={styles.detailSub}>{a.category === 'shield' ? 'Shield' : `${capitalised(a.category)} armour`}</p>
        <p className={styles.tags}>
          <Tag>SRD</Tag>
        </p>
        <Facts
          facts={[
            ['Armour Class', a.acText],
            ['Strength', a.strength === null ? 'None' : `Str ${a.strength}`],
            ['Stealth', a.stealthDisadvantage ? 'Disadvantage' : 'No penalty'],
            ['Putting on', a.donDoff],
            ['Cost', costText(a)],
            ['Weight', weightText(a)],
          ]}
        />
      </article>
    </>
  );
}
