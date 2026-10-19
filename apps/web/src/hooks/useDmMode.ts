import { useDmModeStore } from '../state/dmModeStore';
import { useMyRole } from './useMembers';

/**
 * Whether DM mode is really on in this campaign. A player never has it, whatever the stored preference
 * says, and a DM with it switched off sees exactly what a player sees.
 */
export function useDmMode(campaignId: string | undefined) {
  const role = useMyRole(campaignId);
  const stored = useDmModeStore(s => s.dmMode);
  const setDmMode = useDmModeStore(s => s.setDmMode);
  const isDm = role.data === 'dm';
  return { isDm, dmMode: isDm && stored, setDmMode, roleLoading: role.isPending };
}
