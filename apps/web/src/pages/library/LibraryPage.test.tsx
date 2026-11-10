import type { SrdArmor, SrdClass, SrdMonster, SrdSpell, SrdWeapon } from '@dnd-manager/srd-data/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as srd from '../../data/srd';
import { useDmMode } from '../../hooks/useDmMode';
import { axeViolations } from '../../test/axe';
import LibraryPage from './LibraryPage';

vi.mock('../../data/srd');
vi.mock('../../hooks/useDmMode');
vi.mock('../../hooks/useCampaigns', () => ({
  useCampaign: () => ({ data: { name: 'The Sunken Crown', daylight: null } }),
}));
vi.mock('../../hooks/useRegions', () => ({
  useCampaignRegions: () => ({
    isPending: false,
    isError: false,
    data: [{ id: 'r1', name: 'Whisper Wood', mapName: 'Vale' }],
  }),
}));
// the region entry form has its own tests: here only what it is given matters
vi.mock('../map/content/ContentForm', () => ({
  ContentForm: (props: { regionId: string; kind: string; initial: { name: string; monsterRef: string } }) => (
    <p>{`Entry form: ${props.kind} ${props.initial.name} ${props.initial.monsterRef} in ${props.regionId}`}</p>
  ),
}));

const cleric = { id: 'cleric', name: 'Cleric', firstSlotAt: { '1': 1, '7': 13 } } as unknown as SrdClass;
const spell = (over: Partial<SrdSpell>) =>
  ({
    id: 'bless',
    name: 'Bless',
    source: 'srd-5.2',
    level: 1,
    school: 'enchantment',
    castingTime: 'Action',
    range: '30 feet',
    components: { v: true, s: true, m: false },
    duration: 'Concentration, up to 1 minute',
    concentration: true,
    ritual: false,
    classes: ['Cleric'],
    text: 'You bless up to three creatures.',
    ...over,
  }) as SrdSpell;
const spells = [
  spell({}),
  spell({
    id: 'regenerate',
    name: 'Regenerate',
    level: 7,
    school: 'transmutation',
    concentration: false,
    text: 'A creature regains hit points.',
  }),
];
const entryList = { traits: [], actions: [], bonusActions: [], reactions: [], legendaryActions: [] };
const wolf = {
  ...entryList,
  id: 'wolf',
  name: 'Wolf',
  size: ['Medium'],
  creatureType: 'Beast',
  alignment: 'Unaligned',
  armourClass: 12,
  initiative: { bonus: 2, score: 12 },
  hitPoints: 11,
  hitDice: '2d8 + 2',
  speedText: '40 ft.',
  abilityScores: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
  saves: { str: 2, dex: 2, con: 1, int: -4, wis: 1, cha: -2 },
  skills: [{ name: 'Perception', bonus: 5 }],
  damageVulnerabilities: [],
  damageResistances: [],
  damageImmunities: [],
  conditionImmunities: [],
  gear: [],
  senses: ['Darkvision 60 ft.'],
  passivePerception: 15,
  languages: 'None',
  challengeRating: '1/4',
  challengeValue: 0.25,
  xp: 50,
  proficiencyBonus: 2,
  traits: [{ name: 'Pack Tactics', description: 'The wolf has Advantage.' }],
  actions: [{ name: 'Bite', description: 'Melee Attack Roll: +4.' }],
} as unknown as SrdMonster;
const ogre = { ...wolf, id: 'ogre', name: 'Ogre', challengeRating: '2', challengeValue: 2 } as SrdMonster;
const longsword = {
  id: 'longsword',
  name: 'Longsword',
  category: 'martial',
  kind: 'melee',
  damage: { dice: '1d8', type: 'slashing' },
  properties: ['versatile'],
  versatileDice: '1d10',
  propertiesText: 'Versatile (1d10)',
  mastery: 'sap',
  weightLb: 3,
  cost: { amount: 15, coin: 'gp' },
} as unknown as SrdWeapon;
const shield = {
  id: 'shield',
  name: 'Shield',
  category: 'shield',
  acText: '+2',
  strength: null,
  stealthDisadvantage: false,
  donDoff: '1 Action to Don or Doff',
  weightLb: 6,
  cost: { amount: 10, coin: 'gp' },
} as unknown as SrdArmor;

function dm(dmMode = true) {
  vi.mocked(useDmMode).mockReturnValue({ isDm: dmMode, dmMode, setDmMode: vi.fn(), roleLoading: false });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/campaigns/c1/library']}>
        <Routes>
          <Route path="/campaigns/:campaignId/library" element={<LibraryPage />} />
          <Route path="/campaigns/:campaignId" element={<p>The hub</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const openTab = (name: string) => userEvent.click(screen.getByRole('tab', { name }));
const list = (what: string) => screen.getByRole('region', { name: `${what} list` });

beforeEach(() => {
  vi.clearAllMocks();
  dm();
  vi.mocked(srd.listSrdSpells).mockResolvedValue(spells);
  vi.mocked(srd.listSrdClasses).mockResolvedValue([cleric]);
  vi.mocked(srd.listSrdMonsters).mockResolvedValue([wolf, ogre]);
  vi.mocked(srd.listSrdWeapons).mockResolvedValue([longsword]);
  vi.mocked(srd.listSrdArmor).mockResolvedValue([shield]);
});

describe('who may enter', () => {
  it('sends a player back to the hub', async () => {
    dm(false);
    renderPage();
    expect(await screen.findByText('The hub')).toBeInTheDocument();
    expect(srd.listSrdSpells).not.toHaveBeenCalled();
  });

  it('waits to learn the role before deciding', () => {
    vi.mocked(useDmMode).mockReturnValue({ isDm: false, dmMode: false, setDmMode: vi.fn(), roleLoading: true });
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Unlocking the library');
    expect(screen.queryByText('The hub')).not.toBeInTheDocument();
  });
});

describe('the spells shelf', () => {
  it('filters by class and tier down to Regenerate and shows its details', async () => {
    const user = userEvent.setup();
    renderPage();
    await within(list('spells')).findByText('Bless');
    await user.selectOptions(screen.getByLabelText('Class'), 'Cleric');
    await user.click(screen.getByRole('checkbox', { name: 'Levels 11 to 16' }));
    expect(within(list('spells')).queryByText('Bless')).not.toBeInTheDocument();
    await user.click(within(list('spells')).getByRole('button', { name: /Regenerate/ }));

    const entry = screen.getByRole('article', { name: 'Regenerate' });
    expect(within(entry).getByText('Tier 3, from level 13')).toBeInTheDocument();
    expect(within(entry).getByText(/Level 7 Transmutation/)).toBeInTheDocument();
    expect(within(entry).getByText('A creature regains hit points.')).toBeInTheDocument();
  });

  it('shows the concentration tag only where it applies', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await within(list('spells')).findByRole('button', { name: /Bless/ }));
    expect(within(screen.getByRole('article', { name: 'Bless' })).getByText('CONCENTRATION')).toBeInTheDocument();
    await user.click(within(list('spells')).getByRole('button', { name: /Regenerate/ }));
    expect(screen.queryByText('CONCENTRATION')).not.toBeInTheDocument();
  });

  it('marks an unknown tier and lists it in a console warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(srd.listSrdSpells).mockResolvedValue([spell({ id: 'odd', name: 'Odd', classes: ['Artificer'] })]);
    renderPage();
    expect(await within(list('spells')).findByText(/tier unknown/)).toBeInTheDocument();
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Odd: no class table for Artificer')),
    );
    warn.mockRestore();
  });

  it('says so when the filters leave nothing, and when the campaign shelf is empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await within(list('spells')).findByText('Bless');
    await user.type(screen.getByLabelText('Search spells'), 'zzz');
    expect(screen.getByText('Nothing on this shelf matches these filters.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'SRD' }));
    expect(screen.getByText(/No campaign spells yet/)).toBeInTheDocument();
  });

  it('says so when nothing has been imported', async () => {
    vi.mocked(srd.listSrdSpells).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/shelf is empty/)).toBeInTheDocument();
  });

  it('reports a failure to read the shelf', async () => {
    vi.mocked(srd.listSrdSpells).mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('has no accessibility problems with an entry open', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await user.click(await within(list('spells')).findByRole('button', { name: /Regenerate/ }));
    expect(await axeViolations(container)).toEqual([]);
  });

  it('leaves the stubbed actions disabled', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await within(list('spells')).findByRole('button', { name: /Bless/ }));
    for (const name of ['Clone and modify', 'Add to a character', 'Use as a path goal']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});

describe('the monsters shelf', () => {
  it('filters by challenge rating', async () => {
    const user = userEvent.setup();
    renderPage();
    await openTab('Monsters');
    await within(list('monsters')).findByText('Ogre');
    await user.selectOptions(screen.getByLabelText('Highest challenge'), 'CR 1/4');
    expect(within(list('monsters')).queryByText('Ogre')).not.toBeInTheDocument();
    expect(within(list('monsters')).getByText('Wolf')).toBeInTheDocument();
  });

  it('opens a stat block and places the monster with the region form prefilled', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openTab('Monsters');
    await user.click(await within(list('monsters')).findByRole('button', { name: /Wolf/ }));

    const block = screen.getByRole('article', { name: 'Wolf stat block' });
    expect(within(block).getByText('Armour Class').parentElement).toHaveTextContent('Armour Class 12');
    expect(within(block).getByText('11 (2d8 + 2)')).toBeInTheDocument();
    expect(within(block).getByRole('rowheader', { name: 'STR' })).toBeInTheDocument();
    expect(within(block).getByText('Perception +5')).toBeInTheDocument();
    expect(within(block).getByText('Pack Tactics.', { exact: false })).toBeInTheDocument();
    expect(within(block).getByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Place in a region' }));
    expect(screen.getByText('Entry form: creature Wolf srd:wolf in r1')).toBeInTheDocument();
  });
});

describe('the weapons shelf', () => {
  it('shows a weapon with its item rules disabled', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await openTab('Weapons');
    await user.click(await within(list('weapons')).findByRole('button', { name: /Longsword/ }));

    const entry = screen.getByRole('article', { name: 'Longsword' });
    expect(within(entry).getByText('1d8 slashing (1d10 two-handed)')).toBeInTheDocument();
    expect(within(entry).getByText('Sap')).toBeInTheDocument();
    expect(within(entry).getByText('15 GP')).toBeInTheDocument();
    expect(within(entry).getByText('Editable in custom weapons')).toBeInTheDocument();
    expect(within(entry).getByRole('group', { name: 'Item rules' })).toBeDisabled();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('the items shelf', () => {
  it('holds armour for now', async () => {
    const user = userEvent.setup();
    renderPage();
    await openTab('Items');
    await user.click(await within(list('items')).findByRole('button', { name: /Shield/ }));
    expect(within(screen.getByRole('article', { name: 'Shield' })).getByText('+2')).toBeInTheDocument();
  });
});

describe('reading an entry', () => {
  it('goes back to the list with the back button', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await within(list('spells')).findByRole('button', { name: /Bless/ }));
    await user.click(screen.getByRole('button', { name: 'Back to the list' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('Choose an entry to read it here.')).toBeInTheDocument();
  });
});
