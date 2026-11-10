// P3-6: turns a custom weapon, armour or item into a real item (P2-7) for a character, the party or the world, and shows
// who in the party could use it.
import { checkRequirements, customToItem, type CustomItemRules } from '@dnd-manager/rules-engine';
import { PackagePlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ICON_PROPS, iconClasses, Input } from '../../components/ui';
import { customRef, type CustomEntry } from '../../data/customContent';
import { friendlyMessage } from '../../data/errors';
import type { ItemOwnerType, Rarity } from '../../data/items';
import { useCampaign } from '../../hooks/useCampaigns';
import { useCharacters } from '../../hooks/useCharacters';
import { useCreateItem, usePartyRoster } from '../../hooks/useItems';
import { useParty } from '../../hooks/useParty';
import styles from './Library.module.css';

const ABILITY_NAMES = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

function WhoCanUse({ entry, rules }: { entry: CustomEntry; rules: CustomItemRules }) {
  const roster = usePartyRoster(entry.campaignId);
  const campaign = useCampaign(entry.campaignId);
  if (rules.requirements.length === 0 || !roster.data || !campaign.data) return null;
  const clock = { seconds: campaign.data.gameSeconds };
  return (
    <section aria-label="Who can use it" className={styles.panel}>
      <h3>Who can use it</h3>
      <ul className={styles.notes}>
        {roster.data.map(member => {
          const check = checkRequirements(
            { id: entry.id, name: entry.name, requirements: rules.requirements },
            member.baseScores,
            member.effects,
            clock,
          );
          const scores = check.results.map(r => `${ABILITY_NAMES[r.stat]} ${r.actual}`).join(', ');
          const lifted = check.results.find(r => r.metByEffect)?.metByEffect;
          const state = !check.usable ? 'Locked' : lifted ? `Usable thanks to ${lifted.name}` : 'Usable';
          return <li key={member.id}>{`${member.name} (${scores}): ${state}`}</li>;
        })}
      </ul>
    </section>
  );
}

function MakeItemForm({ entry, onDone }: { entry: CustomEntry; onDone: (message: string) => void }) {
  const id = useId();
  const characters = useCharacters(entry.campaignId);
  const party = useParty(entry.campaignId);
  const create = useCreateItem(entry.campaignId);
  const [place, setPlace] = useState('');
  const [quantity, setQuantity] = useState('1');
  const first = characters.data?.[0] ? `character:${characters.data[0].id}` : 'party';
  const where = place || first;

  function submit(e: FormEvent) {
    e.preventDefault();
    const item = customToItem(entry.kind as 'weapon' | 'armor' | 'item', entry.definition);
    const owner: { type: ItemOwnerType; id: string | null } =
      where === 'party'
        ? { type: 'party', id: party.data?.id ?? null }
        : where === 'world'
          ? { type: 'world', id: null }
          : { type: 'character', id: where.slice('character:'.length) };
    create.mutate(
      {
        campaignId: entry.campaignId,
        name: entry.name,
        kind: item.kind,
        definition: item.definition,
        ownerType: owner.type,
        ownerId: owner.id,
        quantity: Math.max(1, Math.trunc(Number(quantity)) || 1),
        weight: item.weight,
        valueCp: item.valueCp,
        rarity: item.rarity as Rarity | null,
        requiresAttunement: item.requiresAttunement,
        bound: item.bound,
        srdRef: customRef(entry.id),
      },
      { onSuccess: () => onDone(`${entry.name} is made.`) },
    );
  }

  return (
    <form className={styles.placing} aria-label={`Make ${entry.name} into an item`} onSubmit={submit}>
      <div className={styles.formFields}>
        <div className={styles.filterField}>
          <label htmlFor={`${id}-place`}>Give to</label>
          <select id={`${id}-place`} className={styles.select} value={where} onChange={e => setPlace(e.target.value)}>
            {characters.data?.map(c => (
              <option key={c.id} value={`character:${c.id}`}>
                {c.name}
              </option>
            ))}
            <option value="party">The party</option>
            <option value="world">The world (no one)</option>
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor={`${id}-quantity`}>Quantity</label>
          <Input
            id={`${id}-quantity`}
            type="number"
            min={1}
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={create.isPending || characters.isPending || party.isPending}>
        {create.isPending ? 'Making…' : 'Make the item'}
      </Button>
      {create.isError && (
        <p role="alert" className={styles.problems}>
          {friendlyMessage(create.error)}
        </p>
      )}
    </form>
  );
}

export function CustomItemTools({ entry }: { entry: CustomEntry }) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState('');
  return (
    <>
      <div className={styles.actions}>
        <Button
          className={iconClasses.host}
          aria-expanded={open}
          onClick={() => {
            setMade('');
            setOpen(on => !on);
          }}
        >
          <PackagePlus {...ICON_PROPS} className={iconClasses.icon} />
          Make into an item
        </Button>
      </div>
      {made && (
        <p role="status" className={styles.placed}>
          {made}
        </p>
      )}
      {open && (
        <MakeItemForm
          entry={entry}
          onDone={message => {
            setMade(message);
            setOpen(false);
          }}
        />
      )}
      <WhoCanUse entry={entry} rules={entry.definition.itemRules as CustomItemRules} />
    </>
  );
}
