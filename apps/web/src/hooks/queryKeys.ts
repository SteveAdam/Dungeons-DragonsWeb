export const queryKeys = {
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaigns', id] as const,
  inviteCode: (id: string) => ['campaigns', id, 'invite-code'] as const,
  members: (id: string) => ['campaigns', id, 'members'] as const,
  myRole: (id: string) => ['campaigns', id, 'my-role'] as const,
  maps: (id: string, includeHidden: boolean) => ['campaigns', id, 'maps', { includeHidden }] as const,
  map: (mapId: string, includeHidden: boolean) => ['maps', mapId, { includeHidden }] as const,
  pins: (mapId: string, includeHidden: boolean) => ['maps', mapId, 'pins', { includeHidden }] as const,
  regions: (mapId: string, includeHidden: boolean) => ['maps', mapId, 'regions', { includeHidden }] as const,
  subMaps: (mapId: string, includeHidden: boolean, pinIds: string[]) =>
    ['maps', mapId, 'submaps', { includeHidden, pins: pinIds.join(',') }] as const,
  mapTrail: (mapId: string, includeHidden: boolean) => ['maps', mapId, 'trail', { includeHidden }] as const,
  characters: (campaignId: string) => ['campaigns', campaignId, 'characters'] as const,
  character: (characterId: string) => ['characters', characterId] as const,
  characterEffects: (characterId: string) => ['characters', characterId, 'effects'] as const,
  effectSecrets: (characterId: string, effectIds: string[]) =>
    ['characters', characterId, 'effect-secrets', effectIds.join(',')] as const,
  registry: (campaignId: string) => ['campaigns', campaignId, 'registry'] as const,
  entities: (campaignId: string, includeHidden: boolean) =>
    ['campaigns', campaignId, 'registry', 'entities', { includeHidden }] as const,
  entityFolders: (campaignId: string) => ['campaigns', campaignId, 'registry', 'folders'] as const,
  entityLinks: (campaignId: string, includeHidden: boolean) =>
    ['campaigns', campaignId, 'registry', 'links', { includeHidden }] as const,
  pinNotes: (pinId: string) => ['pins', pinId, 'notes'] as const,
  mapImage: (path: string) => ['map-image', path] as const,
};
