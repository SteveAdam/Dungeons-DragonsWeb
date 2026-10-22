import { SRD_BACKGROUNDS, SRD_CLASSES, SRD_SPECIES, SRD_SPELLS } from '@dnd-manager/srd-data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../auth/authContext';
import * as srdApi from '../../data/srd';
import { axeViolations } from '../../test/axe';
import ClassesDevPage from './ClassesDevPage';

vi.mock('../../data/srd');
beforeEach(() => {
  vi.mocked(srdApi.listSrdSpecies).mockResolvedValue(SRD_SPECIES);
  vi.mocked(srdApi.listSrdBackgrounds).mockResolvedValue(SRD_BACKGROUNDS);
  vi.mocked(srdApi.listSrdSpells).mockResolvedValue(SRD_SPELLS);
});

function show(session: AuthState['session']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ session, loading: false, signOut: async () => {} }}>
        <ClassesDevPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
const signedIn = { user: { id: 'u1' } } as NonNullable<AuthState['session']>;

describe('/dev/classes', () => {
  it('shows the imported Barbarian: traits, the level 1 to 3 table, features and subclass', async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue(SRD_CLASSES);
    const { container } = show(signedIn);
    expect(await screen.findByRole('heading', { level: 1, name: 'Barbarian srd-5.2' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Hit Point Die D12 per Barbarian level' })).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: '1 +2 Rage, Unarmored Defense, Weapon Mastery 2 +2 2' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: '3 +2 Barbarian Subclass, Primal Knowledge 3 +2 2' })).toBeInTheDocument();
    const frenzy = screen.getByRole('region', { name: 'Level 3: Frenzy' });
    expect(within(frenzy).getByText('mechanics later')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Barbarian Subclass: Path of the Berserker' })).toBeInTheDocument();
    // the Rage bullets are a list
    expect(within(screen.getByRole('region', { name: 'Level 1: Rage' })).getAllByRole('listitem')).toHaveLength(3);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("shows a feature's own table, such as Life Domain Spells", async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue(SRD_CLASSES.filter(c => c.id === 'cleric'));
    show(signedIn);
    const table = await screen.findByRole('table', { name: 'Life Domain Spells' });
    expect(
      within(table).getByRole('row', { name: '3 Aid, Bless, Cure Wounds, Lesser Restoration' }),
    ).toBeInTheDocument();
  });

  it('shows the imported species on their own tab, with traits and tables', async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue(SRD_CLASSES);
    const user = userEvent.setup();
    show(signedIn);
    await user.click(await screen.findByRole('tab', { name: 'Species' }));
    const elf = await screen.findByRole('region', { name: 'Elf srd-5.2' });
    expect(within(elf).getByRole('row', { name: 'Speed 30 feet' })).toBeInTheDocument();
    const lineages = within(elf).getByRole('table', { name: 'Elven Lineages' });
    expect(within(lineages).getByRole('row', { name: /^High Elf .* Detect Magic Misty Step$/ })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toHaveLength(9);
  });

  it('shows the imported backgrounds on their own tab, with each Origin feat’s text', async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue(SRD_CLASSES);
    const user = userEvent.setup();
    show(signedIn);
    await user.click(await screen.findByRole('tab', { name: 'Backgrounds' }));
    const soldier = await screen.findByRole('region', { name: 'Soldier srd-5.2' });
    expect(
      within(soldier).getByRole('row', { name: 'Ability Scores Strength, Dexterity, Constitution' }),
    ).toBeInTheDocument();
    expect(
      within(soldier).getByRole('row', { name: 'Skill Proficiencies Athletics and Intimidation' }),
    ).toBeInTheDocument();
    expect(within(soldier).getByRole('region', { name: 'Feat: Savage Attacker' })).toHaveTextContent(
      'roll the weapon’s damage dice twice',
    );
  });

  it('shows the imported spells by level, with their heading lines and what mechanics were read', async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue(SRD_CLASSES);
    const user = userEvent.setup();
    show(signedIn);
    await user.click(await screen.findByRole('tab', { name: 'Spells' }));
    expect(await screen.findByRole('heading', { name: 'Cantrips (27)' })).toBeInTheDocument();
    const fireBolt = screen.getByRole('region', { name: 'Fire Bolt' });
    expect(within(fireBolt).getByText('Evocation Cantrip (Sorcerer, Wizard)')).toBeInTheDocument();
    expect(within(fireBolt).getByRole('row', { name: 'Range 120 feet' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Light' })).getByRole('row', { name: /^Components V, M \(a firefly/ }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Guidance' })).getByText('Text only (no mechanics read)'),
    ).toBeInTheDocument();
  });

  it('says what to run when nothing has been imported', async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue([]);
    show(signedIn);
    expect(await screen.findByText('No classes imported yet. Run pnpm srd:import.')).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in, without querying', () => {
    show(null);
    expect(screen.getByText('Sign in to read the imported SRD classes.')).toBeInTheDocument();
    expect(srdApi.listSrdClasses).not.toHaveBeenCalled();
  });
});
