export const queryKeys = {
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaigns', id] as const,
  inviteCode: (id: string) => ['campaigns', id, 'invite-code'] as const,
  members: (id: string) => ['campaigns', id, 'members'] as const,
  myRole: (id: string) => ['campaigns', id, 'my-role'] as const,
  maps: (id: string, includeHidden: boolean) => ['campaigns', id, 'maps', { includeHidden }] as const,
  map: (mapId: string, includeHidden: boolean) => ['maps', mapId, { includeHidden }] as const,
  pins: (mapId: string, includeHidden: boolean) => ['maps', mapId, 'pins', { includeHidden }] as const,
  pinNotes: (pinId: string) => ['pins', pinId, 'notes'] as const,
  mapImage: (path: string) => ['map-image', path] as const,
};
