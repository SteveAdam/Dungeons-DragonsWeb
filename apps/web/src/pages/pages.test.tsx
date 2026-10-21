import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../data/campaigns';
import * as campaignsApi from '../data/campaigns';
import { DataError } from '../data/errors';
import * as mapsApi from '../data/maps';
import type { Member } from '../data/members';
import * as membersApi from '../data/members';
import { DmModeIndicator } from '../components/DmModeIndicator';
import { useDmModeStore } from '../state/dmModeStore';
import { CampaignHubPage } from './CampaignHubPage';
import { CampaignListPage } from './CampaignListPage';

// The data layer is mocked: these tests are about what each kind of person sees. The P0-3 components are swapped
// for plain stand-ins so the tests do not depend on their markup.
vi.mock('../components/ui', () => import('../test/uiStandIns'));
vi.mock('../data/campaigns');
vi.mock('../data/members');
vi.mock('../data/maps');

const campaign: Campaign = {
  id: 'c1',
  name: 'The Sunken Crown',
  rulesEdition: '2024',
  nextSessionAt: null,
  createdAt: '2026-10-18T10:00:00Z',
};
const members: Member[] = [
  { userId: 'u-dm', role: 'dm', joinedAt: '2026-10-18T10:00:00Z', displayName: 'Dungeon Dan', avatarUrl: null },
  {
    userId: 'u-pia',
    role: 'player',
    joinedAt: '2026-10-18T11:00:00Z',
    displayName: 'Pia',
    avatarUrl: 'https://cdn.example/pia.png',
  },
];
const hiddenMap = {
  id: 'm2',
  name: 'The drowned vault',
  imagePath: 'c1/vault.png',
  visibleToPlayers: false,
  createdAt: '',
};
const openMap = { id: 'm1', name: 'Sword Coast', imagePath: 'c1/coast.png', visibleToPlayers: true, createdAt: '' };

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        {/* the slot from the app header where the DM badge appears */}
        <DmModeIndicator />
        <Routes>
          <Route path="/campaigns" element={<CampaignListPage />} />
          <Route path="/campaigns/:campaignId/:tab?" element={<CampaignHubPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** What the database would answer for this person. */
function signInAs(role: 'dm' | 'player') {
  vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([campaign]);
  vi.mocked(campaignsApi.getCampaign).mockResolvedValue(campaign);
  vi.mocked(membersApi.getMyRole).mockResolvedValue(role);
  vi.mocked(membersApi.listMembers).mockResolvedValue(members);
  vi.mocked(campaignsApi.getInviteCode).mockResolvedValue(role === 'dm' ? '7F3A9C21' : null);
  vi.mocked(mapsApi.listMaps).mockImplementation(async (_id, { includeHidden }) =>
    includeHidden ? [openMap, hiddenMap] : [openMap],
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useDmModeStore.setState({ dmMode: true });
});

describe('campaign list', () => {
  it('shows a friendly empty state', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    renderAt('/campaigns');
    expect(await screen.findByText('No campaigns yet')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Campaign name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Invite code' })).toBeInTheDocument();
  });

  it('lists my campaigns as links to their hubs', async () => {
    signInAs('player');
    renderAt('/campaigns');
    const link = await screen.findByRole('link', { name: /The Sunken Crown/ });
    expect(link).toHaveAttribute('href', '/campaigns/c1');
  });

  it('acceptance 1: a DM creates a campaign and sees the invite code', async () => {
    signInAs('dm');
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(campaignsApi.createCampaign).mockResolvedValue(campaign);
    const user = userEvent.setup();
    renderAt('/campaigns');

    await user.type(await screen.findByRole('textbox', { name: 'Campaign name' }), 'The Sunken Crown');
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));

    expect(campaignsApi.createCampaign).toHaveBeenCalledWith('The Sunken Crown');
    expect(await screen.findByRole('heading', { name: 'The Sunken Crown' })).toBeInTheDocument();
    const sealed = await screen.findByLabelText('Sealed invitation code');
    expect(await within(sealed).findByText('7F3A9C21')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'DM mode' })).toBeInTheDocument();
  });

  it('shows a create error in plain words', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(campaignsApi.createCampaign).mockRejectedValue(
      new DataError('validation', 'Give your campaign a name of 1 to 120 characters.'),
    );
    const user = userEvent.setup();
    renderAt('/campaigns');
    await user.type(await screen.findByRole('textbox', { name: 'Campaign name' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give your campaign a name of 1 to 120 characters.');
  });

  it('acceptance 3: a wrong code shows a friendly message and stays on the list', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(campaignsApi.joinCampaign).mockRejectedValue(new DataError('invalid-code'));
    const user = userEvent.setup();
    renderAt('/campaigns');

    await user.type(await screen.findByRole('textbox', { name: 'Invite code' }), 'WRONG');
    await user.click(screen.getByRole('button', { name: 'Join campaign' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match any campaign/);
    expect(screen.getByRole('heading', { name: 'Your campaigns' })).toBeInTheDocument();
  });

  it('survives a dropped connection and recovers with Try again', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockRejectedValueOnce(new DataError('network'));
    const user = userEvent.setup();
    renderAt('/campaigns');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');

    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([campaign]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /The Sunken Crown/ })).toBeInTheDocument();
  });
});

describe('campaign hub as a player (acceptance 2)', () => {
  it('joins with the code, then sees the hub without the code, the DM switch or the DM banner', async () => {
    signInAs('player');
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(campaignsApi.joinCampaign).mockResolvedValue('c1');
    const user = userEvent.setup();
    renderAt('/campaigns');

    await user.type(await screen.findByRole('textbox', { name: 'Invite code' }), '7F3A9C21');
    await user.click(screen.getByRole('button', { name: 'Join campaign' }));

    expect(await screen.findByRole('heading', { name: 'The Sunken Crown' })).toBeInTheDocument();
    expect(await screen.findByText(/2 members/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Sealed invitation code')).not.toBeInTheDocument();
    expect(screen.queryByText('7F3A9C21', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'DM mode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(campaignsApi.getInviteCode).not.toHaveBeenCalled();
  });

  it('never asks for hidden maps and sees only the shared one', async () => {
    signInAs('player');
    renderAt('/campaigns/c1/maps');
    expect(await screen.findByText('Sword Coast')).toBeInTheDocument();
    expect(screen.queryByText('The drowned vault')).not.toBeInTheDocument();
    expect(mapsApi.listMaps).toHaveBeenCalledWith('c1', { includeHidden: false });
  });

  it('is told plainly when no map has been shared', async () => {
    signInAs('player');
    vi.mocked(mapsApi.listMaps).mockResolvedValue([]);
    renderAt('/campaigns/c1/maps');
    expect(await screen.findByText('Your DM has not shared a map with the party.')).toBeInTheDocument();
  });

  it('lists the people with their roles as words', async () => {
    signInAs('player');
    renderAt('/campaigns/c1/people');
    const dan = (await screen.findByText('Dungeon Dan')).closest('li') as HTMLElement;
    const pia = screen.getByText('Pia').closest('li') as HTMLElement;
    expect(within(dan).getByText('DM')).toBeInTheDocument();
    expect(within(pia).getByText('Player')).toBeInTheDocument();
  });

  it('cannot remove anyone', async () => {
    signInAs('player');
    renderAt('/campaigns/c1/people');
    await screen.findByText('Dungeon Dan');
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });
});

describe('removing members (CAM-2)', () => {
  it('a DM removes a player after confirming, and the list refreshes', async () => {
    signInAs('dm');
    vi.mocked(membersApi.removeMember).mockResolvedValue();
    const user = userEvent.setup();
    renderAt('/campaigns/c1/people');

    const dan = (await screen.findByText('Dungeon Dan')).closest('li') as HTMLElement;
    expect(within(dan).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Pia' }));
    expect(membersApi.removeMember).not.toHaveBeenCalled();
    expect(screen.getByText('Remove Pia?')).toBeInTheDocument();

    vi.mocked(membersApi.listMembers).mockResolvedValue([members[0]]);
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(membersApi.removeMember).toHaveBeenCalledWith('c1', 'u-pia');
    await waitFor(() => expect(screen.queryByText('Pia')).not.toBeInTheDocument());
  });

  it('Keep cancels without removing', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderAt('/campaigns/c1/people');
    await user.click(await screen.findByRole('button', { name: 'Remove Pia' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(membersApi.removeMember).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove Pia' })).toBeInTheDocument();
  });

  it('shows a failure in plain words', async () => {
    signInAs('dm');
    vi.mocked(membersApi.removeMember).mockRejectedValue(new DataError('network'));
    const user = userEvent.setup();
    renderAt('/campaigns/c1/people');
    await user.click(await screen.findByRole('button', { name: 'Remove Pia' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    expect(screen.getByText('Pia')).toBeInTheDocument();
  });

  it('is hidden while the DM previews the player view', async () => {
    signInAs('dm');
    useDmModeStore.setState({ dmMode: false });
    renderAt('/campaigns/c1/people');
    await screen.findByText('Pia');
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });
});

describe('campaign hub as a DM', () => {
  it('shows the banner, the sealed code and the hidden map, and copies the code', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderAt('/campaigns/c1');

    expect(await screen.findByRole('note')).toHaveTextContent('DM mode');
    const sealed = await screen.findByLabelText('Sealed invitation code');
    expect(await within(sealed).findByText('7F3A9C21')).toBeInTheDocument();
    expect(await screen.findByText('The drowned vault')).toBeInTheDocument();
    expect(screen.getByText('Hidden from players')).toBeInTheDocument();

    await user.click(within(sealed).getByRole('button', { name: 'Copy' }));
    expect(await within(sealed).findByText('Copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('7F3A9C21');
  });

  it('turning DM mode off previews the player view and stops asking for hidden maps', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderAt('/campaigns/c1');
    await screen.findByText('The drowned vault');

    await user.click(screen.getByRole('switch', { name: 'DM mode' }));

    await waitFor(() => expect(screen.queryByText('The drowned vault')).not.toBeInTheDocument());
    expect(screen.queryByLabelText('Sealed invitation code')).not.toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'DM mode' })).toBeInTheDocument();
    expect(mapsApi.listMaps).toHaveBeenLastCalledWith('c1', { includeHidden: false });
    expect(JSON.parse(localStorage.getItem('dm-manager:dm-mode') ?? '{}').state.dmMode).toBe(false);
  });

  it('remembers DM mode being off after a reload', async () => {
    signInAs('dm');
    useDmModeStore.setState({ dmMode: false });
    renderAt('/campaigns/c1');
    await screen.findByText('Sword Coast');
    expect(screen.queryByLabelText('Sealed invitation code')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'DM mode' })).not.toBeChecked();
  });

  it('explains an empty chest', async () => {
    signInAs('dm');
    vi.mocked(mapsApi.listMaps).mockResolvedValue([]);
    renderAt('/campaigns/c1');
    expect(await screen.findByText('The chest is empty')).toBeInTheDocument();
  });
});

describe('hub navigation and errors', () => {
  it('Notes and Web say they are coming soon', async () => {
    signInAs('player');
    const user = userEvent.setup();
    renderAt('/campaigns/c1');
    await screen.findByRole('heading', { name: 'The Sunken Crown' });
    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(await screen.findByText('The Notes section is still being built.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Web' }));
    expect(await screen.findByText('The Web section is still being built.')).toBeInTheDocument();
  });

  it('sends an unknown tab back to Maps', async () => {
    signInAs('player');
    renderAt('/campaigns/c1/dragons');
    expect(await screen.findByText('Sword Coast')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Maps' })).toHaveAttribute('aria-selected', 'true');
  });

  it('says plainly when the campaign cannot be found, with a way back', async () => {
    vi.mocked(campaignsApi.getCampaign).mockRejectedValue(new DataError('not-found'));
    vi.mocked(membersApi.getMyRole).mockResolvedValue(null);
    renderAt('/campaigns/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not find that campaign/);
    expect(screen.getByRole('link', { name: /All campaigns/ })).toHaveAttribute('href', '/campaigns');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers Try again when the hub cannot reach the server', async () => {
    vi.mocked(campaignsApi.getCampaign).mockRejectedValue(new DataError('network'));
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    renderAt('/campaigns/c1');
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
