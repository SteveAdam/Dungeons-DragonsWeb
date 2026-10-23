import { BRANNOC, computeSheet, type CharacterSheet, type LevelUpClass } from '@dnd-manager/rules-engine';
import { SRD_CLASSES, SRD_SPELLS } from '@dnd-manager/srd-data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../data/spells';
import type { SpellState } from '../../../data/spells';
import { axeViolations } from '../../../test/axe';
import { SpellsTab } from './SpellsTab';

vi.mock('../../../data/spells', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/spells')>()),
  getSpellState: vi.fn(),
  castSpell: vi.fn(),
  breakConcentration: vi.fn(),
  setPreparedSpells: vi.fn(),
}));

/** Sera, a level 3 Wizard (Intelligence 17): save DC 13, spell attack +5; slots 4 and 2. */
const sera: CharacterSheet = {
  ...BRANNOC,
  name: 'Sera',
  className: 'Wizard',
  xp: 900,
  levelApplied: 3,
  abilityScores: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 },
  spellcastingAbility: 'int',
  spells: {
    cantrips: ['Fire Bolt', 'Light', 'Mage Hand'],
    prepared: ['Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave', 'Shield', 'Blur'],
    spellbook: [
      'Detect Magic',
      'Feather Fall',
      'Mage Armor',
      'Magic Missile',
      'Sleep',
      'Thunderwave',
      'Shield',
      'Grease',
      'Blur',
      'Acid Arrow',
    ],
  },
};
const wizard = SRD_CLASSES.find(c => c.id === 'wizard')! as LevelUpClass;
const fresh = (over: Partial<SpellState> = {}): SpellState => ({
  slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  concentration: null,
  prepareOpen: true,
  ...over,
});

function show(state: SpellState, { dmMode = false, prepareAfterRestOnly = true, onSpellAttack = vi.fn() } = {}) {
  vi.mocked(api.getSpellState).mockResolvedValue(state);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SpellsTab
        characterId="ch1"
        sheet={sera}
        computed={computeSheet(sera, [], { seconds: 0 })}
        cls={wizard}
        spells={SRD_SPELLS}
        dmMode={dmMode}
        prepareAfterRestOnly={prepareAfterRestOnly}
        onSpellAttack={onSpellAttack}
      />
    </QueryClientProvider>,
  );
  return { ...view, onSpellAttack };
}
const spell = (name: string) => screen.getByText(name, { selector: 'span' }).closest('li') as HTMLElement;

beforeEach(() => vi.clearAllMocks());

describe('the Spells tab (P2-11)', () => {
  it('shows the spellcasting numbers, the slots as dots and the prepared spells by level', async () => {
    const { container } = show(fresh({ slotsUsed: [2, 0, 0, 0, 0, 0, 0, 0, 0] }));
    expect(await screen.findByText('Spell save DC')).toBeInTheDocument();
    expect(screen.getByText('Spell save DC').nextSibling).toHaveTextContent('13');
    expect(screen.getByText('Spell attack').nextSibling).toHaveTextContent('+5');
    expect(screen.getByRole('listitem', { name: '1st level: 2 of 4 left' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '2nd level: 2 of 2 left' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2nd level' })).toBeInTheDocument();
    expect(within(spell('Blur')).getByText('Concentration')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('casts a 1st-level spell with a slot, offers an upcast, and moves the dots with the server’s answer', async () => {
    vi.mocked(api.castSpell).mockResolvedValue(fresh({ slotsUsed: [1, 0, 0, 0, 0, 0, 0, 0, 0] }));
    const user = userEvent.setup();
    show(fresh());
    await screen.findByText('Spell save DC');
    const missile = spell('Magic Missile');
    expect(within(missile).getByLabelText('Slot')).toHaveDisplayValue('Level 1');
    await user.click(within(missile).getByRole('button', { name: 'Cast Magic Missile (level 1 slot)' }));
    expect(api.castSpell).toHaveBeenCalledWith('ch1', 'Magic Missile', 1, false);
    expect(await screen.findByRole('listitem', { name: '1st level: 3 of 4 left' })).toBeInTheDocument();
    // upcast with a level 2 slot: the damage grows with it
    await user.selectOptions(within(missile).getByLabelText('Slot'), 'Level 2 (upcast)');
    await user.click(within(missile).getByRole('button', { name: 'Cast Magic Missile (level 2 slot)' }));
    expect(api.castSpell).toHaveBeenLastCalledWith('ch1', 'Magic Missile', 2, false);
  });

  it('says when no slot is left, and cantrips need none', async () => {
    vi.mocked(api.castSpell).mockResolvedValue(fresh());
    const user = userEvent.setup();
    show(fresh({ slotsUsed: [4, 2, 0, 0, 0, 0, 0, 0, 0] }));
    await screen.findByText('Spell save DC');
    expect(within(spell('Sleep')).getByText('No slot left')).toBeInTheDocument();
    expect(within(spell('Sleep')).getByRole('button', { name: /Cast Sleep/ })).toBeDisabled();
    await user.click(within(spell('Light')).getByRole('button', { name: 'Cast Light' }));
    expect(api.castSpell).toHaveBeenCalledWith('ch1', 'Light', null, false);
  });

  it('casts rituals from the spellbook without a slot, and opens the odds for spell attacks', async () => {
    vi.mocked(api.castSpell).mockResolvedValue(fresh());
    const user = userEvent.setup();
    const { onSpellAttack } = show(fresh());
    await user.click(await screen.findByRole('button', { name: 'Cast Detect Magic as a ritual' }));
    expect(api.castSpell).toHaveBeenCalledWith('ch1', 'Detect Magic', null, true);
    await user.click(within(spell('Fire Bolt')).getByRole('button', { name: 'Attack roll: Fire Bolt' }));
    expect(onSpellAttack).toHaveBeenCalledWith(expect.any(HTMLElement), 'Fire Bolt');
    expect(within(spell('Fire Bolt')).getByText(/1d10 fire/)).toBeInTheDocument();
  });

  it('shows concentration, breaks it, and helps with the save DC', async () => {
    vi.mocked(api.breakConcentration).mockResolvedValue(fresh());
    const user = userEvent.setup();
    show(fresh({ concentration: { spell: 'Blur', slotLevel: 2, sinceSeconds: 0 } }));
    const banner = await screen.findByRole('region', { name: 'Concentration' });
    expect(within(banner).getByText('Concentrating on Blur')).toBeInTheDocument();
    await user.type(within(banner).getByLabelText('Damage taken'), '30');
    expect(within(banner).getByText('Constitution save DC 15 to keep concentrating')).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Break concentration' }));
    expect(api.breakConcentration).toHaveBeenCalledWith('ch1');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Concentration' })).toBeNull());
  });

  it('keeps preparing within the limit, and only after a rest when the campaign says so', async () => {
    const user = userEvent.setup();
    show(fresh({ prepareOpen: false }));
    await user.click(await screen.findByRole('button', { name: 'Change prepared spells' }));
    expect(
      screen.getByText(/6 of 6 prepared, from your spellbook\. Prepared spells change after a long rest/),
    ).toBeInTheDocument();
    const list = screen.getByRole('group', { name: 'Prepare up to 6' });
    expect(list).toBeDisabled();
    expect(within(list).getByText('You have prepared 6, the most a level 3 Wizard can.')).toBeInTheDocument();
    // a spell from the spellbook that is not prepared cannot be added while the list is full
    expect(within(list).getByRole('checkbox', { name: 'Grease (level 1)' })).toBeDisabled();
  });

  it('prepares and unprepares through the database when allowed', async () => {
    vi.mocked(api.setPreparedSpells).mockResolvedValue(undefined);
    const user = userEvent.setup();
    show(fresh(), { prepareAfterRestOnly: true });
    await user.click(await screen.findByRole('button', { name: 'Change prepared spells' }));
    await user.click(screen.getByRole('checkbox', { name: 'Sleep (level 1)' }));
    expect(api.setPreparedSpells).toHaveBeenCalledWith('ch1', [
      'Mage Armor',
      'Magic Missile',
      'Thunderwave',
      'Shield',
      'Blur',
    ]);
  });
});
