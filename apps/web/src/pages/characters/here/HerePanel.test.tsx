import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '../../../data/errors';
import type { Here } from '../../../data/here';
import * as hereApi from '../../../data/here';
import type { RollRow } from '../../../data/rolls';
import * as rollsApi from '../../../data/rolls';
import { HerePanel } from './HerePanel';

vi.mock('../../../data/here');
vi.mock('../../../data/rolls', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/rolls')>()),
  previewRoll: vi.fn(),
}));

const CAMPAIGN = 'c1';
const BRANNOC = 'ch-brannoc';

const wood: Here = {
  group: { id: 'g1', name: 'The Lanterns', color: '#8E2A22', mapId: 'm1' },
  region: { id: 'r1', name: 'Mourning Wood' },
  entries: [
    { id: 'e1', kind: 'folk', name: 'Orsa the hedge witch', description: 'She hums', stock: [], actions: ['talk'] },
    { id: 'e2', kind: 'interactable', name: 'Rope bridge', description: 'It sways', stock: [], actions: ['examine'] },
  ],
  hints: [{ id: 'e3', kind: 'find', hint: 'Something glints' }],
};

const roll = (kept: number): RollRow => ({
  id: 'roll1',
  campaignId: CAMPAIGN,
  characterId: BRANNOC,
  rolledBy: 'u1',
  kind: 'check',
  label: 'Search (Perception)',
  bonus: 3,
  bonusBreakdown: [{ label: 'Wisdom', value: 3 }],
  target: null,
  mode: 'normal',
  dice: [kept],
  kept,
  total: kept + 3,
  success: null,
  crit: false,
  fumble: false,
  hidden: false,
  createdAt: '',
});

let notify: (text: string) => void = () => {};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HerePanel campaignId={CAMPAIGN} characterId={BRANNOC} />
    </QueryClientProvider>,
  );
}

async function openHere(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Here' }));
  return screen.findByRole('complementary', { name: 'Here' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hereApi.getHere).mockResolvedValue(wood);
  vi.mocked(hereApi.subscribeToNotices).mockImplementation((_g, onNotice) => {
    notify = onNotice;
    return () => {};
  });
  vi.mocked(rollsApi.previewRoll).mockResolvedValue({
    label: 'Perception check',
    bonus: 3,
    bonusBreakdown: [{ label: 'Wisdom', value: 3 }],
    mode: 'normal',
    reasons: [],
    chance: 0.6,
    critChance: 0.05,
    autoFail: null,
    notes: [],
  });
});

describe('the Here tab (P3-3)', () => {
  it('lists what the group knows, by section, and the hints, from get_here only', async () => {
    const user = userEvent.setup();
    renderPanel();
    const panel = await openHere(user);
    expect(within(panel).getByRole('heading', { name: 'Mourning Wood' })).toBeInTheDocument();
    expect(within(panel).getByText('The Lanterns')).toBeInTheDocument();
    const folk = await within(panel).findByRole('region', { name: 'Folk' });
    expect(within(folk).getByText('Orsa the hedge witch')).toBeInTheDocument();
    expect(within(folk).getByRole('button', { name: 'Talk' })).toBeDisabled();
    const hints = within(panel).getByRole('region', { name: 'Undiscovered' });
    expect(within(hints).getByText('Something glints')).toBeInTheDocument();
    expect(within(panel).queryByRole('region', { name: 'Creatures' })).not.toBeInTheDocument();
    expect(hereApi.getHere).toHaveBeenCalledWith(BRANNOC);
  });

  it('examines an interactable', async () => {
    const user = userEvent.setup();
    renderPanel();
    const panel = await openHere(user);
    const things = await within(panel).findByRole('region', { name: 'Interactables' });
    expect(within(things).queryByText('It sways')).not.toBeInTheDocument();
    await user.click(within(things).getByRole('button', { name: 'Examine' }));
    expect(within(things).getByText('It sways')).toBeInTheDocument();
  });

  it('searches through the popup with the odds hidden, and tells what was found', async () => {
    vi.mocked(hereApi.searchHere).mockResolvedValue({
      roll: roll(18),
      found: [{ name: 'Mossy shrine', kind: 'find' }],
    });
    const user = userEvent.setup();
    renderPanel();
    const panel = await openHere(user);
    await user.click(await within(panel).findByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search the area' });
    expect(within(dialog).getByText('The DM has not shown the difficulty.')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Roll/ })).toBeEnabled());
    expect(within(dialog).queryByText(/%/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Roll/ }));
    expect(await within(dialog).findByText('Total 21 (18 + 3)')).toBeInTheDocument();
    expect(hereApi.searchHere).toHaveBeenCalledWith(CAMPAIGN, BRANNOC);
    expect(within(panel).getByText('You notice Mossy shrine.')).toBeInTheDocument();
  });

  it('says so when nothing new turns up', async () => {
    vi.mocked(hereApi.searchHere).mockResolvedValue({ roll: roll(2), found: [] });
    const user = userEvent.setup();
    renderPanel();
    const panel = await openHere(user);
    await user.click(await within(panel).findByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search the area' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Roll/ })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: /Roll/ }));
    expect(await within(panel).findByText('You find nothing new.')).toBeInTheDocument();
  });

  it('passes on the cooldown in the server’s words', async () => {
    vi.mocked(hereApi.searchHere).mockRejectedValue(
      new DataError(
        'rate-limited',
        'You searched here in the last 10 minutes. Give it a moment before you search again.',
      ),
    );
    const user = userEvent.setup();
    renderPanel();
    const panel = await openHere(user);
    await user.click(await within(panel).findByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search the area' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /Roll/ })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: /Roll/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You searched here in the last 10 minutes.');
  });

  it('shows a notice when the group discovers something, and refreshes the list', async () => {
    const user = userEvent.setup();
    renderPanel();
    await openHere(user);
    await waitFor(() => expect(hereApi.subscribeToNotices).toHaveBeenCalledWith('g1', expect.any(Function)));
    vi.mocked(hereApi.getHere).mockResolvedValue({
      ...wood,
      entries: [
        ...wood.entries,
        { id: 'e3', kind: 'find', name: 'Mossy shrine', description: '', stock: [], actions: [] },
      ],
      hints: [],
    });
    act(() => notify('You notice Mossy shrine'));
    expect(screen.getByRole('status')).toHaveTextContent('You notice Mossy shrine');
    expect(await screen.findByText('Mossy shrine')).toBeInTheDocument();
  });

  it('explains when the character is in no group', async () => {
    vi.mocked(hereApi.getHere).mockResolvedValue({ group: null, region: null, entries: [], hints: [] });
    const user = userEvent.setup();
    renderPanel();
    const panel = await openHere(user);
    expect(await within(panel).findByText(/not with a group yet/)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    expect(hereApi.subscribeToNotices).not.toHaveBeenCalled();
  });
});
