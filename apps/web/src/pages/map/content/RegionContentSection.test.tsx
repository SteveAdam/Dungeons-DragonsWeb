import { DEFAULT_SPAWN_RULE } from '@dnd-manager/rules-engine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as campaignsApi from '../../../data/campaigns';
import * as entitiesApi from '../../../data/entities';
import type { RegionContent } from '../../../data/regionContent';
import * as contentApi from '../../../data/regionContent';
import type { Region } from '../../../data/regions';
import { RegionContentSection } from './RegionContentSection';

vi.mock('../../../data/regionContent', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/regionContent')>()),
  listRegionContent: vi.fn(),
  createContent: vi.fn(),
  updateContent: vi.fn(),
  deleteContent: vi.fn(),
  getContentNotes: vi.fn(),
  rollRandomEncounter: vi.fn(),
  setDaylightHours: vi.fn(),
}));
vi.mock('../../../data/entities');
vi.mock('../../../data/campaigns');

const wood: Region = {
  id: 'r-wood',
  mapId: 'm1',
  name: 'Mourning Wood',
  cx: 100,
  cy: 100,
  radius: 50,
  terrain: 'temperate_forest',
  weather: 'fog',
  description: '',
  visibleToPlayers: true,
};

const entry = (over: Partial<RegionContent>): RegionContent => ({
  id: 'e',
  regionId: 'r-wood',
  kind: 'creature',
  name: 'Entry',
  entityId: null,
  monsterRef: null,
  description: '',
  quantity: null,
  stock: [],
  state: 'hidden',
  hintText: null,
  discoveryDc: null,
  discoverySkill: 'perception',
  spawnRule: DEFAULT_SPAWN_RULE,
  sortOrder: 0,
  ...over,
});
const wolves = entry({
  id: 'e-wolves',
  name: 'Thornwolf pack',
  monsterRef: 'srd:wolf',
  spawnRule: { mode: 'chance', chance: 35, timeOfDay: 'night', count: { min: 1, max: 3 } },
});
const orsa = entry({
  id: 'e-orsa',
  kind: 'folk',
  name: 'Orsa the hedge witch',
  state: 'noticed',
  entityId: 'ent-orsa',
});
const shrine = entry({
  id: 'e-shrine',
  kind: 'find',
  name: 'Mossy shrine',
  hintText: 'Something glints',
  discoveryDc: 14,
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegionContentSection region={wood} campaignId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(contentApi.listRegionContent).mockResolvedValue([wolves, orsa, shrine]);
  vi.mocked(contentApi.getContentNotes).mockResolvedValue('');
  vi.mocked(entitiesApi.listEntities).mockResolvedValue([
    {
      id: 'ent-orsa',
      campaignId: 'c1',
      type: 'npc',
      name: 'Orsa',
      folderId: null,
      visibleToPlayers: false,
      sortOrder: 0,
    },
    {
      id: 'ent-lore',
      campaignId: 'c1',
      type: 'lore',
      name: 'Old legend',
      folderId: null,
      visibleToPlayers: false,
      sortOrder: 1,
    },
  ]);
  vi.mocked(campaignsApi.getCampaign).mockResolvedValue({
    id: 'c1',
    name: 'The Sunken Crown',
    rulesEdition: '2024',
    nextSessionAt: null,
    gameSeconds: 0,
    daylight: { start: 6, end: 18 },
    createdAt: '',
  });
});

describe('region content (P3-2)', () => {
  it('lists each tab with the state tag, DC and spawn rule', async () => {
    const user = userEvent.setup();
    renderSection();
    const wolvesRow = (await screen.findByText('Thornwolf pack')).closest('li') as HTMLElement;
    expect(within(wolvesRow).getByText('HIDDEN')).toBeInTheDocument();
    expect(wolvesRow).toHaveTextContent('35% chance, at night, 1 to 3');
    expect(contentApi.listRegionContent).toHaveBeenCalledWith(['r-wood']);

    await user.click(screen.getByRole('tab', { name: 'Folk' }));
    const orsaRow = screen.getByText('Orsa the hedge witch').closest('li') as HTMLElement;
    expect(within(orsaRow).getByText('NOTICED')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Finds' }));
    const shrineRow = screen.getByText('Mossy shrine').closest('li') as HTMLElement;
    expect(shrineRow).toHaveTextContent('DC 14 Perception');
    expect(shrineRow).toHaveTextContent('Hint: Something glints');

    await user.click(screen.getByRole('tab', { name: 'Shops' }));
    expect(screen.getByText('No shops here yet.')).toBeInTheDocument();
  });

  it('adds the thornwolf pack, reading the rule back in plain words as it is edited', async () => {
    vi.mocked(contentApi.listRegionContent).mockResolvedValue([]);
    vi.mocked(contentApi.createContent).mockResolvedValue(wolves);
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole('button', { name: 'Add creature' }));
    const form = screen.getByRole('form', { name: 'New creature' });
    await user.type(within(form).getByLabelText('Name'), 'Thornwolf pack');
    await user.type(within(form).getByLabelText('Monster reference'), 'srd:wolf');
    await user.selectOptions(within(form).getByLabelText('When'), 'chance');
    const chance = within(form).getByLabelText('Chance (%)');
    await user.clear(chance);
    await user.type(chance, '35');
    await user.selectOptions(within(form).getByLabelText('Time of day'), 'night');
    const most = within(form).getByLabelText('At most');
    await user.clear(most);
    await user.type(most, '3');
    expect(within(form).getByText('35% chance, at night, 1 to 3')).toBeInTheDocument();
    await user.type(within(form).getByLabelText(/DM notes/), 'They fear fire');
    await user.click(within(form).getByRole('button', { name: 'Save entry' }));

    await waitFor(() =>
      expect(contentApi.createContent).toHaveBeenCalledWith(
        'r-wood',
        expect.objectContaining({
          kind: 'creature',
          name: 'Thornwolf pack',
          monsterRef: 'srd:wolf',
          spawnRule: { mode: 'chance', chance: 35, timeOfDay: 'night', count: { min: 1, max: 3 } },
        }),
        'They fear fire',
      ),
    );
  });

  it('shows a plain message for a broken rule, and does not save', async () => {
    vi.mocked(contentApi.listRegionContent).mockResolvedValue([]);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Add creature' }));
    const form = screen.getByRole('form', { name: 'New creature' });
    await user.type(within(form).getByLabelText('Name'), 'Swarm');
    const least = within(form).getByLabelText('At least');
    await user.clear(least);
    await user.type(least, '5');
    expect(within(form).getByText('The smallest count cannot be more than the largest.')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Save entry' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'The smallest count cannot be more than the largest.',
    );
    expect(contentApi.createContent).not.toHaveBeenCalled();
  });

  it('links only NPCs and items from the registry, and a find can be switched to an interactable', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('tab', { name: 'Finds' }));
    await user.click(screen.getByRole('button', { name: 'Add find' }));
    const form = screen.getByRole('form', { name: 'New find' });
    const options = within(within(form).getByLabelText('Registry entry (NPC or item)')).getAllByRole('option');
    await waitFor(() => expect(options.length).toBeGreaterThan(0));
    expect(
      within(within(form).getByLabelText('Registry entry (NPC or item)'))
        .getAllByRole('option')
        .map(o => o.textContent),
    ).toEqual(['None', 'Orsa (NPC)']);
    expect(
      within(within(form).getByLabelText('Kind'))
        .getAllByRole('option')
        .map(o => o.textContent),
    ).toEqual(['Find', 'Interactable']);
  });

  it('edits an entry with its DM notes', async () => {
    vi.mocked(contentApi.getContentNotes).mockResolvedValue('The shrine holds a cursed idol');
    vi.mocked(contentApi.updateContent).mockResolvedValue(shrine);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('tab', { name: 'Finds' }));
    await user.click(screen.getByRole('button', { name: 'Edit Mossy shrine' }));
    const form = screen.getByRole('form', { name: 'Edit Mossy shrine' });
    await waitFor(() => expect(within(form).getByLabelText(/DM notes/)).toHaveValue('The shrine holds a cursed idol'));
    expect(within(form).getByLabelText('Discovery DC')).toHaveValue(14);
    await user.selectOptions(within(form).getByLabelText('Discovery'), 'hinted');
    await user.click(within(form).getByRole('button', { name: 'Save entry' }));
    await waitFor(() =>
      expect(contentApi.updateContent).toHaveBeenCalledWith(
        'e-shrine',
        expect.objectContaining({ state: 'hinted', discoveryDc: 14 }),
        'The shrine holds a cursed idol',
      ),
    );
  });

  it('rolls a random encounter and offers the log line', async () => {
    vi.mocked(contentApi.rollRandomEncounter).mockResolvedValue({
      rollId: 'roll-1',
      hour: 23,
      isDay: false,
      results: [{ contentId: 'e-wolves', name: 'Thornwolf pack', monsterRef: 'srd:wolf', count: 2 }],
    });
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Roll random encounter' }));
    const result = await screen.findByRole('region', { name: 'Encounter result' });
    expect(within(result).getByText('Thornwolf pack × 2 (srd:wolf)')).toBeInTheDocument();
    expect(
      within(result).getByText('Random encounter in Mourning Wood, 23:00 (night): Thornwolf pack × 2'),
    ).toBeInTheDocument();
    expect(contentApi.rollRandomEncounter).toHaveBeenCalledWith('r-wood');
  });

  it('saves the daylight hours', async () => {
    vi.mocked(contentApi.setDaylightHours).mockResolvedValue();
    const user = userEvent.setup();
    renderSection();
    const form = await screen.findByRole('form', { name: 'Daylight hours' });
    await waitFor(() => expect(within(form).getByLabelText('Day starts (hour)')).toHaveValue(6));
    const start = within(form).getByLabelText('Day starts (hour)');
    await user.clear(start);
    await user.type(start, '5');
    await user.click(within(form).getByRole('button', { name: 'Save daylight' }));
    await waitFor(() => expect(contentApi.setDaylightHours).toHaveBeenCalledWith('c1', 5, 18));
  });
});
