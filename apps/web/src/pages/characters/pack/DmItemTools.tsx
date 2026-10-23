// P2-7, DM only: create an item (cloned from an SRD weapon or armour, or from scratch), edit an item's rules and
// secrets, and move it to a character, the party or the world. Loaded only in DM mode (it carries the SRD lists).
import {
  ITEM_KINDS,
  priceInCopper,
  type ItemDefinition,
  type ItemEffect,
  type ItemKind,
  type Requirement,
} from '@dnd-manager/rules-engine';
import { SRD_ARMOR, SRD_WEAPONS } from '@dnd-manager/srd-data/equipment';
import { Plus, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, Input } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import { RARITIES, type Item, type ItemOwnerType, type ItemSecret, type Rarity } from '../../../data/items';
import { useCharacters } from '../../../hooks/useCharacters';
import {
  useCreateItem,
  useForceMoveItem,
  useItemSecret,
  useSaveItemSecret,
  useUpdateItemRules,
} from '../../../hooks/useItems';
import { useParty } from '../../../hooks/useParty';
import styles from './pack.module.css';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const STATS = [...ABILITIES, 'speed', 'ac'] as const;
const STAT_LABELS: Record<(typeof STATS)[number], string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
  speed: 'Speed',
  ac: 'Armour class',
};
const MODE_LABELS: Record<ItemEffect['mode'], string> = { add: 'adds', set: 'becomes', set_at_least: 'at least' };

/** Fields an item's rules are edited with; turned into an ItemDefinition by `toDefinition`. */
interface RulesState {
  kind: ItemKind;
  magicBonus: string;
  requiresAttunement: boolean;
  bound: boolean;
  rarity: Rarity | '';
  weight: string;
  valueGp: string;
  description: string;
  requirements: Requirement[];
  effects: ItemEffect[];
  /** The weapon or armour part, kept as it came (from the SRD record or the item). */
  base: Pick<ItemDefinition, 'weapon' | 'armor'>;
}

const blankRules = (): RulesState => ({
  kind: 'gear',
  magicBonus: '',
  requiresAttunement: false,
  bound: false,
  rarity: '',
  weight: '',
  valueGp: '',
  description: '',
  requirements: [],
  effects: [],
  base: {},
});

const rulesOf = (item: Item): RulesState => ({
  kind: item.kind,
  magicBonus: item.definition.magicBonus ? String(item.definition.magicBonus) : '',
  requiresAttunement: item.requiresAttunement,
  bound: item.bound,
  rarity: item.rarity ?? '',
  weight: item.weight === null ? '' : String(item.weight),
  valueGp: item.valueCp ? String(item.valueCp / 100) : '',
  description: item.definition.description ?? '',
  requirements: item.definition.requirements ?? [],
  effects: item.definition.effects ?? [],
  base: {
    ...(item.definition.weapon ? { weapon: item.definition.weapon } : {}),
    ...(item.definition.armor ? { armor: item.definition.armor } : {}),
  },
});

function toDefinition(r: RulesState): ItemDefinition {
  const bonus = Number(r.magicBonus);
  return {
    ...r.base,
    ...(Number.isInteger(bonus) && bonus !== 0 ? { magicBonus: bonus } : {}),
    ...(r.requirements.length ? { requirements: r.requirements } : {}),
    ...(r.effects.length ? { effects: r.effects } : {}),
    ...(r.description.trim() ? { description: r.description.trim() } : {}),
  };
}

const weightOf = (r: RulesState) => (r.weight.trim() === '' ? null : Math.max(0, Number(r.weight) || 0));
const valueCpOf = (r: RulesState) => Math.max(0, Math.round((Number(r.valueGp) || 0) * 100));

function RulesFields({
  idBase,
  value,
  onChange,
}: {
  idBase: string;
  value: RulesState;
  onChange: (r: RulesState) => void;
}) {
  const set = (patch: Partial<RulesState>) => onChange({ ...value, ...patch });
  return (
    <>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${idBase}-kind`} className={styles.label}>
            Kind
          </label>
          <select
            id={`${idBase}-kind`}
            value={value.kind}
            onChange={e => set({ kind: e.target.value as ItemKind })}
            className={styles.select}
          >
            {ITEM_KINDS.map(k => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idBase}-rarity`} className={styles.label}>
            Rarity
          </label>
          <select
            id={`${idBase}-rarity`}
            value={value.rarity}
            onChange={e => set({ rarity: e.target.value as Rarity | '' })}
            className={styles.select}
          >
            <option value="">None</option>
            {RARITIES.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idBase}-bonus`} className={styles.label}>
            Magic bonus
          </label>
          <Input
            id={`${idBase}-bonus`}
            type="number"
            min={-5}
            max={5}
            step={1}
            value={value.magicBonus}
            onChange={e => set({ magicBonus: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idBase}-weight`} className={styles.label}>
            Weight (lb)
          </label>
          <Input
            id={`${idBase}-weight`}
            type="number"
            min={0}
            step="any"
            value={value.weight}
            onChange={e => set({ weight: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${idBase}-value`} className={styles.label}>
            Value (GP)
          </label>
          <Input
            id={`${idBase}-value`}
            type="number"
            min={0}
            step="any"
            value={value.valueGp}
            onChange={e => set({ valueGp: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.checks}>
        <label>
          <input
            type="checkbox"
            checked={value.requiresAttunement}
            onChange={e => set({ requiresAttunement: e.target.checked })}
          />{' '}
          Requires attunement
        </label>
        <label>
          <input type="checkbox" checked={value.bound} onChange={e => set({ bound: e.target.checked })} /> Bound (cannot
          be given)
        </label>
      </div>

      <fieldset className={styles.rows}>
        <legend className={styles.label}>Requirements</legend>
        {value.requirements.map((q, n) => (
          <div key={n} className={styles.fields}>
            <select
              aria-label={`Requirement ${n + 1}: ability`}
              value={q.stat}
              onChange={e =>
                set({
                  requirements: value.requirements.map((x, m) =>
                    m === n ? { ...x, stat: e.target.value as Requirement['stat'] } : x,
                  ),
                })
              }
              className={styles.select}
            >
              {ABILITIES.map(a => (
                <option key={a} value={a}>
                  {STAT_LABELS[a]}
                </option>
              ))}
            </select>
            <Input
              aria-label={`Requirement ${n + 1}: minimum score`}
              type="number"
              min={1}
              max={30}
              value={q.min}
              onChange={e =>
                set({
                  requirements: value.requirements.map((x, m) =>
                    m === n ? { ...x, min: Math.min(30, Math.max(1, Number(e.target.value) || 1)) } : x,
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              aria-label={`Remove requirement ${n + 1}`}
              onClick={() => set({ requirements: value.requirements.filter((_, m) => m !== n) })}
            >
              <Trash2 {...ICON_PROPS} />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => set({ requirements: [...value.requirements, { stat: 'str', min: 13, onUnmet: 'lock' }] })}
        >
          <Plus {...ICON_PROPS} /> Add a requirement
        </Button>
      </fieldset>

      <fieldset className={styles.rows}>
        <legend className={styles.label}>Effects while equipped</legend>
        {value.effects.map((ef, n) => (
          <div key={n} className={styles.fields}>
            <select
              aria-label={`Effect ${n + 1}: stat`}
              value={ef.stat}
              onChange={e =>
                set({
                  effects: value.effects.map((x, m) =>
                    m === n ? { ...x, stat: e.target.value as ItemEffect['stat'] } : x,
                  ),
                })
              }
              className={styles.select}
            >
              {STATS.map(s => (
                <option key={s} value={s}>
                  {STAT_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              aria-label={`Effect ${n + 1}: how`}
              value={ef.mode}
              onChange={e =>
                set({
                  effects: value.effects.map((x, m) =>
                    m === n ? { ...x, mode: e.target.value as ItemEffect['mode'] } : x,
                  ),
                })
              }
              className={styles.select}
            >
              {(Object.keys(MODE_LABELS) as ItemEffect['mode'][]).map(m => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
            <Input
              aria-label={`Effect ${n + 1}: value`}
              type="number"
              min={-100}
              max={100}
              value={ef.value}
              onChange={e =>
                set({
                  effects: value.effects.map((x, m) =>
                    m === n ? { ...x, value: Math.trunc(Number(e.target.value) || 0) } : x,
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              aria-label={`Remove effect ${n + 1}`}
              onClick={() => set({ effects: value.effects.filter((_, m) => m !== n) })}
            >
              <Trash2 {...ICON_PROPS} />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => set({ effects: [...value.effects, { stat: 'ac', mode: 'add', value: 1 }] })}
        >
          <Plus {...ICON_PROPS} /> Add an effect
        </Button>
      </fieldset>

      <div className={`${styles.field} ${styles.wide}`}>
        <label htmlFor={`${idBase}-description`} className={styles.label}>
          Description
        </label>
        <textarea
          id={`${idBase}-description`}
          value={value.description}
          maxLength={4000}
          rows={2}
          onChange={e => set({ description: e.target.value })}
          className={styles.textarea}
        />
      </div>
    </>
  );
}

/** "w:longsword" or "a:chain-mail" → the SRD record as item fields. */
function fromSrd(ref: string): { name: string; srdRef: string; rules: RulesState } | null {
  const [type, id] = ref.split(':');
  if (type === 'w') {
    const w = SRD_WEAPONS.find(x => x.id === id);
    if (!w) return null;
    return {
      name: w.name,
      srdRef: w.id,
      rules: {
        ...blankRules(),
        kind: 'weapon',
        weight: w.weightLb === null ? '' : String(w.weightLb),
        valueGp: String(priceInCopper(w.cost) / 100),
        base: {
          weapon: {
            category: w.category,
            kind: w.kind,
            damage: w.damage,
            properties: w.properties,
            ...(w.versatileDice ? { versatileDice: w.versatileDice } : {}),
            ...(w.range ? { range: w.range } : {}),
            ...(w.ammunition ? { ammunition: w.ammunition } : {}),
            mastery: w.mastery,
          },
        },
      },
    };
  }
  const a = SRD_ARMOR.find(x => x.id === id);
  if (!a) return null;
  return {
    name: a.name,
    srdRef: a.id,
    rules: {
      ...blankRules(),
      kind: a.category === 'shield' ? 'shield' : 'armor',
      weight: a.weightLb === null ? '' : String(a.weightLb),
      valueGp: String(priceInCopper(a.cost) / 100),
      base: {
        armor: {
          category: a.category,
          baseAc: a.baseAc,
          strength: a.strength,
          stealthDisadvantage: a.stealthDisadvantage,
        },
      },
    },
  };
}

type Props =
  { mode: 'create'; campaignId: string; characterId: string } | { mode: 'edit'; campaignId: string; item: Item };

export default function DmItemTools(props: Props) {
  return props.mode === 'create' ? (
    <CreateItem campaignId={props.campaignId} characterId={props.characterId} />
  ) : (
    <EditItem campaignId={props.campaignId} item={props.item} />
  );
}

/** Where an item goes: "character:<id>", "party" or "world". */
function PlaceSelect({
  id,
  label,
  campaignId,
  value,
  onChange,
}: {
  id: string;
  label: string;
  campaignId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const characters = useCharacters(campaignId);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className={styles.select}>
        {(characters.data ?? []).map(c => (
          <option key={c.id} value={`character:${c.id}`}>
            {c.name}
          </option>
        ))}
        <option value="party">The party</option>
        <option value="world">The world (no one)</option>
      </select>
    </div>
  );
}

function placeOf(value: string, partyId: string | undefined): { type: ItemOwnerType; id: string | null } {
  if (value === 'party') return { type: 'party', id: partyId ?? null };
  if (value === 'world') return { type: 'world', id: null };
  return { type: 'character', id: value.slice('character:'.length) };
}

function CreateItem({ campaignId, characterId }: { campaignId: string; characterId: string }) {
  const id = useId();
  const create = useCreateItem(campaignId);
  const party = useParty(campaignId);
  const [source, setSource] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [rules, setRules] = useState<RulesState>(blankRules);
  const [srdRef, setSrdRef] = useState<string | null>(null);
  const [place, setPlace] = useState(`character:${characterId}`);
  const [done, setDone] = useState<string | null>(null);

  function pick(ref: string) {
    setSource(ref);
    const srd = ref ? fromSrd(ref) : null;
    setName(srd?.name ?? '');
    setSrdRef(srd?.srdRef ?? null);
    setRules(srd?.rules ?? blankRules());
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const to = placeOf(place, party.data?.id);
    const made = name.trim();
    create.mutate(
      {
        campaignId,
        name: made,
        kind: rules.kind,
        definition: toDefinition(rules),
        ownerType: to.type,
        ownerId: to.id,
        quantity: Math.max(1, Math.trunc(Number(quantity)) || 1),
        weight: weightOf(rules),
        valueCp: valueCpOf(rules),
        rarity: rules.rarity || null,
        requiresAttunement: rules.requiresAttunement,
        bound: rules.bound,
        srdRef,
      },
      {
        onSuccess: () => {
          setDone(`Created ${made}.`);
          pick('');
          setQuantity('1');
        },
      },
    );
  }

  return (
    <form className={styles.dmForm} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.heading}>
        Create an item
      </h2>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-source`} className={styles.label}>
            Start from
          </label>
          <select id={`${id}-source`} value={source} onChange={e => pick(e.target.value)} className={styles.select}>
            <option value="">Scratch</option>
            <optgroup label="SRD weapons">
              {SRD_WEAPONS.map(w => (
                <option key={w.id} value={`w:${w.id}`}>
                  {w.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="SRD armour">
              {SRD_ARMOR.map(a => (
                <option key={a.id} value={`a:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className={`${styles.field} ${styles.grow}`}>
          <label htmlFor={`${id}-name`} className={styles.label}>
            Name
          </label>
          <Input id={`${id}-name`} required maxLength={120} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-qty`} className={styles.label}>
            Quantity
          </label>
          <Input
            id={`${id}-qty`}
            type="number"
            min={1}
            max={100000}
            step={1}
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />
        </div>
        <PlaceSelect id={`${id}-place`} label="Place with" campaignId={campaignId} value={place} onChange={setPlace} />
      </div>
      <RulesFields idBase={`${id}-rules`} value={rules} onChange={setRules} />
      <Button type="submit" disabled={!name.trim() || create.isPending}>
        {create.isPending ? 'Creating…' : 'Create item'}
      </Button>
      {create.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(create.error)}
        </p>
      )}
      {done && (
        <p role="status" className={styles.done}>
          {done}
        </p>
      )}
    </form>
  );
}

function EditItem({ campaignId, item }: { campaignId: string; item: Item }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const update = useUpdateItemRules(campaignId);
  const move = useForceMoveItem(campaignId);
  const party = useParty(campaignId);
  const secret = useItemSecret(item.id, open);
  const [rules, setRules] = useState<RulesState>(() => rulesOf(item));
  const [place, setPlace] = useState('party');
  const [quantity, setQuantity] = useState(String(item.quantity));

  return (
    <details className={styles.dmTools} open={open} onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>{`DM: ${item.name}`}</summary>
      <form
        className={styles.dmForm}
        aria-label={`Rules for ${item.name}`}
        onSubmit={e => {
          e.preventDefault();
          update.mutate({
            itemId: item.id,
            rules: {
              kind: rules.kind,
              definition: toDefinition(rules),
              requiresAttunement: rules.requiresAttunement,
              bound: rules.bound,
              rarity: rules.rarity || null,
              weight: weightOf(rules),
              valueCp: valueCpOf(rules),
            },
          });
        }}
      >
        <RulesFields idBase={`${id}-rules`} value={rules} onChange={setRules} />
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save rules'}
        </Button>
        {update.isError && (
          <p role="alert" className={styles.alert}>
            {friendlyMessage(update.error)}
          </p>
        )}
      </form>

      {secret.data ? (
        <SecretsForm item={item} initial={secret.data} />
      ) : secret.isError ? (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(secret.error)}
        </p>
      ) : (
        <p className={styles.muted}>Reading the secrets…</p>
      )}

      <form
        className={styles.dmForm}
        aria-label={`Move ${item.name}`}
        onSubmit={e => {
          e.preventDefault();
          const to = placeOf(place, party.data?.id);
          move.mutate({
            itemId: item.id,
            toType: to.type,
            toId: to.id,
            quantity: Math.min(item.quantity, Math.max(1, Math.trunc(Number(quantity)) || 1)),
          });
        }}
      >
        <div className={styles.fields}>
          <PlaceSelect id={`${id}-move`} label="Move to" campaignId={campaignId} value={place} onChange={setPlace} />
          {item.quantity > 1 && (
            <div className={styles.field}>
              <label htmlFor={`${id}-move-qty`} className={styles.label}>
                {`How many (of ${item.quantity})`}
              </label>
              <Input
                id={`${id}-move-qty`}
                type="number"
                min={1}
                max={item.quantity}
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
            </div>
          )}
        </div>
        <Button type="submit" variant="ghost" disabled={move.isPending}>
          Move now
        </Button>
        {move.isError && (
          <p role="alert" className={styles.alert}>
            {friendlyMessage(move.error)}
          </p>
        )}
      </form>
    </details>
  );
}

/** The DM's notes and hidden effect, starting from what is stored. */
function SecretsForm({ item, initial }: { item: Item; initial: ItemSecret }) {
  const id = useId();
  const saveSecret = useSaveItemSecret(item.id);
  const [notes, setNotes] = useState(initial);
  return (
    <form
      className={styles.dmForm}
      aria-label={`Secrets of ${item.name}`}
      onSubmit={e => {
        e.preventDefault();
        saveSecret.mutate(notes);
      }}
    >
      <div className={`${styles.field} ${styles.wide}`}>
        <label htmlFor={`${id}-notes`} className={styles.label}>
          DM notes (players never see these)
        </label>
        <textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={4000}
          value={notes.dmNotes}
          onChange={e => setNotes({ ...notes, dmNotes: e.target.value })}
          className={styles.textarea}
        />
      </div>
      <div className={`${styles.field} ${styles.wide}`}>
        <label htmlFor={`${id}-hidden`} className={styles.label}>
          Hidden effect (a note; add it to the rules to make it count)
        </label>
        <Input
          id={`${id}-hidden`}
          maxLength={1000}
          value={notes.hiddenEffect}
          onChange={e => setNotes({ ...notes, hiddenEffect: e.target.value })}
        />
      </div>
      <Button type="submit" variant="ghost" disabled={saveSecret.isPending}>
        Save secrets
      </Button>
      {saveSecret.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(saveSecret.error)}
        </p>
      )}
    </form>
  );
}
