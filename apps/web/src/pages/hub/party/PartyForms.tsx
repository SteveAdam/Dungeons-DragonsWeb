import { formatPurse, shareEvenly } from '@dnd-manager/rules-engine';
import { useId, useState, type FormEvent } from 'react';
import { Button, Input } from '../../../components/ui';
import type { CharacterSummary } from '../../../data/characters';
import { friendlyMessage } from '../../../data/errors';
import {
  LEDGER_SOURCES,
  toPurse,
  WALLET_COINS,
  type Coins,
  type LedgerSource,
  type OwnerType,
  type Party,
  type Wallet,
} from '../../../data/party';
import { useAwardCoins, useAwardXp, useDepositToParty } from '../../../hooks/useParty';
import hub from '../hub.module.css';
import styles from './party.module.css';

const SOURCE_LABELS: Record<LedgerSource, string> = {
  encounter: 'Encounter',
  quest: 'Quest',
  milestone: 'Milestone',
  other: 'Other',
};
const COIN_LABELS: Record<keyof Coins, string> = { pp: 'Platinum', gp: 'Gold', sp: 'Silver', cp: 'Copper' };
const EMPTY: Coins = { cp: 0, sp: 0, gp: 0, pp: 0 };
const hasCoins = (c: Coins) => WALLET_COINS.some(k => c[k] > 0);
/** A whole number of 0 or more from an input; anything else counts as 0. */
const whole = (value: string) => (/^\d+$/.test(value) ? Number(value) : 0);

interface TargetProps {
  campaignId: string;
  party: Party;
  characters: CharacterSummary[];
}

/** "party" or a character id, as one select value. */
const toTarget = (value: string, party: Party): { targetType: OwnerType; targetId: string } =>
  value === 'party' ? { targetType: 'party', targetId: party.id } : { targetType: 'character', targetId: value };

function TargetSelect({
  id,
  value,
  onChange,
  characters,
  partyLabel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  characters: CharacterSummary[];
  partyLabel: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        To
      </label>
      <select id={id} value={value} onChange={e => onChange(e.target.value)} className={styles.select}>
        <option value="party">{partyLabel}</option>
        {characters.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function SourceSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: LedgerSource;
  onChange: (v: LedgerSource) => void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Source
      </label>
      <select id={id} value={value} onChange={e => onChange(e.target.value as LedgerSource)} className={styles.select}>
        {LEDGER_SOURCES.map(s => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

function NoteField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className={`${styles.field} ${styles.grow}`}>
      <label htmlFor={id} className={styles.label}>
        Note
      </label>
      <Input id={id} value={value} maxLength={500} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function CoinFields({ idBase, value, onChange }: { idBase: string; value: Coins; onChange: (c: Coins) => void }) {
  return (
    <fieldset className={styles.coins}>
      <legend className={styles.label}>Coins</legend>
      {WALLET_COINS.map(k => (
        <div key={k} className={styles.coin}>
          <label htmlFor={`${idBase}-${k}`}>{`${COIN_LABELS[k]} (${k.toUpperCase()})`}</label>
          <Input
            id={`${idBase}-${k}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            step={1}
            value={value[k] || ''}
            placeholder="0"
            onChange={e => onChange({ ...value, [k]: whole(e.target.value) })}
          />
        </div>
      ))}
    </fieldset>
  );
}

function Outcome({ error, done }: { error: unknown; done: string | null }) {
  if (error)
    return (
      <p role="alert" className={hub.alert}>
        {friendlyMessage(error)}
      </p>
    );
  return done ? (
    <p role="status" className={styles.done}>
      {done}
    </p>
  ) : null;
}

/** DM: XP to the Party (shared evenly; the remainder is recorded, not given) or to one character. */
export function AwardXpForm({ campaignId, party, characters }: TargetProps) {
  const id = useId();
  const award = useAwardXp(campaignId);
  const [target, setTarget] = useState('party');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<LedgerSource>('encounter');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const xp = whole(amount);
  const n = party.memberIds.length;
  const share = target === 'party' && n > 0 && xp > 0 ? shareEvenly(xp, n) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const name = target === 'party' ? party.name : characters.find(c => c.id === target)?.name;
    award.mutate(
      { ...toTarget(target, party), amount: xp, source, note: note.trim() },
      {
        onSuccess: () => {
          setDone(`Awarded ${xp.toLocaleString('en')} XP to ${name}.`);
          setAmount('');
          setNote('');
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.formTitle}>
        Award XP
      </h3>
      <div className={styles.fields}>
        <TargetSelect
          id={`${id}-to`}
          value={target}
          onChange={setTarget}
          characters={characters}
          partyLabel={`${party.name} (shared)`}
        />
        <div className={styles.field}>
          <label htmlFor={`${id}-xp`} className={styles.label}>
            XP
          </label>
          <Input
            id={`${id}-xp`}
            type="number"
            inputMode="numeric"
            min={1}
            max={1000000}
            step={1}
            required
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <SourceSelect id={`${id}-source`} value={source} onChange={setSource} />
        <NoteField id={`${id}-note`} value={note} onChange={setNote} />
      </div>
      {target === 'party' && (
        <p className={hub.muted}>
          {n === 0
            ? 'The party has no members to share XP.'
            : share
              ? `Each of ${n} gets ${share.each.toLocaleString('en')} XP${
                  share.remainder ? `; ${share.remainder} XP is left over and not awarded` : ''
                }.`
              : `Shared evenly among ${n}; any remainder is recorded, not awarded.`}
        </p>
      )}
      <Button type="submit" disabled={xp < 1 || award.isPending || (target === 'party' && n === 0)}>
        {award.isPending ? 'Awarding…' : 'Award XP'}
      </Button>
      <Outcome error={award.error} done={done} />
    </form>
  );
}

/** DM: coins into the party pool or one character's purse. */
export function AwardCoinsForm({ campaignId, party, characters }: TargetProps) {
  const id = useId();
  const award = useAwardCoins(campaignId);
  const [target, setTarget] = useState('party');
  const [coins, setCoins] = useState<Coins>(EMPTY);
  const [source, setSource] = useState<LedgerSource>('encounter');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const name = target === 'party' ? 'the party pool' : characters.find(c => c.id === target)?.name;
    award.mutate(
      { ...toTarget(target, party), coins, source, note: note.trim() },
      {
        onSuccess: () => {
          setDone(`Gave ${formatPurse(toPurse(coins))} to ${name}.`);
          setCoins(EMPTY);
          setNote('');
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.formTitle}>
        Award coins
      </h3>
      <div className={styles.fields}>
        <TargetSelect
          id={`${id}-to`}
          value={target}
          onChange={setTarget}
          characters={characters}
          partyLabel="The party pool"
        />
        <SourceSelect id={`${id}-source`} value={source} onChange={setSource} />
        <NoteField id={`${id}-note`} value={note} onChange={setNote} />
      </div>
      <CoinFields idBase={`${id}-coin`} value={coins} onChange={setCoins} />
      <Button type="submit" disabled={!hasCoins(coins) || award.isPending}>
        {award.isPending ? 'Awarding…' : 'Award coins'}
      </Button>
      <Outcome error={award.error} done={done} />
    </form>
  );
}

/** A player moves coins from their own character's purse into the party pool. */
export function DepositForm({
  campaignId,
  characters,
  wallets,
}: {
  campaignId: string;
  characters: CharacterSummary[];
  wallets: Wallet[];
}) {
  const id = useId();
  const deposit = useDepositToParty(campaignId);
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? '');
  const [coins, setCoins] = useState<Coins>(EMPTY);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const purse = wallets.find(w => w.ownerType === 'character' && w.ownerId === characterId);
  const short = !!purse && WALLET_COINS.some(k => coins[k] > purse[k]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    deposit.mutate(
      { characterId, coins, note: note.trim() },
      {
        onSuccess: () => {
          setDone(`Deposited ${formatPurse(toPurse(coins))} into the pool.`);
          setCoins(EMPTY);
          setNote('');
        },
      },
    );
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Deposit into the party pool">
      <div className={styles.fields}>
        {characters.length > 1 && (
          <div className={styles.field}>
            <label htmlFor={`${id}-from`} className={styles.label}>
              From
            </label>
            <select
              id={`${id}-from`}
              value={characterId}
              onChange={e => setCharacterId(e.target.value)}
              className={styles.select}
            >
              {characters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <NoteField id={`${id}-note`} value={note} onChange={setNote} />
      </div>
      <CoinFields idBase={`${id}-coin`} value={coins} onChange={setCoins} />
      {short && <p className={hub.alert}>That is more than the purse holds.</p>}
      <Button type="submit" disabled={!hasCoins(coins) || short || deposit.isPending}>
        {deposit.isPending ? 'Depositing…' : 'Deposit'}
      </Button>
      <Outcome error={deposit.error} done={done} />
    </form>
  );
}
