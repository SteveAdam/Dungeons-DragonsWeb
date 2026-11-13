import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as groupsApi from '../data/groupTokens';
import * as membersApi from '../data/members';
import { SpotlightBanner } from './SpotlightBanner';

vi.mock('../data/groupTokens', async importOriginal => ({
  ...(await importOriginal<typeof import('../data/groupTokens')>()),
  getSpotlight: vi.fn(),
}));
vi.mock('../data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('../data/members')>()),
  getMyRole: vi.fn(),
}));

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SpotlightBanner campaignId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
});

describe('the spotlight banner', () => {
  it("tells the other groups where the spotlighted group is, and the DM's line", async () => {
    vi.mocked(groupsApi.getSpotlight).mockResolvedValue({
      groupId: 'g2',
      groupName: 'Group 2',
      place: 'The Drowned Vault',
      summary: 'Picking the lock',
      mine: false,
    });
    show();
    expect(await screen.findByRole('status')).toHaveTextContent('Group 2 is in The Drowned Vault: Picking the lock');
  });

  it('works without a line from the DM', async () => {
    vi.mocked(groupsApi.getSpotlight).mockResolvedValue({
      groupId: 'g2',
      groupName: 'Group 2',
      place: 'The Drowned Vault',
      summary: '',
      mine: false,
    });
    show();
    expect(await screen.findByRole('status')).toHaveTextContent(/^Group 2 is in The Drowned Vault$/);
  });

  it('is not shown to the group that has the spotlight', async () => {
    vi.mocked(groupsApi.getSpotlight).mockResolvedValue({
      groupId: 'g2',
      groupName: 'Group 2',
      place: 'The Drowned Vault',
      summary: '',
      mine: true,
    });
    show();
    await vi.waitFor(() => expect(groupsApi.getSpotlight).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('is not shown when nobody has the spotlight', async () => {
    vi.mocked(groupsApi.getSpotlight).mockResolvedValue(null);
    show();
    await vi.waitFor(() => expect(groupsApi.getSpotlight).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks nothing of someone who is not in the campaign', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue(null);
    show();
    await vi.waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    expect(groupsApi.getSpotlight).not.toHaveBeenCalled();
  });
});
