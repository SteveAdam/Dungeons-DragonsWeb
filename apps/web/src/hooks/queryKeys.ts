export const queryKeys = {
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaigns', id] as const,
  inviteCode: (id: string) => ['campaigns', id, 'invite-code'] as const,
  members: (id: string) => ['campaigns', id, 'members'] as const,
  myRole: (id: string) => ['campaigns', id, 'my-role'] as const,
  maps: (id: string, includeHidden: boolean) => ['campaigns', id, 'maps', { includeHidden }] as const,
};
