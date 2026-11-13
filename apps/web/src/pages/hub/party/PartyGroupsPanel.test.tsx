import { aGroup } from '../../../test/groupFixtures';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterSummary } from '../../../data/characters';
import * as mapsApi from '../../../data/maps';
import * as groupsApi from '../../../data/partyGroups';
import * as regionsApi from '../../../data/regions';
import { PartyGroupsPanel } from './PartyGroupsPanel';

vi.mock('../../../data/partyGroups');
vi.mock('../../../data/maps');
vi.mock('../../../data/regions', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/regions')>()),
  listRegions: vi.fn(),
}));

const character = (id: string, name: string) => ({ id, name }) as CharacterSummary;
const characters = [character('ch-a', 'Brannoc'), character('ch-b', 'Kael')];

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PartyGroupsPanel campaignId="c1" characters={characters} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(groupsApi.listGroups).mockResolvedValue([
    aGroup({ id: 'g1', name: 'The Lanterns', characterIds: ['ch-a'] }),
  ]);
  vi.mocked(groupsApi.listDiscoveries).mockResolvedValue([
    { groupId: 'g1', contentId: 'e1', name: 'Orsa the hedge witch', state: 'noticed' },
  ]);
  vi.mocked(mapsApi.listAllMaps).mockResolvedValue([
    {
      id: 'm1',
      name: 'Sword Coast',
      imagePath: 'c1/m.png',
      visibleToPlayers: true,
      createdAt: '',
      parentPinId: null,
      parentRegionId: null,
    },
  ]);
  vi.mocked(regionsApi.listRegions).mockResolvedValue([
    {
      id: 'r1',
      mapId: 'm1',
      name: 'Mourning Wood',
      cx: 1,
      cy: 1,
      radius: 10,
      terrain: 'temperate_forest',
      weather: 'fog',
      description: '',
      visibleToPlayers: true,
    },
  ]);
});

describe('party groups (P3-3, DM)', () => {
  it('shows each group with its characters and discoveries, and the ungrouped ones apart', async () => {
    renderPanel();
    const lanterns = await screen.findByRole('region', { name: 'The Lanterns' });
    expect(within(lanterns).getByText('Brannoc')).toBeInTheDocument();
    expect(await within(lanterns).findByText('Orsa the hedge witch')).toBeInTheDocument();
    const none = screen.getByRole('region', { name: 'No group' });
    expect(within(none).getByText('Kael')).toBeInTheDocument();
  });

  it('creates a group', async () => {
    vi.mocked(groupsApi.createGroup).mockResolvedValue('g2');
    const user = userEvent.setup();
    renderPanel();
    await user.type(await screen.findByLabelText('Group name'), 'The Wanderers');
    await user.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(groupsApi.createGroup).toHaveBeenCalledWith('c1', 'The Wanderers', '#8E2A22'));
  });

  it('puts a character in a group from its menu, the keyboard way', async () => {
    vi.mocked(groupsApi.assignCharacter).mockResolvedValue();
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(await screen.findByLabelText('Group for Kael'), 'g1');
    await waitFor(() => expect(groupsApi.assignCharacter).toHaveBeenCalledWith('ch-b', 'g1'));
  });

  it('moves a group into a region and says what its members noticed', async () => {
    vi.mocked(groupsApi.moveGroup).mockResolvedValue(['Orsa the hedge witch', 'Old tracks']);
    const user = userEvent.setup();
    renderPanel();
    const lanterns = await screen.findByRole('region', { name: 'The Lanterns' });
    await waitFor(() => expect(within(within(lanterns).getByLabelText('Map')).getAllByRole('option')).toHaveLength(2));
    await user.selectOptions(within(lanterns).getByLabelText('Map'), 'm1');
    await waitFor(() =>
      expect(within(within(lanterns).getByLabelText('Region')).getAllByRole('option')).toHaveLength(2),
    );
    await user.selectOptions(within(lanterns).getByLabelText('Region'), 'r1');
    await user.click(within(lanterns).getByRole('button', { name: 'Move group here' }));
    await waitFor(() => expect(groupsApi.moveGroup).toHaveBeenCalledWith('c1', 'g1', 'm1', 'r1'));
    expect(await within(lanterns).findByText('Revealed: Orsa the hedge witch, Old tracks.')).toBeInTheDocument();
  });
});
