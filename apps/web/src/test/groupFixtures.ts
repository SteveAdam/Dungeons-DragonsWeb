import type { PartyGroup } from '../data/partyGroups';

/** A party group with every field filled in; override what a test cares about. */
export const aGroup = (over: Partial<PartyGroup> = {}): PartyGroup => ({
  id: 'g1',
  name: 'Group 1',
  color: '#8E2A22',
  mapId: null,
  regionId: null,
  x: null,
  y: null,
  memberCount: (over.characterIds ?? []).length,
  mapName: null,
  regionName: null,
  characterIds: [],
  ...over,
});
