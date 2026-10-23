// P2-7: the Pack tab. What the character carries, with requirement locks, equip and attune switches, giving
// (offers the recipient must accept), the inbox of offers, the party's shared inventory and the transfer history.
// The DM also creates items, edits their rules and moves them. Every rule comes from the rules engine or the
// database; this screen only shows them.
import {
  carriedWeight,
  checkRequirements,
  EQUIPPABLE_KINDS,
  itemEffects,
  MAX_ATTUNED,
  type Effect,
  type GameClock,
} from '@dnd-manager/rules-engine';
import { Lock, LockOpen } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { Button, ICON_PROPS, Tag, Toggle } from '../../../components/ui';
import type { Character } from '../../../data/characters';
import { friendlyMessage } from '../../../data/errors';
import type { Item, Transfer } from '../../../data/items';
import {
  useAttuneItem,
  useCharacterItems,
  useEquipItem,
  useItems,
  useResolveTransfer,
  useTransfers,
} from '../../../hooks/useItems';
import { GiveDialog } from './GiveDialog';
import styles from './pack.module.css';

// the DM's tools carry the SRD weapon and armour lists, so they load only in DM mode
const DmItemTools = lazy(() => import('./DmItemTools'));

const ABILITY_SHORT = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' } as const;
const KIND_LABELS: Record<Item['kind'], string> = {
  weapon: 'Weapon',
  armor: 'Armour',
  shield: 'Shield',
  gear: 'Gear',
  magic: 'Magic item',
  consumable: 'Consumable',
  quest: 'Quest item',
};
const pounds = (n: number) => `${n.toLocaleString('en', { maximumFractionDigits: 2 })} lb`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Props {
  campaignId: string;
  character: Character;
  effects: readonly Effect[];
  clock: GameClock;
  dmMode: boolean;
}

export function PackTab({ campaignId, character, effects, clock, dmMode }: Props) {
  const items = useCharacterItems(character.id);
  const all = useItems(campaignId);
  const transfers = useTransfers(campaignId);
  const resolve = useResolveTransfer(campaignId);
  const [giving, setGiving] = useState<string | null>(null);

  if (items.isError) return <ErrorNotice error={items.error} onRetry={() => items.refetch()} />;
  if (!items.data)
    return (
      <p role="status" className={styles.status}>
        Opening the pack…
      </p>
    );

  const carried = items.data;
  const partyItems = (all.data ?? []).filter(i => i.ownerType === 'party');
  const mine = (t: Transfer, side: 'from' | 'to') =>
    t[`${side}Type`] === 'character' && t[`${side}Id`] === character.id;
  const inbox = (transfers.data ?? []).filter(t => t.status === 'pending' && mine(t, 'to'));
  const outbox = (transfers.data ?? []).filter(t => t.status === 'pending' && mine(t, 'from'));
  const history = (transfers.data ?? []).filter(t => t.status !== 'pending' && (mine(t, 'from') || mine(t, 'to')));
  // requirements are checked with the character's own effects and those their items grant
  const allEffects = [...effects, ...itemEffects(carried)];
  const attunedCount = carried.filter(i => i.attuned).length;

  return (
    <div className={styles.pack}>
      <p className={styles.weight}>{`Carrying ${pounds(carriedWeight(carried))}`}</p>

      {inbox.length > 0 && (
        <section aria-label="Offers for you" className={styles.inbox}>
          {inbox.map(t => (
            <div key={t.id} role="status" className={styles.offer}>
              <span>{`${t.fromName} offers you ${t.itemName}${t.quantity > 1 ? ` (${t.quantity})` : ''}.`}</span>
              <Button
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ transferId: t.id, action: 'accept' })}
              >
                Accept
              </Button>
              <Button
                variant="ghost"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ transferId: t.id, action: 'decline' })}
              >
                Decline
              </Button>
            </div>
          ))}
        </section>
      )}
      {resolve.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(resolve.error)}
        </p>
      )}

      <section aria-labelledby="pack-carried" className={styles.section}>
        <h2 id="pack-carried" className={styles.heading}>
          Carried
        </h2>
        <p className={styles.muted}>{`Attuned to ${attunedCount} of ${MAX_ATTUNED} items.`}</p>
        {carried.length === 0 ? (
          <p className={styles.muted}>Nothing carried.</p>
        ) : (
          <ul className={styles.items}>
            {carried.map(item => {
              const offer = outbox.find(t => t.itemId === item.id);
              return (
                <li key={item.id} className={styles.item}>
                  <ItemRow
                    campaignId={campaignId}
                    item={item}
                    character={character}
                    effects={allEffects}
                    clock={clock}
                    attunedCount={attunedCount}
                  />
                  <div className={styles.actions}>
                    {item.bound ? (
                      <Tag>Bound, can’t give</Tag>
                    ) : offer ? (
                      <>
                        <span className={styles.muted}>{`Offered to ${offer.toName}, waiting`}</span>
                        <Button
                          variant="ghost"
                          disabled={resolve.isPending}
                          onClick={() => resolve.mutate({ transferId: offer.id, action: 'cancel' })}
                        >
                          Cancel offer
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        aria-expanded={giving === item.id}
                        onClick={() => setGiving(giving === item.id ? null : item.id)}
                      >
                        {`Give ${item.name}`}
                      </Button>
                    )}
                  </div>
                  {giving === item.id && (
                    <GiveDialog
                      campaignId={campaignId}
                      item={item}
                      fromCharacterId={character.id}
                      clock={clock}
                      onClose={() => setGiving(null)}
                    />
                  )}
                  {dmMode && (
                    <Suspense fallback={null}>
                      <DmItemTools mode="edit" campaignId={campaignId} item={item} />
                    </Suspense>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="pack-party" className={styles.section}>
        <h2 id="pack-party" className={styles.heading}>
          Party inventory
        </h2>
        {partyItems.length === 0 ? (
          <p className={styles.muted}>The party holds nothing in common.</p>
        ) : (
          <ul className={styles.items}>
            {partyItems.map(item => (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <span className={styles.name}>{item.name}</span>
                  {item.quantity > 1 && <span>{`× ${item.quantity}`}</span>}
                  <Tag>{KIND_LABELS[item.kind]}</Tag>
                </div>
                {dmMode && (
                  <Suspense fallback={null}>
                    <DmItemTools mode="edit" campaignId={campaignId} item={item} />
                  </Suspense>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {dmMode && (
        <Suspense fallback={<p className={styles.muted}>Fetching the DM’s tools…</p>}>
          <DmItemTools mode="create" campaignId={campaignId} characterId={character.id} />
        </Suspense>
      )}

      <section aria-labelledby="pack-history" className={styles.section}>
        <h2 id="pack-history" className={styles.heading}>
          Transfer history
        </h2>
        {history.length === 0 ? (
          <p className={styles.muted}>Nothing has changed hands yet.</p>
        ) : (
          <ol className={styles.history} aria-label="Transfers">
            {history.map(t => (
              <li key={t.id}>
                <span className={styles.name}>{`${t.itemName}${t.quantity > 1 ? ` (${t.quantity})` : ''}`}</span>
                {` · ${t.fromName} → ${t.toName} · `}
                <span className={styles.status}>{t.status}</span>
                {' · '}
                <time dateTime={t.resolvedAt ?? t.createdAt} className={styles.when}>
                  {when(t.resolvedAt ?? t.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ItemRow({
  campaignId,
  item,
  character,
  effects,
  clock,
  attunedCount,
}: {
  campaignId: string;
  item: Item;
  character: Character;
  effects: readonly Effect[];
  clock: GameClock;
  attunedCount: number;
}) {
  const equip = useEquipItem(campaignId);
  const attune = useAttuneItem(campaignId);
  const [note, setNote] = useState<string | null>(null);
  const requirements = item.definition.requirements ?? [];
  const check = requirements.length
    ? checkRequirements({ id: item.id, name: item.name, requirements }, character.sheet.abilityScores, effects, clock)
    : null;
  const locked = check && !check.usable;
  const lifted = check?.results.find(r => r.metByEffect)?.metByEffect;
  const error = equip.error ?? attune.error;

  return (
    <>
      <div className={styles.itemHead}>
        <span className={styles.name}>{item.name}</span>
        {item.quantity > 1 && <span>{`× ${item.quantity}`}</span>}
        <Tag>{KIND_LABELS[item.kind]}</Tag>
        {item.rarity && <span className={styles.muted}>{item.rarity}</span>}
        {item.equipped && <Tag>Equipped</Tag>}
        {item.attuned && <Tag>Attuned</Tag>}
      </div>
      {check && (
        <p className={locked ? styles.locked : styles.unlocked}>
          {locked ? <Lock {...ICON_PROPS} /> : <LockOpen {...ICON_PROPS} />}
          <span>
            {locked
              ? `Locked: ${check.results
                  .filter(r => !r.met)
                  .map(r => `needs ${ABILITY_SHORT[r.stat]} ${r.required}, you have ${r.actual}`)
                  .join('; ')}`
              : lifted
                ? `Usable thanks to ${lifted.name}`
                : `Needs ${check.results.map(r => `${ABILITY_SHORT[r.stat]} ${r.required}`).join(', ')}: met`}
          </span>
        </p>
      )}
      {item.damaged && <p className={styles.alert}>This item’s rules could not be read; ask the DM to fix them.</p>}
      {item.definition.description && <p className={styles.description}>{item.definition.description}</p>}
      <div className={styles.toggles}>
        {EQUIPPABLE_KINDS.includes(item.kind) && (
          <Toggle
            checked={item.equipped}
            onChange={on => {
              attune.reset();
              equip.mutate({ itemId: item.id, on });
            }}
            label={`Equip ${item.name}`}
          />
        )}
        {item.requiresAttunement && (
          <Toggle
            checked={item.attuned}
            onChange={on => {
              equip.reset();
              setNote(null);
              if (on && attunedCount >= MAX_ATTUNED) {
                setNote(
                  `You are attuned to ${MAX_ATTUNED} items already, the most anyone can be. End attunement to one first.`,
                );
                return;
              }
              attune.mutate({ itemId: item.id, on });
            }}
            label={`Attune to ${item.name}`}
          />
        )}
      </div>
      {(note || error) && (
        <p role="alert" className={styles.alert}>
          {note ?? friendlyMessage(error)}
        </p>
      )}
    </>
  );
}
