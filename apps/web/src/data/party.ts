// P2-6: the official Party, wallets and the XP and coin ledger. Every change goes through the database
// functions (award_xp, award_coins, split_party_gold, deposit_to_party); the ledger is written by the database
// itself, so wallets and XP always equal its sum. Row level security decides what each person reads.
import type { Purse } from '@dnd-manager/rules-engine';
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import { DataError, toDataError } from './errors';

/** The coins a wallet holds. Electrum is not used (see 0012_party_ledger.sql). */
export interface Coins {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}
export const WALLET_COINS = ['pp', 'gp', 'sp', 'cp'] as const satisfies readonly (keyof Coins)[];

export type OwnerType = 'character' | 'party';
export const LEDGER_SOURCES = ['encounter', 'quest', 'milestone', 'other'] as const;
export type LedgerSource = (typeof LEDGER_SOURCES)[number];

export interface Party {
  id: string;
  name: string;
  /** The characters in it, by id. */
  memberIds: string[];
}

export interface Wallet extends Coins {
  ownerType: OwnerType;
  ownerId: string;
}

export interface LedgerEntry {
  id: string;
  kind: 'xp' | 'coin';
  targetType: OwnerType;
  targetId: string;
  /** XP gained (or the coins' change, below); 0 on a remainder note. */
  xp: number;
  coins: Coins;
  /** What an award or split left over, which nobody received. */
  remainder: number | Coins | null;
  source: LedgerSource;
  note: string;
  createdAt: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const coinsOf = (v: Record<string, unknown>): Coins => ({ cp: num(v.cp), sp: num(v.sp), gp: num(v.gp), pp: num(v.pp) });

/** A purse for the rules engine's formatPurse and splitPurse. */
export const toPurse = (c: Coins): Purse => ({ cp: c.cp, sp: c.sp, gp: c.gp, pp: c.pp });

/** The campaign's official Party, with its members. Every campaign has one (made with it). */
export async function getParty(campaignId: string): Promise<Party> {
  const { data, error } = await supabase
    .from('parties')
    .select('entity_id, entities(name), party_members(character_id)')
    .eq('campaign_id', campaignId)
    .eq('is_official', true)
    .maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('not-found', 'This campaign has no Party yet.');
  return {
    id: data.entity_id,
    name: data.entities?.name ?? 'The Party',
    memberIds: (data.party_members ?? []).map(m => m.character_id),
  };
}

/** The wallets the viewer may read: their characters' and the party's, or every one for the DM. */
export async function listWallets(campaignId: string): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallets')
    .select('owner_type, owner_id, cp, sp, gp, pp')
    .eq('campaign_id', campaignId);
  if (error) throw toDataError(error);
  return (data ?? []).map(w => ({
    ownerType: w.owner_type as OwnerType,
    ownerId: w.owner_id,
    cp: w.cp,
    sp: w.sp,
    gp: w.gp,
    pp: w.pp,
  }));
}

export const LEDGER_PAGE = 200;

/** The newest ledger entries the viewer may read (the ones about their characters and the party; all for the DM). */
export async function listLedger(campaignId: string): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('ledger')
    .select('id, kind, target_type, target_id, amount, source, note, created_at')
    .eq('campaign_id', campaignId)
    .order('seq', { ascending: false })
    .limit(LEDGER_PAGE);
  if (error) throw toDataError(error);
  return (data ?? []).map(r => {
    const amount = (r.amount ?? {}) as Record<string, unknown>;
    const rest = amount.remainder;
    return {
      id: r.id,
      kind: r.kind as LedgerEntry['kind'],
      targetType: r.target_type as OwnerType,
      targetId: r.target_id,
      xp: num(amount.xp),
      coins: coinsOf(amount),
      remainder:
        typeof rest === 'number'
          ? rest
          : rest && typeof rest === 'object'
            ? coinsOf(rest as Record<string, unknown>)
            : null,
      source: r.source as LedgerSource,
      note: r.note,
      createdAt: r.created_at,
    };
  });
}

/** Only the coins given, so the database sees {"gp": 10} rather than zeros. */
const coinsJson = (c: Partial<Coins>): Json =>
  Object.fromEntries(WALLET_COINS.filter(k => (c[k] ?? 0) > 0).map(k => [k, c[k] as number]));

async function call(fn: () => PromiseLike<{ error: { code: string; message: string } | null }>) {
  const { error } = await fn();
  if (!error) return;
  // the functions' own messages ("Not enough coins: …") are written for people
  if (error.code === '22023') throw new DataError('validation', error.message);
  throw toDataError(error);
}

export interface XpAward {
  targetType: OwnerType;
  targetId: string;
  amount: number;
  source: LedgerSource;
  note: string;
}

/** DM only. To the Party it is shared evenly among the members; the remainder is recorded, not given. */
export const awardXp = (a: XpAward) =>
  call(() =>
    supabase.rpc('award_xp', {
      p_target_type: a.targetType,
      p_target_id: a.targetId,
      p_amount: a.amount,
      p_source: a.source,
      p_note: a.note,
    }),
  );

export interface CoinAward {
  targetType: OwnerType;
  targetId: string;
  coins: Partial<Coins>;
  source: LedgerSource;
  note: string;
}

/** DM only: coins into a character's wallet or the party pool. */
export const awardCoins = (a: CoinAward) =>
  call(() =>
    supabase.rpc('award_coins', {
      p_target_type: a.targetType,
      p_target_id: a.targetId,
      p_coins: coinsJson(a.coins),
      p_note: a.note,
      p_source: a.source,
    }),
  );

/** DM only: shares the pool among the members, coin by coin; what does not divide stays in it. */
export const splitPartyGold = (partyId: string) => call(() => supabase.rpc('split_party_gold', { p_party: partyId }));

/** From your own character's wallet into the party pool. */
export const depositToParty = (characterId: string, coins: Partial<Coins>, note: string) =>
  call(() => supabase.rpc('deposit_to_party', { p_character: characterId, p_coins: coinsJson(coins), p_note: note }));
