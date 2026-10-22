import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterSummary } from '../../../data/characters';
import * as characterApi from '../../../data/characters';
import { DataError } from '../../../data/errors';
import type { LedgerEntry, Party, Wallet } from '../../../data/party';
import * as api from '../../../data/party';
import { axeViolations } from '../../../test/axe';
import { PartyTab } from './PartyTab';

vi.mock('../../../data/characters', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/characters')>()),
  listCharacters: vi.fn(),
}));
vi.mock('../../../data/party', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/party')>()),
  getParty: vi.fn(),
  listWallets: vi.fn(),
  listLedger: vi.fn(),
  awardXp: vi.fn(),
  awardCoins: vi.fn(),
  splitPartyGold: vi.fn(),
  depositToParty: vi.fn(),
}));

const character = (id: string, name: string, xp: number, levelApplied: number, ownerId = 'p1'): CharacterSummary => ({
  id,
  campaignId: 'c1',
  ownerId,
  name,
  xp,
  levelApplied,
});
const brannoc = character('brannoc', 'Brannoc', 6900, 5);
const kael = character('kael', 'Kael', 900, 1, 'p2');
const wren = character('wren', 'Wren', 900, 1);
const party: Party = { id: 'party', name: 'The Party', memberIds: ['brannoc', 'kael', 'wren'] };
const wallet = (ownerType: Wallet['ownerType'], ownerId: string, coins: Partial<Wallet> = {}): Wallet => ({
  ownerType,
  ownerId,
  cp: 0,
  sp: 0,
  gp: 0,
  pp: 0,
  ...coins,
});
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: Math.random().toString(36),
  kind: 'xp',
  targetType: 'character',
  targetId: 'kael',
  xp: 0,
  coins: { cp: 0, sp: 0, gp: 0, pp: 0 },
  remainder: null,
  source: 'quest',
  note: '',
  createdAt: '2026-10-22T18:00:00Z',
  ...over,
});
const LEDGER = [
  entry({ targetId: 'kael', xp: 900, note: 'Rescued the miller' }),
  entry({ targetType: 'party', targetId: 'party', remainder: 1, note: '1 XP left over from 100 XP shared by 3' }),
  entry({
    kind: 'coin',
    targetType: 'party',
    targetId: 'party',
    coins: { cp: 0, sp: 1, gp: 7, pp: 0 },
    source: 'other',
  }),
];

function show({ dmMode, characters, wallets }: { dmMode: boolean; characters: CharacterSummary[]; wallets: Wallet[] }) {
  vi.mocked(characterApi.listCharacters).mockResolvedValue(characters);
  vi.mocked(api.getParty).mockResolvedValue(party);
  vi.mocked(api.listWallets).mockResolvedValue(wallets);
  vi.mocked(api.listLedger).mockResolvedValue(LEDGER);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PartyTab campaignId="c1" dmMode={dmMode} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const dmView = () =>
  show({
    dmMode: true,
    characters: [brannoc, kael, wren],
    wallets: [wallet('party', 'party', { gp: 7, sp: 1 }), wallet('character', 'brannoc', { gp: 3, sp: 3 })],
  });

beforeEach(() => vi.clearAllMocks());

describe('Party tab: the DM', () => {
  it('shows every member with their level by XP, pending levels and progress, and the pool', async () => {
    const { container } = dmView();
    expect(await screen.findByRole('heading', { name: 'The Party · 3 members' })).toBeInTheDocument();
    const kaelRow = screen.getByRole('link', { name: 'Kael' }).closest('li') as HTMLElement;
    expect(within(kaelRow).getByText('Level 3 by XP')).toBeInTheDocument();
    expect(within(kaelRow).getByText('2 levels pending')).toBeInTheDocument();
    expect(within(kaelRow).getByRole('meter', { name: 'Kael’s progress to level 4' })).toHaveAttribute(
      'aria-valuemax',
      '1800',
    );
    const brannocRow = screen.getByRole('link', { name: 'Brannoc' }).closest('li') as HTMLElement;
    expect(within(brannocRow).queryByText(/pending/)).toBeNull();
    expect(screen.getByText('7 GP, 1 SP')).toBeInTheDocument();
    expect(
      screen.getByText('Splitting gives each of the 3 members 2 GP; 1 GP, 1 SP stays in the pool.'),
    ).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('awards XP to the Party, showing the share and the remainder before sending', async () => {
    vi.mocked(api.awardXp).mockResolvedValue();
    const user = userEvent.setup();
    dmView();
    const form = await screen.findByRole('form', { name: 'Award XP' });
    await user.type(within(form).getByLabelText('XP'), '100');
    await user.selectOptions(within(form).getByLabelText('Source'), 'quest');
    await user.type(within(form).getByLabelText('Note'), 'Rescued the miller');
    expect(within(form).getByText('Each of 3 gets 33 XP; 1 XP is left over and not awarded.')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Award XP' }));
    expect(api.awardXp).toHaveBeenCalledWith({
      targetType: 'party',
      targetId: 'party',
      amount: 100,
      source: 'quest',
      note: 'Rescued the miller',
    });
    expect(await within(form).findByText('Awarded 100 XP to The Party.')).toBeInTheDocument();
  });

  it('awards coins to one character, and splits the pool', async () => {
    vi.mocked(api.awardCoins).mockResolvedValue();
    vi.mocked(api.splitPartyGold).mockResolvedValue();
    const user = userEvent.setup();
    dmView();
    const form = await screen.findByRole('form', { name: 'Award coins' });
    await user.selectOptions(within(form).getByLabelText('To'), 'Brannoc');
    await user.type(within(form).getByLabelText('Gold (GP)'), '10');
    await user.type(within(form).getByLabelText('Silver (SP)'), '4');
    await user.click(within(form).getByRole('button', { name: 'Award coins' }));
    expect(api.awardCoins).toHaveBeenCalledWith({
      targetType: 'character',
      targetId: 'brannoc',
      coins: { cp: 0, sp: 4, gp: 10, pp: 0 },
      source: 'encounter',
      note: '',
    });
    await user.click(screen.getByRole('button', { name: 'Split the pool' }));
    expect(api.splitPartyGold).toHaveBeenCalledWith('party');
  });

  it('lists the ledger and filters it', async () => {
    const user = userEvent.setup();
    dmView();
    const list = await screen.findByRole('list', { name: 'Ledger entries' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('+900 XP')).toBeInTheDocument();
    expect(within(list).getByText('1 XP left over')).toBeInTheDocument();
    expect(within(list).getByText('+7 GP, +1 SP')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Kind'), 'coin');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Kind'), 'all');
    await user.selectOptions(screen.getByLabelText('Who'), 'Kael');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('Party tab: a player', () => {
  const playerView = () =>
    show({
      dmMode: false,
      characters: [brannoc, wren],
      wallets: [
        wallet('party', 'party', { gp: 7 }),
        wallet('character', 'brannoc', { gp: 3, sp: 3 }),
        wallet('character', 'wren', { gp: 1 }),
      ],
    });

  it('sees their own characters and purses and the pool, read-only, with no award forms', async () => {
    const { container } = playerView();
    expect(await screen.findByText('and 1 other adventurer')).toBeInTheDocument();
    expect(screen.getByText('Brannoc’s purse').nextSibling).toHaveTextContent('3 GP, 3 SP');
    expect(screen.getByText('7 GP')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Split the pool' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Award XP' })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('deposits from their own purse, and cannot ask for more than it holds', async () => {
    vi.mocked(api.depositToParty).mockResolvedValue();
    const user = userEvent.setup();
    playerView();
    const form = await screen.findByRole('form', { name: 'Deposit into the party pool' });
    await user.type(within(form).getByLabelText('Gold (GP)'), '4');
    expect(within(form).getByText('That is more than the purse holds.')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Deposit' })).toBeDisabled();
    await user.clear(within(form).getByLabelText('Gold (GP)'));
    await user.type(within(form).getByLabelText('Gold (GP)'), '2');
    await user.click(within(form).getByRole('button', { name: 'Deposit' }));
    expect(api.depositToParty).toHaveBeenCalledWith('brannoc', { cp: 0, sp: 0, gp: 2, pp: 0 }, '');
    expect(await within(form).findByText('Deposited 2 GP into the pool.')).toBeInTheDocument();
  });

  it('shows the database’s refusal in words', async () => {
    vi.mocked(api.depositToParty).mockRejectedValue(
      new DataError('validation', 'Not enough coins: the wallet holds less than that'),
    );
    const user = userEvent.setup();
    playerView();
    const form = await screen.findByRole('form', { name: 'Deposit into the party pool' });
    await user.selectOptions(within(form).getByLabelText('From'), 'Wren');
    await user.type(within(form).getByLabelText('Gold (GP)'), '1');
    await user.click(within(form).getByRole('button', { name: 'Deposit' }));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent('Not enough coins: the wallet holds less than that'),
    );
  });
});
