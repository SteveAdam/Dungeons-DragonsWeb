import { whoCanUse, type GameClock, type UseState } from '@dnd-manager/rules-engine';
import { useId, useState, type FormEvent } from 'react';
import { Button, Input } from '../../../components/ui';
import { friendlyMessage } from '../../../data/errors';
import type { Item } from '../../../data/items';
import { useOfferTransfer, usePartyRoster } from '../../../hooks/useItems';
import styles from './pack.module.css';

const STATE_TEXT: Record<UseState, string> = {
  usable: 'can use',
  usable_with_effect: 'can use, for now',
  locked: 'locked',
};
const ABILITY_SHORT = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' } as const;

/**
 * Give an item to another party member. Each member shows whether they could use it (the P1-3 whoCanUse preview),
 * and the offer waits for them to accept.
 */
export function GiveDialog({
  campaignId,
  item,
  fromCharacterId,
  clock,
  onClose,
}: {
  campaignId: string;
  item: Item;
  fromCharacterId: string;
  clock: GameClock;
  onClose: () => void;
}) {
  const id = useId();
  const roster = usePartyRoster(campaignId);
  const offer = useOfferTransfer(campaignId);
  const [to, setTo] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const others = (roster.data ?? []).filter(m => m.id !== fromCharacterId);
  const uses = whoCanUse(
    { id: item.id, name: item.name, requirements: item.definition.requirements ?? [] },
    others,
    clock,
  );
  const recipient = others.find(m => m.id === to);
  const n = Number(quantity);
  const validQuantity = Number.isInteger(n) && n >= 1 && n <= item.quantity;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!to) return;
    offer.mutate({ itemId: item.id, toCharacterId: to, quantity: n }, { onSuccess: onClose });
  }

  return (
    <form className={styles.give} onSubmit={submit} aria-label={`Give ${item.name} to…`}>
      <fieldset className={styles.members}>
        <legend className={styles.label}>{`Give ${item.name} to…`}</legend>
        {roster.isPending && <p className={styles.muted}>Calling the party…</p>}
        {roster.isError && <p className={styles.alert}>{friendlyMessage(roster.error)}</p>}
        {roster.isSuccess && others.length === 0 && <p className={styles.muted}>No one else is in the party.</p>}
        {uses.map(u => (
          <label key={u.id} className={styles.member}>
            <input type="radio" name={`${id}-to`} value={u.id} checked={to === u.id} onChange={() => setTo(u.id)} />
            <span className={styles.name}>{u.name}</span>
            <span className={u.state === 'locked' ? styles.lockedText : styles.muted}>
              {[...u.check.results.map(r => `${ABILITY_SHORT[r.stat]} ${r.actual}`), STATE_TEXT[u.state]].join(' · ')}
            </span>
          </label>
        ))}
      </fieldset>
      {item.quantity > 1 && (
        <div className={styles.field}>
          <label htmlFor={`${id}-qty`} className={styles.label}>
            {`How many (of ${item.quantity})`}
          </label>
          <Input
            id={`${id}-qty`}
            type="number"
            min={1}
            max={item.quantity}
            step={1}
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />
        </div>
      )}
      <div className={styles.actions}>
        <Button type="submit" disabled={!recipient || !validQuantity || offer.isPending}>
          {recipient ? `Offer to ${recipient.name}` : 'Choose who to offer it to'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
      </div>
      <p className={styles.muted}>They must accept before it moves.</p>
      {offer.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(offer.error)}
        </p>
      )}
    </form>
  );
}
