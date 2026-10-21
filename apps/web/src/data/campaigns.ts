import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export interface Campaign {
  id: string;
  name: string;
  rulesEdition: '2014' | '2024';
  nextSessionAt: string | null;
  createdAt: string;
}

interface CampaignRow {
  id: string;
  name: string;
  rules_edition: string;
  next_session_at: string | null;
  created_at: string;
}

const COLUMNS = 'id, name, rules_edition, next_session_at, created_at';

const toCampaign = (r: CampaignRow): Campaign => ({
  id: r.id,
  name: r.name,
  rulesEdition: r.rules_edition === '2014' ? '2014' : '2024',
  nextSessionAt: r.next_session_at,
  createdAt: r.created_at,
});

/** The campaigns I belong to (row level security does the filtering). */
export async function listCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from('campaigns').select(COLUMNS).order('created_at', { ascending: true });
  if (error) throw toDataError(error);
  return ((data ?? []) as CampaignRow[]).map(toCampaign);
}

export async function getCampaign(id: string): Promise<Campaign> {
  const { data, error } = await supabase.from('campaigns').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDataError(error);
  if (!data) throw new DataError('not-found');
  return toCampaign(data as CampaignRow);
}

/** The creator becomes the DM (a database trigger adds them to members). */
export async function createCampaign(name: string): Promise<Campaign> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 120) {
    throw new DataError('validation', 'Give your campaign a name of 1 to 120 characters.');
  }
  const { data, error } = await supabase.from('campaigns').insert({ name: clean }).select(COLUMNS).single();
  if (error) throw toDataError(error);
  return toCampaign(data as CampaignRow);
}

/** Joins as a player and returns the campaign id. Calls the join_campaign function. */
export async function joinCampaign(code: string): Promise<string> {
  const clean = code.trim();
  if (!clean) throw new DataError('validation', 'Enter the invite code from your DM.');
  const { data, error } = await supabase.rpc('join_campaign', { code: clean });
  if (error) throw toDataError(error);
  return data as string;
}

/** The invite code. Only DMs can read it: for everyone else this returns null. */
export async function getInviteCode(campaignId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('campaign_secrets')
    .select('invite_code')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw toDataError(error);
  return (data as { invite_code: string } | null)?.invite_code ?? null;
}
