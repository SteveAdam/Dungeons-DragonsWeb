import { supabase } from '../lib/supabase';
import { DataError, toDataError } from './errors';

export type Role = 'dm' | 'player';

export interface Member {
  userId: string;
  role: Role;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
}

interface MemberRow {
  user_id: string;
  role: string;
  joined_at: string;
}
interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

const toRole = (role: string): Role => (role === 'dm' ? 'dm' : 'player');

/**
 * Members with their names and avatars. members and profiles both point at auth.users but not at each
 * other, so this is two small queries joined here. Profiles are readable for people in a shared campaign.
 */
export async function listMembers(campaignId: string): Promise<Member[]> {
  const { data: rows, error } = await supabase
    .from('members')
    .select('user_id, role, joined_at')
    .eq('campaign_id', campaignId);
  if (error) throw toDataError(error);
  const members = (rows ?? []) as MemberRow[];
  if (members.length === 0) return [];

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in(
      'id',
      members.map(m => m.user_id),
    );
  if (profileError) throw toDataError(profileError);
  const profiles = new Map(((profileRows ?? []) as ProfileRow[]).map(p => [p.id, p]));

  return members
    .map((m): Member => {
      const profile = profiles.get(m.user_id);
      return {
        userId: m.user_id,
        role: toRole(m.role),
        joinedAt: m.joined_at,
        displayName: profile?.display_name?.trim() || 'Adventurer',
        avatarUrl: profile?.avatar_url ?? null,
      };
    })
    .sort((a, b) => (a.role === b.role ? a.joinedAt.localeCompare(b.joinedAt) : a.role === 'dm' ? -1 : 1));
}

/** My role in a campaign, or null if I am not a member. */
export async function getMyRole(campaignId: string): Promise<Role | null> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new DataError('signed-out');

  const { data, error } = await supabase
    .from('members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data ? toRole((data as { role: string }).role) : null;
}

/**
 * Removes someone from a campaign (DMs only; the database refuses anyone else). The last DM cannot be
 * removed. Their access ends at once: every policy checks membership on each request.
 */
export async function removeMember(campaignId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('members')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) {
    if (error.message === 'A campaign must keep at least one DM') {
      throw new DataError('validation', 'A campaign must keep at least one DM.');
    }
    throw toDataError(error);
  }
  // Row level security hides rows instead of raising, so "nothing deleted" means "not allowed".
  if (!data || data.length === 0) throw new DataError('forbidden');
}
