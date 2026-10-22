import { formatPurse, levelProgress, splitPurse } from '@dnd-manager/rules-engine';
import { ScrollText } from 'lucide-react';
import { ErrorNotice } from '../../../components/ErrorNotice';
import { Button, IconLink, Tag } from '../../../components/ui';
import type { CharacterSummary } from '../../../data/characters';
import { friendlyMessage } from '../../../data/errors';
import { toPurse, type Party, type Wallet } from '../../../data/party';
import { useCharacters } from '../../../hooks/useCharacters';
import { useLedger, useParty, useSplitPartyGold, useWallets } from '../../../hooks/useParty';
import hub from '../hub.module.css';
import { LedgerList } from './LedgerList';
import styles from './party.module.css';
import { AwardCoinsForm, AwardXpForm, DepositForm } from './PartyForms';

const thousands = (n: number) => n.toLocaleString('en');

interface Props {
  campaignId: string;
  /** A DM with DM mode on: the award forms, the split button and every wallet. */
  dmMode: boolean;
}

/**
 * The official Party (P2-6). The DM sees every member's level and XP, the shared pool, the award forms and the
 * whole ledger. A player sees their own characters, their purses, the pool (read-only) and a deposit form.
 * Every figure comes from the wallets and XP columns, which the database keeps equal to the ledger's sum.
 */
export function PartyTab({ campaignId, dmMode }: Props) {
  const party = useParty(campaignId);
  const characters = useCharacters(campaignId);
  const wallets = useWallets(campaignId);
  const ledger = useLedger(campaignId);

  const failed = [party, characters, wallets].find(q => q.isError);
  if (failed) return <ErrorNotice error={failed.error} onRetry={() => failed.refetch()} />;
  if (!party.data || !characters.data || !wallets.data)
    return (
      <p role="status" className={hub.status}>
        Mustering the party…
      </p>
    );

  const memberSet = new Set(party.data.memberIds);
  const members = characters.data.filter(c => memberSet.has(c.id));
  const unseen = party.data.memberIds.length - members.length;
  const pool = wallets.data.find(w => w.ownerType === 'party' && w.ownerId === party.data.id);
  const mine = characters.data.filter(c => wallets.data.some(w => w.ownerType === 'character' && w.ownerId === c.id));

  return (
    <div className={styles.layout}>
      <section aria-labelledby="party-members" className={styles.section}>
        <h2 id="party-members" className={styles.heading}>
          {`${party.data.name} · ${party.data.memberIds.length} ${party.data.memberIds.length === 1 ? 'member' : 'members'}`}
        </h2>
        {members.length === 0 ? (
          <p className={hub.muted}>No characters in the party yet.</p>
        ) : (
          <ul className={hub.list}>
            {members.map(c => (
              <MemberRow key={c.id} campaignId={campaignId} character={c} />
            ))}
          </ul>
        )}
        {unseen > 0 && (
          <p className={hub.muted}>{`and ${unseen} ${unseen === 1 ? 'other adventurer' : 'other adventurers'}`}</p>
        )}
      </section>

      <section aria-labelledby="party-coins" className={styles.section}>
        <h2 id="party-coins" className={styles.heading}>
          Coins
        </h2>
        <Pool party={party.data} pool={pool} campaignId={campaignId} canSplit={dmMode} />
        {!dmMode &&
          mine.map(c => {
            const w = wallets.data.find(x => x.ownerType === 'character' && x.ownerId === c.id);
            return (
              <div key={c.id} className={styles.purse}>
                <span className={styles.label}>{`${c.name}’s purse`}</span>
                <b>{w ? formatPurse(toPurse(w)) : '0 GP'}</b>
              </div>
            );
          })}
        {dmMode && (
          <ul className={styles.purses} aria-label="Members’ purses">
            {members.map(c => {
              const w = wallets.data.find(x => x.ownerType === 'character' && x.ownerId === c.id);
              return (
                <li key={c.id}>
                  <span>{c.name}</span> <b>{w ? formatPurse(toPurse(w)) : '0 GP'}</b>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {dmMode ? (
        <section aria-labelledby="party-awards" className={styles.section}>
          <h2 id="party-awards" className={styles.heading}>
            Awards
          </h2>
          <AwardXpForm campaignId={campaignId} party={party.data} characters={characters.data} />
          <AwardCoinsForm campaignId={campaignId} party={party.data} characters={characters.data} />
        </section>
      ) : (
        mine.length > 0 && (
          <section aria-labelledby="party-deposit" className={styles.section}>
            <h2 id="party-deposit" className={styles.heading}>
              Deposit into the pool
            </h2>
            <DepositForm campaignId={campaignId} characters={mine} wallets={wallets.data} />
          </section>
        )
      )}

      <section aria-labelledby="party-ledger" className={`${styles.section} ${styles.wide}`}>
        <h2 id="party-ledger" className={styles.heading}>
          Ledger
        </h2>
        {ledger.isError ? (
          <ErrorNotice error={ledger.error} onRetry={() => ledger.refetch()} />
        ) : ledger.data ? (
          <LedgerList entries={ledger.data} party={party.data} characters={characters.data} />
        ) : (
          <p role="status" className={hub.status}>
            Reading the ledger…
          </p>
        )}
      </section>
    </div>
  );
}

function MemberRow({ campaignId, character: c }: { campaignId: string; character: CharacterSummary }) {
  const p = levelProgress(c.xp, c.levelApplied);
  return (
    <li className={`${hub.row} ${styles.member}`}>
      <IconLink to={`/campaigns/${campaignId}/characters/${c.id}`} icon={ScrollText}>
        {c.name}
      </IconLink>
      <span>{`Level ${p.level} by XP`}</span>
      {p.pending > 0 && <Tag>{`${p.pending} ${p.pending === 1 ? 'level' : 'levels'} pending`}</Tag>}
      <span className={styles.xpText}>
        {p.nextLevelAt === null
          ? `${thousands(p.total)} XP: the highest level`
          : `${thousands(p.total)} of ${thousands(p.nextLevelAt)} XP`}
      </span>
      <div
        role="meter"
        aria-label={`${c.name}’s progress to level ${Math.min(20, p.level + 1)}`}
        aria-valuemin={0}
        aria-valuemax={p.intoLevel + p.toNext}
        aria-valuenow={p.intoLevel}
        className={styles.bar}
      >
        <div
          className={styles.fill}
          style={{ width: `${p.nextLevelAt === null ? 100 : (p.intoLevel / (p.intoLevel + p.toNext)) * 100}%` }}
        />
      </div>
    </li>
  );
}

function Pool({
  party,
  pool,
  campaignId,
  canSplit,
}: {
  party: Party;
  pool: Wallet | undefined;
  campaignId: string;
  canSplit: boolean;
}) {
  const split = useSplitPartyGold(campaignId);
  const purse = pool ? toPurse(pool) : {};
  const n = party.memberIds.length;
  const preview = n > 0 ? splitPurse(purse, n) : null;
  const shareable = !!preview && Object.keys(preview.each).length > 0;
  return (
    <div className={styles.purse}>
      <span className={styles.label}>Party pool</span>
      <b>{formatPurse(purse)}</b>
      {canSplit && (
        <>
          <p className={hub.muted}>
            {shareable
              ? `Splitting gives each of the ${n} members ${formatPurse(preview.each)}${
                  Object.keys(preview.remainder).length ? `; ${formatPurse(preview.remainder)} stays in the pool` : ''
                }.`
              : 'Not enough in the pool to give every member a coin.'}
          </p>
          <Button disabled={!shareable || split.isPending} onClick={() => split.mutate(party.id)}>
            {split.isPending ? 'Splitting…' : 'Split the pool'}
          </Button>
          {split.isError && (
            <p role="alert" className={hub.alert}>
              {friendlyMessage(split.error)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
