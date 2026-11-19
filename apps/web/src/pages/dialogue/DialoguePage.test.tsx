import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as charactersApi from '../../data/characters';
import type { CheckRequest, DialogueLine } from '../../data/dialogue';
import * as dialogueApi from '../../data/dialogue';
import * as entitiesApi from '../../data/entities';
import * as itemsApi from '../../data/items';
import * as membersApi from '../../data/members';
import * as groupsApi from '../../data/partyGroups';
import * as regionsApi from '../../data/regions';
import { aGroup } from '../../test/groupFixtures';
import { useDmModeStore } from '../../state/dmModeStore';
import DialoguePage from './DialoguePage';

vi.mock('../../data/dialogue', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/dialogue')>()),
  getNpcProfile: vi.fn(),
  setDisposition: vi.fn(),
  listLines: vi.fn(),
  createLine: vi.fn(),
  updateLine: vi.fn(),
  deleteLine: vi.fn(),
  listLog: vi.fn(),
  listRequests: vi.fn(),
  sayLine: vi.fn(),
  offerCheck: vi.fn(),
  closeCheck: vi.fn(),
}));
vi.mock('../../data/entities', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/entities')>()),
  listEntities: vi.fn(),
}));
vi.mock('../../data/partyGroups', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/partyGroups')>()),
  listGroups: vi.fn(),
}));
vi.mock('../../data/characters', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/characters')>()),
  listCharacters: vi.fn(),
}));
vi.mock('../../data/items', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/items')>()),
  listItems: vi.fn(),
}));
vi.mock('../../data/regions', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/regions')>()),
  listCampaignRegions: vi.fn(),
}));
vi.mock('../../data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/members')>()),
  getMyRole: vi.fn(),
  listMembers: vi.fn(),
}));
vi.mock('../../data/rolls', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/rolls')>()),
  subscribeToRolls: vi.fn(() => () => {}),
}));

const C = 'c1';
const ORSA = 'npc-orsa';
const line = (over: Partial<DialogueLine>): DialogueLine => ({
  id: 'l1',
  npcId: ORSA,
  text: 'Mind the roots, travellers.',
  tag: 'greeting',
  condition: null,
  options: [],
  sortOrder: 0,
  ...over,
});

function setup() {
  vi.mocked(membersApi.getMyRole).mockResolvedValue('dm');
  vi.mocked(membersApi.listMembers).mockResolvedValue([]);
  vi.mocked(entitiesApi.listEntities).mockResolvedValue([
    { id: ORSA, campaignId: C, type: 'npc', name: 'Orsa', folderId: null, visibleToPlayers: true, sortOrder: 0 },
  ]);
  vi.mocked(dialogueApi.getNpcProfile).mockResolvedValue({ disposition: 'friendly', locationPinId: null });
  vi.mocked(dialogueApi.listLines).mockResolvedValue([
    line({}),
    line({
      id: 'l2',
      text: 'That shard hums.',
      tag: '',
      condition: { type: 'has_item', item: 'Crown Shard' },
    }),
    line({ id: 'l3', text: 'Ah, a seasoned blade.', tag: '', condition: { type: 'level_at_least', level: 9 } }),
  ]);
  vi.mocked(dialogueApi.listLog).mockResolvedValue([]);
  vi.mocked(dialogueApi.listRequests).mockResolvedValue([]);
  vi.mocked(groupsApi.listGroups).mockResolvedValue([
    aGroup({ id: 'g1', name: 'The Vanguard', characterIds: ['brannoc'] }),
    aGroup({ id: 'g2', name: 'The Rearguard', characterIds: ['kael'] }),
  ]);
  vi.mocked(charactersApi.listCharacters).mockResolvedValue([
    { id: 'brannoc', campaignId: C, ownerId: 'u1', name: 'Brannoc', xp: 6500, levelApplied: 5 },
    { id: 'kael', campaignId: C, ownerId: 'u2', name: 'Kael', xp: 900, levelApplied: 3 },
  ]);
  vi.mocked(itemsApi.listItems).mockResolvedValue([
    { id: 'i1', name: 'Crown Shard', ownerType: 'character', ownerId: 'brannoc' } as never,
  ]);
  vi.mocked(regionsApi.listCampaignRegions).mockResolvedValue([]);
  vi.mocked(dialogueApi.sayLine).mockResolvedValue({ lineKey: 'k', logId: 'log', lineId: null, requestIds: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/campaigns/${C}/dialogue/${ORSA}`]}>
        <Routes>
          <Route path="/campaigns/:campaignId/dialogue/:npcId" element={<DialoguePage />} />
          <Route path="/campaigns/:campaignId/entities" element={<p>The codex</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useDmModeStore.setState({ dmMode: true });
});

describe('the DM’s dialogue tool', () => {
  it('lists prepared lines with their tags; a line whose condition suits the listening group is eligible', async () => {
    setup();
    const tool = await screen.findByRole('region', { name: 'Dialogue with Orsa' });
    expect(within(tool).getByRole('heading', { name: 'Orsa' })).toBeInTheDocument();
    const rows = await within(tool).findAllByRole('listitem');
    const greeting = rows.find(r => r.textContent?.includes('Mind the roots'))!;
    const shard = rows.find(r => r.textContent?.includes('That shard hums'))!;
    const veteran = rows.find(r => r.textContent?.includes('seasoned blade'))!;
    expect(within(greeting).getByText('greeting')).toBeInTheDocument();
    expect(within(shard).getByText('if Crown Shard')).toBeInTheDocument();
    // the Vanguard listens first: Brannoc carries the shard; nobody is level 9
    await waitFor(() => expect(within(shard).getByText('eligible')).toBeInTheDocument());
    expect(within(veteran).queryByText('eligible')).not.toBeInTheDocument();
  });

  it('says a prepared line to the listening group, logged; it is then marked said and previewed as players see it', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('button', { name: 'Say: Mind the roots, travellers.' }));
    expect(dialogueApi.sayLine).toHaveBeenCalledWith({
      npcId: ORSA,
      text: 'Mind the roots, travellers.',
      options: [],
      groupIds: ['g1'],
      saveToNpc: false,
      saveToLog: true,
    });
    expect(await screen.findByRole('button', { name: 'Say: Mind the roots, travellers.' })).toHaveTextContent('Said');
    expect(screen.getByText('What Brannoc sees')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'What the players see' })).getByText(/Mind the roots/),
    ).toBeInTheDocument();
  });

  it('says something new to two groups, with a check option, kept among the NPC’s lines but not logged', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole('checkbox', { name: 'The Rearguard' }));
    await user.click(screen.getByRole('checkbox', { name: 'Save what is said to the session log' }));
    await user.type(screen.getByLabelText('What Orsa says'), 'Healing draught, fifty gold.');
    const say = screen.getByRole('region', { name: 'Say something new' }) ?? document.body;
    await user.click(within(say).getByRole('button', { name: 'Add an option' }));
    await user.type(within(say).getByLabelText('Option 1 label'), 'Haggle');
    await user.selectOptions(within(say).getByLabelText('Option 1 kind'), 'check');
    await user.click(within(say).getByRole('checkbox', { name: 'Show the odds' }));
    await user.click(within(say).getByRole('checkbox', { name: 'Add to Orsa’s saved lines' }));
    await user.click(within(say).getByRole('button', { name: 'Say it' }));
    expect(dialogueApi.sayLine).toHaveBeenCalledWith({
      npcId: ORSA,
      text: 'Healing draught, fifty gold.',
      options: [{ label: 'Haggle', kind: 'check', check: { skill: 'persuasion', dc: 13, showOdds: false } }],
      groupIds: ['g1', 'g2'],
      saveToNpc: true,
      saveToLog: false,
    });
  });

  it('offers Persuasion DC 13 with advantage (and why) to everyone listening', async () => {
    const user = userEvent.setup();
    vi.mocked(dialogueApi.offerCheck).mockResolvedValue('req');
    setup();
    const form = await screen.findByRole('form', { name: 'Offer a check' });
    await user.selectOptions(within(form).getByLabelText('Roll with'), 'advantage');
    await user.type(within(form).getByLabelText('Because'), 'She likes you');
    await user.type(within(form).getByLabelText('What is it for?'), 'Haggle over the price');
    await user.click(within(form).getByRole('button', { name: 'Offer to players' }));
    expect(dialogueApi.offerCheck).toHaveBeenCalledWith({
      campaignId: C,
      characterIds: ['brannoc'],
      key: 'persuasion',
      kind: 'check',
      dc: 13,
      mode: 'advantage',
      reason: 'She likes you',
      showOdds: true,
      prompt: 'Haggle over the price',
      npcId: ORSA,
    });
    expect(await within(form).findByRole('status')).toHaveTextContent('Offered to Brannoc.');
  });

  it('shows the answers to open checks as they come in, and closes one', async () => {
    const user = userEvent.setup();
    const open: CheckRequest = {
      id: 'req',
      characterIds: ['brannoc', 'kael'],
      key: 'persuasion',
      kind: 'check',
      dc: 13,
      mode: 'normal',
      reason: null,
      showOdds: false,
      prompt: 'Haggle',
      status: 'open',
      npcId: ORSA,
      createdAt: '',
      answers: [{ characterId: 'brannoc', roll: { total: 15, success: true } as never }],
    };
    setup();
    vi.mocked(dialogueApi.listRequests).mockResolvedValue([open]);
    vi.mocked(dialogueApi.closeCheck).mockResolvedValue(undefined);
    const answers = await screen.findByRole('list', { name: 'Answers to Haggle' });
    expect(
      within(answers)
        .getAllByRole('listitem')
        .map(li => li.textContent),
    ).toEqual(['Brannoc: 15 (success)', 'Kael: waiting']);
    expect(screen.getByText(/Haggle · Persuasion DC 13 · odds hidden/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(dialogueApi.closeCheck).toHaveBeenCalledWith('req');
  });

  it('sends anyone not in DM mode back to the codex', async () => {
    useDmModeStore.setState({ dmMode: false });
    setup();
    expect(await screen.findByText('The codex')).toBeInTheDocument();
    expect(dialogueApi.listLines).not.toHaveBeenCalled();
  });
});
