// P3-5, P3-6: the right-hand page of the library, one layout for each kind of entry, SRD or the DM's own.
import { spellFirstLevel, spellTier, type CustomItemRules, type TierClass } from '@dnd-manager/rules-engine';
import type { SrdArmor, SrdMonster, SrdSpell, SrdWeapon } from '@dnd-manager/srd-data/schemas';
import { Copy, Goal, MapPin, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button, ICON_PROPS, iconClasses, Input, Tag } from '../../components/ui';
import type { CustomEntry } from '../../data/customContent';
import { friendlyMessage } from '../../data/errors';
import { useDeleteCustomContent } from '../../hooks/useCustomContent';
import { CustomItemTools } from './CustomItemTools';
import styles from './Library.module.css';
import { PlaceInRegion } from './PlaceInRegion';
import { StatBlock } from './StatBlock';

const capitalised = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const costText = ({ cost }: { cost: { amount: number; coin: string } }) => `${cost.amount} ${cost.coin.toUpperCase()}`;
const weightText = ({ weightLb }: { weightLb: number | null }) => (weightLb === null ? 'None' : `${weightLb} lb.`);

/** What every entry's action bar needs: how to clone an SRD entry, or the custom entry and how to change it. */
export interface EntryControls {
  custom?: CustomEntry;
  onClone: () => void;
  onEdit: () => void;
  /** After a delete, the entry is gone: the panel goes back to the list. */
  onDeleted: () => void;
}

function Stub({ label, icon: Icon, why }: { label: string; icon: typeof Goal; why: string }) {
  return (
    <Button variant="ghost" disabled title={why} className={iconClasses.host}>
      <Icon {...ICON_PROPS} className={iconClasses.icon} />
      {label}
    </Button>
  );
}

function DeleteEntry({ custom, onDeleted }: { custom: CustomEntry; onDeleted: () => void }) {
  const remove = useDeleteCustomContent(custom.campaignId);
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        className={iconClasses.host}
        disabled={remove.isPending}
        onClick={() => (asking ? remove.mutate(custom.id, { onSuccess: onDeleted }) : setAsking(true))}
      >
        <Trash2 {...ICON_PROPS} className={iconClasses.icon} />
        {asking ? 'Yes, delete it' : 'Delete'}
      </Button>
      {remove.isError && (
        <p role="alert" className={styles.problems}>
          {friendlyMessage(remove.error)}
        </p>
      )}
    </>
  );
}

function EntryActions({ controls, children }: { controls: EntryControls; children?: ReactNode }) {
  const { custom, onClone, onEdit, onDeleted } = controls;
  return (
    <div className={styles.actions}>
      {children}
      {custom ? (
        <>
          <Button variant="ghost" className={iconClasses.host} onClick={onEdit}>
            <Pencil {...ICON_PROPS} className={iconClasses.icon} />
            Change
          </Button>
          <DeleteEntry custom={custom} onDeleted={onDeleted} />
        </>
      ) : (
        <>
          <Button variant="ghost" className={iconClasses.host} onClick={onClone}>
            <Copy {...ICON_PROPS} className={iconClasses.icon} />
            Clone and modify
          </Button>
          <Stub label="Add to a character" icon={UserPlus} why="Not available yet" />
        </>
      )}
      <Stub label="Use as a path goal" icon={Goal} why="Arrives with ability paths" />
    </div>
  );
}

function SourceTags({ custom, children }: { custom?: CustomEntry; children?: ReactNode }) {
  return (
    <p className={styles.tags}>
      {custom ? <Tag tone="wax">CAMPAIGN</Tag> : <Tag>SRD</Tag>}
      {custom?.textOnly && <Tag>TEXT ONLY</Tag>}
      {children}
    </p>
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

export function SpellDetail({
  spell: s,
  classes,
  controls,
}: {
  spell: SrdSpell;
  classes: readonly TierClass[];
  controls: EntryControls;
}) {
  return (
    <>
      <EntryActions controls={controls} />
      <article aria-label={s.name}>
        <h2 className={styles.detailName} tabIndex={-1}>
          {s.name}
        </h2>
        <p className={styles.detailSub}>{`${spellHeading(s)} · ${s.classes.join(', ')}`}</p>
        <SourceTags custom={controls.custom}>
          {s.concentration && <Tag>CONCENTRATION</Tag>}
          {s.ritual && <Tag>RITUAL</Tag>}
          <span className={styles.tier}>{tierText(s, classes)}</span>
        </SourceTags>
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

export function MonsterDetail({
  campaignId,
  monster,
  controls,
}: {
  campaignId: string;
  monster: SrdMonster;
  controls: EntryControls;
}) {
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState('');
  return (
    <>
      <EntryActions controls={controls}>
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
          custom={controls.custom}
          onClose={() => setPlacing(false)}
          onPlaced={message => {
            setPlaced(message);
            setPlacing(false);
          }}
        />
      )}
      <SourceTags custom={controls.custom} />
      <StatBlock monster={monster} />
    </>
  );
}

/** The rules a DM can set on a custom weapon. On an SRD weapon they are shown disabled, to show their shape. */
function ItemRulesPreview() {
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

const yesNo = (flag: boolean) => (flag ? 'Yes' : 'No');

function ItemRulesFacts({ custom }: { custom: CustomEntry }) {
  const rules = custom.definition.itemRules as CustomItemRules;
  return (
    <section aria-label="Item rules" className={styles.panel}>
      <h3>Item rules</h3>
      <Facts
        facts={[
          ['Requires', rules.requirements.map(r => `${r.stat.toUpperCase()} ${r.min}`).join(', ') || 'Nothing'],
          ['Granted effect', rules.grantedText],
          ['Magic bonus', rules.magicBonus ? `+${rules.magicBonus}` : null],
          ['Can be given', yesNo(rules.canBeGiven)],
          ['Bound', yesNo(rules.bound)],
        ]}
      />
    </section>
  );
}

export function WeaponDetail({ weapon: w, controls }: { weapon: SrdWeapon; controls: EntryControls }) {
  const damage = `${w.damage.dice} ${w.damage.type}${w.versatileDice ? ` (${w.versatileDice} two-handed)` : ''}`;
  return (
    <>
      <EntryActions controls={controls} />
      {controls.custom && <CustomItemTools entry={controls.custom} />}
      <article aria-label={w.name}>
        <h2 className={styles.detailName} tabIndex={-1}>
          {w.name}
        </h2>
        <p className={styles.detailSub}>{`${capitalised(w.category)} ${w.kind} weapon`}</p>
        <SourceTags custom={controls.custom} />
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
        {controls.custom ? <ItemRulesFacts custom={controls.custom} /> : <ItemRulesPreview />}
      </article>
    </>
  );
}

export function ArmorDetail({ armor: a, controls }: { armor: SrdArmor; controls: EntryControls }) {
  return (
    <>
      <EntryActions controls={controls} />
      {controls.custom && <CustomItemTools entry={controls.custom} />}
      <article aria-label={a.name}>
        <h2 className={styles.detailName} tabIndex={-1}>
          {a.name}
        </h2>
        <p className={styles.detailSub}>{a.category === 'shield' ? 'Shield' : `${capitalised(a.category)} armour`}</p>
        <SourceTags custom={controls.custom} />
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
        {controls.custom && <ItemRulesFacts custom={controls.custom} />}
      </article>
    </>
  );
}

/** A DM's own item: everything that is neither a weapon nor armour. */
export function CustomItemDetail({ custom, controls }: { custom: CustomEntry; controls: EntryControls }) {
  const d = custom.definition as {
    itemKind: string;
    rarity: string | null;
    requiresAttunement: boolean;
    description: string;
    weightLb: number | null;
    cost: { amount: number; coin: string };
  };
  return (
    <>
      <EntryActions controls={controls} />
      <CustomItemTools entry={custom} />
      <article aria-label={custom.name}>
        <h2 className={styles.detailName} tabIndex={-1}>
          {custom.name}
        </h2>
        <p className={styles.detailSub}>{capitalised(d.itemKind)}</p>
        <SourceTags custom={custom} />
        <Facts
          facts={[
            ['Rarity', d.rarity ? capitalised(d.rarity) : null],
            ['Attunement', yesNo(d.requiresAttunement)],
            ['Cost', costText(d)],
            ['Weight', weightText(d)],
          ]}
        />
        {d.description && <p className={styles.preserved}>{d.description}</p>}
        <ItemRulesFacts custom={custom} />
      </article>
    </>
  );
}
