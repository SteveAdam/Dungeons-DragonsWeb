import { BRANNOC, BRANNOC_ITEMS, hillGiantStrength } from '@dnd-manager/rules-engine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../../data/characters';
import * as charactersApi from '../../../data/characters';
import { DataError } from '../../../data/errors';
import type { Item, Transfer } from '../../../data/items';
import * as api from '../../../data/items';
import * as partyApi from '../../../data/party';
import { axeViolations } from '../../../test/axe';
import { PackTab } from './PackTab';

vi.mock('../../../data/items', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/items')>()),
  listCharacterItems: vi.fn(),
  listItems: vi.fn(),
  listTransfers: vi.fn(),
  getPartyRoster: vi.fn(),
  getItemSecret: vi.fn(),
  equipItem: vi.fn(),
  attuneItem: vi.fn(),
  offerTransfer: vi.fn(),
  acceptTransfer: vi.fn(),
  declineTransfer: vi.fn(),
  cancelTransfer: vi.fn(),
  createItem: vi.fn(),
  updateItemRules: vi.fn(),
  forceMoveItem: vi.fn(),
}));
vi.mock('../../../data/characters', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/characters')>()),
  listCharacters: vi.fn(),
}));
vi.mock('../../../data/party', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/party')>()),
  getParty: vi.fn(),
}));

const brannoc: Character = {
  id: 'ch1',
  campaignId: 'c1',
  ownerId: 'u1',
  name: 'Brannoc',
  sheet: BRANNOC,
  createdAt: '',
};
const stored = (i: (typeof BRANNOC_ITEMS)[number], over: Partial<Item> = {}): Item => ({
  ...i,
  campaignId: 'c1',
  srdRef: null,
  valueCp: 0,
  rarity: null,
  bound: false,
  ownerType: 'character',
  ownerId: 'ch1',
  damaged: false,
  ...over,
});
const item = (id: string) => BRANNOC_ITEMS.find(i => i.id === id)!;
const ring = (n: number, attuned: boolean): Item =>
  stored(
    { ...item('shield'), id: `ring-${n}`, name: `Ring ${n}`, kind: 'magic', definition: {}, weight: null },
    { requiresAttunement: true, attuned, equipped: true },
  );
const CARRIED: Item[] = [
  stored(item('chain-mail'), { equipped: true }),
  stored(item('shield'), { equipped: true }),
  stored(item('greatsword-drowned')),
  stored(item('arrows')),
  stored({
    ...item('arrows'),
    id: 'scroll',
    name: 'Scroll of Fog Cloud',
    kind: 'consumable',
    quantity: 1,
    weight: null,
    definition: { requirements: [{ stat: 'int', min: 10, onUnmet: 'lock' }] },
  }),
  stored(
    { ...item('arrows'), id: 'crown', name: 'Crown Shard', kind: 'quest', quantity: 1, weight: 1 },
    { bound: true },
  ),
];
const ROPE = stored(
  { ...item('arrows'), id: 'rope', name: 'Rope', quantity: 1, weight: 5 },
  { ownerType: 'party', ownerId: 'party' },
);
const transfer = (over: Partial<Transfer>): Transfer => ({
  id: 't1',
  itemId: 'scroll',
  itemName: 'Scroll of Fog Cloud',
  fromType: 'character',
  fromId: 'tolin',
  fromName: 'Tolin',
  toType: 'character',
  toId: 'ch1',
  toName: 'Brannoc',
  quantity: 1,
  status: 'accepted',
  createdAt: '2026-10-22T18:00:00Z',
  resolvedAt: '2026-10-22T18:05:00Z',
  ...over,
});

function show({
  carried = CARRIED,
  transfers = [] as Transfer[],
  dmMode = false,
  effects = [] as ReturnType<typeof hillGiantStrength>[],
} = {}) {
  vi.mocked(api.listCharacterItems).mockResolvedValue(carried);
  vi.mocked(api.listItems).mockResolvedValue([...carried, ROPE]);
  vi.mocked(api.listTransfers).mockResolvedValue(transfers);
  vi.mocked(api.getPartyRoster).mockResolvedValue([
    { id: 'ch1', name: 'Brannoc', baseScores: BRANNOC.abilityScores, effects: [] },
    { id: 'kael', name: 'Kael', baseScores: { ...BRANNOC.abilityScores, int: 9 }, effects: [] },
    { id: 'mira', name: 'Mira', baseScores: { ...BRANNOC.abilityScores, int: 18 }, effects: [] },
  ]);
  vi.mocked(charactersApi.listCharacters).mockResolvedValue([
    { id: 'ch1', campaignId: 'c1', ownerId: 'u1', name: 'Brannoc', xp: 6900, levelApplied: 5 },
  ]);
  vi.mocked(partyApi.getParty).mockResolvedValue({ id: 'party', name: 'The Party', memberIds: ['ch1'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PackTab campaignId="c1" character={brannoc} effects={effects} clock={{ seconds: 0 }} dmMode={dmMode} />
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.getByText(name, { selector: 'span' }).closest('li') as HTMLElement;

beforeEach(() => vi.clearAllMocks());

describe('Pack tab (P2-7)', () => {
  it('lists what Brannoc carries, its weight, locks and the party inventory', async () => {
    const { container } = show();
    expect(await screen.findByText('Carrying 69 lb')).toBeInTheDocument();
    expect(within(row('Greatsword of the Drowned')).getByText('Locked: needs STR 17, you have 16')).toBeInTheDocument();
    expect(within(row('Scroll of Fog Cloud')).getByText('Locked: needs INT 10, you have 9')).toBeInTheDocument();
    expect(within(row('Arrows')).getByText('× 20')).toBeInTheDocument();
    expect(within(row('Crown Shard')).getByText('Bound, can’t give')).toBeInTheDocument();
    expect(within(row('Crown Shard')).queryByRole('button', { name: /Give/ })).toBeNull();
    const party = screen.getByRole('region', { name: 'Party inventory' });
    expect(within(party).getByText('Rope')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('unlocks the greatsword while the Potion of Hill Giant Strength lasts', async () => {
    show({ effects: [hillGiantStrength(0)] });
    expect(
      await within(
        await screen
          .findByText('Greatsword of the Drowned', { selector: 'span' })
          .then(e => e.closest('li') as HTMLElement),
      ).findByText('Usable thanks to Potion of Hill Giant Strength'),
    ).toBeInTheDocument();
  });

  it('equips and unequips through the database, and shows its refusal', async () => {
    vi.mocked(api.equipItem).mockRejectedValueOnce(
      new DataError('validation', 'Only one suit of armour can be worn at a time: take the other off first'),
    );
    const user = userEvent.setup();
    show();
    await screen.findByText('Carrying 69 lb');
    await user.click(screen.getByRole('switch', { name: 'Equip Greatsword of the Drowned' }));
    expect(api.equipItem).toHaveBeenCalledWith('greatsword-drowned', true);
    expect(await within(row('Greatsword of the Drowned')).findByRole('alert')).toHaveTextContent(
      'Only one suit of armour can be worn at a time',
    );
    vi.mocked(api.equipItem).mockResolvedValue(undefined);
    await user.click(screen.getByRole('switch', { name: 'Equip Chain Mail' }));
    expect(api.equipItem).toHaveBeenLastCalledWith('chain-mail', false);
  });

  it('says so before a fourth attunement, without asking the database', async () => {
    const user = userEvent.setup();
    show({ carried: [ring(1, true), ring(2, true), ring(3, true), ring(4, false)] });
    expect(await screen.findByText('Attuned to 3 of 3 items.')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Attune to Ring 4' }));
    expect(within(row('Ring 4')).getByRole('alert')).toHaveTextContent(
      'You are attuned to 3 items already, the most anyone can be. End attunement to one first.',
    );
    expect(api.attuneItem).not.toHaveBeenCalled();
  });

  it('gives part of a stack to a party member, showing who could use it', async () => {
    vi.mocked(api.offerTransfer).mockResolvedValue(undefined);
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Give Scroll of Fog Cloud' }));
    const dialog = screen.getByRole('form', { name: 'Give Scroll of Fog Cloud to…' });
    expect(within(dialog).getByText('INT 9 · locked')).toBeInTheDocument();
    expect(within(dialog).getByText('INT 18 · can use')).toBeInTheDocument();
    expect(within(dialog).queryByText('Brannoc')).toBeNull();
    expect(within(dialog).getByText('They must accept before it moves.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));

    await user.click(screen.getByRole('button', { name: 'Give Arrows' }));
    const arrows = screen.getByRole('form', { name: 'Give Arrows to…' });
    await user.click(within(arrows).getByRole('radio', { name: /Kael/ }));
    await user.clear(within(arrows).getByLabelText('How many (of 20)'));
    await user.type(within(arrows).getByLabelText('How many (of 20)'), '4');
    await user.click(within(arrows).getByRole('button', { name: 'Offer to Kael' }));
    expect(api.offerTransfer).toHaveBeenCalledWith('arrows', 'kael', 4);
  });

  it('shows offers for Brannoc to accept or decline, his own waiting offers, and the history', async () => {
    vi.mocked(api.acceptTransfer).mockResolvedValue(undefined);
    const user = userEvent.setup();
    show({
      transfers: [
        transfer({ id: 'in', status: 'pending', itemId: 'potion', itemName: 'Potion of Healing', fromName: 'Mira' }),
        transfer({
          id: 'out',
          status: 'pending',
          itemId: 'arrows',
          itemName: 'Arrows',
          fromId: 'ch1',
          fromName: 'Brannoc',
          toId: 'kael',
          toName: 'Kael',
          quantity: 4,
        }),
        transfer({ id: 'old' }),
      ],
    });
    const offer = await screen.findByText('Mira offers you Potion of Healing.');
    await user.click(within(offer.parentElement as HTMLElement).getByRole('button', { name: 'Accept' }));
    expect(api.acceptTransfer).toHaveBeenCalledWith('in');
    expect(within(row('Arrows')).getByText('Offered to Kael, waiting')).toBeInTheDocument();
    const history = screen.getByRole('list', { name: 'Transfers' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    expect(history).toHaveTextContent('Scroll of Fog Cloud · Tolin → Brannoc · accepted');
  });

  it('lets the DM create an item cloned from the SRD and place it with Brannoc', async () => {
    vi.mocked(api.createItem).mockResolvedValue({} as never);
    const user = userEvent.setup();
    show({ dmMode: true });
    const form = await screen.findByRole('form', { name: 'Create an item' });
    await user.selectOptions(within(form).getByLabelText('Start from'), 'Chain Mail');
    expect(within(form).getByLabelText('Name')).toHaveValue('Chain Mail');
    await user.clear(within(form).getByLabelText('Name'));
    await user.type(within(form).getByLabelText('Name'), 'Drowned Mail');
    await user.type(within(form).getByLabelText('Magic bonus'), '1');
    await user.click(within(form).getByRole('button', { name: 'Create item' }));
    await waitFor(() => expect(api.createItem).toHaveBeenCalled());
    expect(vi.mocked(api.createItem).mock.calls[0][0]).toMatchObject({
      name: 'Drowned Mail',
      kind: 'armor',
      ownerType: 'character',
      ownerId: 'ch1',
      srdRef: 'chain-mail',
      weight: 55,
      valueCp: 7500,
      definition: { armor: { category: 'heavy', baseAc: 16, strength: 13, stealthDisadvantage: true }, magicBonus: 1 },
    });
  });
});
