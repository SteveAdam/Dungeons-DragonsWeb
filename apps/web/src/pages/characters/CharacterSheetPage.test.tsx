import { BRANNOC, hillGiantStrength } from '@dnd-manager/rules-engine';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as campaignsApi from '../../data/campaigns';
import type { Character } from '../../data/characters';
import * as charactersApi from '../../data/characters';
import { DataError } from '../../data/errors';
import * as membersApi from '../../data/members';
import * as rollsApi from '../../data/rolls';
import { useDmModeStore } from '../../state/dmModeStore';
import { CharacterSheetPage } from './CharacterSheetPage';

vi.mock('../../data/characters');
vi.mock('../../data/campaigns');
vi.mock('../../data/members');
vi.mock('../../data/rolls');

const brannoc: Character = {
  id: 'ch1',
  campaignId: 'c1',
  ownerId: 'u-player',
  name: 'Brannoc',
  sheet: BRANNOC,
  createdAt: '',
};
const now = () => Math.floor(Date.now() / 1000);

function setUp(role: 'dm' | 'player', effects = [] as ReturnType<typeof hillGiantStrength>[]) {
  vi.mocked(membersApi.getMyRole).mockResolvedValue(role);
  vi.mocked(membersApi.listMembers).mockResolvedValue([
    { userId: 'u-player', role: 'player', joinedAt: '', displayName: 'Joel', avatarUrl: null },
  ]);
  vi.mocked(campaignsApi.getCampaign).mockResolvedValue({
    id: 'c1',
    name: 'The Sunken Crown',
    rulesEdition: '2024',
    nextSessionAt: null,
    createdAt: '',
  });
  vi.mocked(charactersApi.getCharacter).mockResolvedValue(brannoc);
  vi.mocked(charactersApi.listEffects).mockResolvedValue(effects);
  vi.mocked(charactersApi.getEffectSecrets).mockResolvedValue(new Map(effects.map(e => [e.id, 'Brewed by a hag'])));
}

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/campaigns/c1/characters/ch1']}>
        <Routes>
          <Route path="/campaigns/:campaignId/characters/:characterId" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.findByRole('tabpanel', { name: 'Sheet' });
}

const row = (sheet: HTMLElement, name: RegExp) => within(sheet).getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useDmModeStore.setState({ dmMode: true });
});

describe('Sheet tab for Brannoc (acceptance 2)', () => {
  it('shows exactly the expected numbers', async () => {
    setUp('player');
    const sheet = await renderSheet();
    expect(within(sheet).getByRole('heading', { name: 'Brannoc' })).toBeInTheDocument();
    expect(within(sheet).getByText('Fighter 5')).toBeInTheDocument();
    expect(within(sheet).getByText('6,900 of 14,000 for Level 6')).toBeInTheDocument();
    // ability scores and modifiers
    const abilities = within(sheet).getByRole('region', { name: 'Ability scores' });
    expect(
      within(abilities)
        .getAllByText(/^[+-]\d+$/)
        .map(e => e.textContent),
    ).toEqual(['+3', '+1', '+2', '-1', '+0', '+0']);
    // saves and skills
    expect(row(sheet, /^Strength \+6, proficient/)).toBeInTheDocument();
    expect(row(sheet, /^Dexterity \+1: /)).toBeInTheDocument();
    expect(row(sheet, /^Constitution \+5, proficient/)).toBeInTheDocument();
    expect(row(sheet, /^Intelligence -1: /)).toBeInTheDocument();
    expect(row(sheet, /^Athletics \+6, proficient/)).toBeInTheDocument();
    expect(row(sheet, /^Intimidation \+3, proficient/)).toBeInTheDocument();
    expect(row(sheet, /^Perception \+3, proficient/)).toBeInTheDocument();
    expect(row(sheet, /^Survival \+3, proficient/)).toBeInTheDocument();
    expect(row(sheet, /^Acrobatics \+1: /)).toBeInTheDocument();
    expect(row(sheet, /^Arcana -1: /)).toBeInTheDocument();
    expect(within(sheet).getAllByRole('button', { name: /: see the odds$/ })).toHaveLength(6 + 18);
    // combat numbers
    expect(within(sheet).getByText('Armour').nextSibling).toHaveTextContent('18');
    expect(within(sheet).getByText('Initiative').nextSibling).toHaveTextContent('+1');
    expect(within(sheet).getByText('Speed').nextSibling).toHaveTextContent('25');
    expect(within(sheet).getByText('Proficiency').nextSibling).toHaveTextContent('+3');
    expect(within(sheet).getByText('Passive Perception 13')).toBeInTheDocument();
    expect(within(sheet).getByText('39 of 50 · Hit dice 4d10')).toBeInTheDocument();
    // attacks: the greatsword is not among them, and the equipment says why
    const attacks = within(sheet).getByRole('region', { name: 'Attacks' });
    expect(
      within(attacks)
        .getAllByRole('button')
        .map(b => b.textContent),
    ).toEqual(['Longsword +1 · Sap+71d8+4 slashing', 'Handaxe · Vex+61d6+3 slashing']);
    const equipment = within(sheet).getByRole('region', { name: 'Equipment' });
    expect(within(equipment).getByText('Strength 17 needed, you have 16')).toBeInTheDocument();
    // other tabs are coming soon
    expect(screen.getByRole('tab', { name: 'Spells' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Played by Joel')).toBeInTheDocument();
  });

  it('with Hill Giant Strength: Str 21, Athletics +8, Longsword +9 for 1d8+6, the greatsword usable for an hour', async () => {
    setUp('player', [hillGiantStrength(now())]);
    const sheet = await renderSheet();
    await waitFor(() => expect(row(sheet, /^Athletics \+8/)).toBeInTheDocument());
    const abilities = within(sheet).getByRole('region', { name: 'Ability scores' });
    expect(within(abilities).getByText('21')).toBeInTheDocument();
    const attacks = within(sheet).getByRole('region', { name: 'Attacks' });
    expect(within(attacks).getByRole('button', { name: /Longsword \+1.*\+91d8\+6 slashing/ })).toBeInTheDocument();
    expect(
      within(attacks).getByRole('button', { name: /Greatsword of the Drowned.*usable for 1 hour/ }),
    ).toBeInTheDocument();
    const equipment = within(sheet).getByRole('region', { name: 'Equipment' });
    expect(
      within(equipment).getByText('Usable for 1 hour, thanks to Potion of Hill Giant Strength'),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Potion of Hill Giant Strength · 1 hour left')).toBeInTheDocument();
  });

  it('players never ask for, or see, the hidden details of effects', async () => {
    setUp('player', [hillGiantStrength(now())]);
    const sheet = await renderSheet();
    await within(sheet).findByText('Potion of Hill Giant Strength · 1 hour left');
    expect(charactersApi.getEffectSecrets).not.toHaveBeenCalled();
    expect(within(sheet).queryByText(/Brewed by a hag/)).not.toBeInTheDocument();
  });

  it('a DM in DM mode sees them', async () => {
    setUp('dm', [hillGiantStrength(now())]);
    const sheet = await renderSheet();
    expect(await within(sheet).findByText('DM only: Brewed by a hag')).toBeInTheDocument();
  });

  it('a character that is not yours reads as not found (row level security hides it)', async () => {
    setUp('player');
    vi.mocked(charactersApi.getCharacter).mockRejectedValue(
      new DataError('not-found', 'We could not find that character, or it is not yours to see.'),
    );
    renderSheet().catch(() => {});
    expect(await screen.findByText('We could not find that character, or it is not yours to see.')).toBeInTheDocument();
  });
});

describe('rolling from the sheet', () => {
  it('a skill opens the odds with its bonus, using the DC the DM gave, and rolls for the character', async () => {
    setUp('player');
    vi.mocked(rollsApi.rollD20).mockResolvedValue({
      id: 'r1',
      campaignId: 'c1',
      characterId: 'ch1',
      rolledBy: 'u-player',
      kind: 'check',
      label: 'Athletics check',
      bonus: 6,
      target: 12,
      mode: 'normal',
      dice: [9],
      kept: 9,
      total: 15,
      success: true,
      crit: false,
      fumble: false,
      hidden: false,
      createdAt: '',
    });
    const user = userEvent.setup();
    const sheet = await renderSheet();
    await user.type(within(sheet).getByRole('spinbutton', { name: 'DC' }), '12');
    await user.click(row(sheet, /^Athletics \+6/));
    const dialog = screen.getByRole('dialog', { name: 'Athletics check' });
    expect(within(dialog).getByText('Athletics check, DC 12, your bonus +6')).toBeInTheDocument();
    expect(within(dialog).getByText('Strength +3 · Proficiency +3')).toBeInTheDocument();
    expect(within(dialog).getByText('75%')).toBeInTheDocument(); // need 6: 15/20
    await user.click(within(dialog).getByRole('button', { name: 'Roll' }));
    expect(rollsApi.rollD20).toHaveBeenCalledWith({
      campaignId: 'c1',
      characterId: 'ch1',
      kind: 'check',
      label: 'Athletics check',
      bonus: 6,
      target: 12,
      mode: 'normal',
    });
    expect(await within(dialog).findByText('Success')).toBeInTheDocument();
  });

  it('an attack asks for the target armour class', async () => {
    setUp('player');
    const user = userEvent.setup();
    const sheet = await renderSheet();
    await user.type(within(sheet).getByRole('spinbutton', { name: 'Target armour class' }), '16');
    await user.click(within(sheet).getByRole('button', { name: /^Longsword \+1/ }));
    const dialog = screen.getByRole('dialog', { name: 'Longsword +1' });
    expect(within(dialog).getByText('Longsword +1 attack, AC 16, your bonus +7')).toBeInTheDocument();
    expect(within(dialog).getByText('Critical hit chance: 5%')).toBeInTheDocument();
  });
});
