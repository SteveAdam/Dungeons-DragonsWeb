import { SRD_ARMOR, SRD_BACKGROUNDS, SRD_CLASSES, SRD_SPECIES, SRD_SPELLS, SRD_WEAPONS } from '@dnd-manager/srd-data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../data/creation';
import type { CreationDraft, WizardSrd } from '../../../data/creation';
import { axeViolations } from '../../../test/axe';
import { blankChoices } from './blankChoices';
import { Wizard } from './Wizard';

vi.mock('../../../data/creation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/creation')>()),
  saveDraft: vi.fn(),
  rollAbilityScores: vi.fn(),
  createCharacter: vi.fn(),
}));

const srd: WizardSrd = {
  classes: SRD_CLASSES,
  species: SRD_SPECIES,
  backgrounds: SRD_BACKGROUNDS,
  spells: SRD_SPELLS,
  weapons: SRD_WEAPONS,
  armor: SRD_ARMOR,
};
// 6,6,6,1 → 18; 5,5,5,1 → 15; 4,4,4,1 → 12 (twice); 3,3,3,1 → 9; 2,2,2,1 → 6
const DICE = [6, 6, 6, 1, 5, 5, 5, 1, 4, 4, 4, 1, 4, 4, 4, 1, 3, 3, 3, 1, 2, 2, 2, 1];

function show(start: CreationDraft | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/campaigns/c1/characters/new']}>
        <Routes>
          <Route path="/campaigns/c1/characters/new" element={<Wizard campaignId="c1" srd={srd} start={start} />} />
          <Route path="/campaigns/c1/characters/:id" element={<p>Sheet opened</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Next' }));
const title = () => screen.getByRole('heading', { level: 2 }).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.saveDraft).mockResolvedValue();
});

describe('the character creation wizard (P2-9)', () => {
  it('walks a Fighter through every step to the computed sheet, saving the draft at each step, then creates it', async () => {
    vi.mocked(api.createCharacter).mockResolvedValue('new-id');
    const user = userEvent.setup();
    const { container } = show();
    expect(title()).toBe('1. Name and species');
    expect(screen.getByRole('navigation', { name: 'Creation steps' })).toBeInTheDocument();

    // a step with broken choices does not let you on
    await next(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Give your character a name of up to 80 letters.');
    expect(title()).toBe('1. Name and species');

    await user.type(screen.getByLabelText('Name'), 'Brannoc');
    await user.selectOptions(screen.getByLabelText('Species'), 'Human');
    expect(screen.getByRole('region', { name: 'Human traits' })).toHaveTextContent('Skillful');
    await user.selectOptions(screen.getByLabelText('Size'), 'Medium');
    await next(user);
    expect(api.saveDraft).toHaveBeenLastCalledWith('c1', expect.objectContaining({ step: 1 }));

    await user.selectOptions(screen.getByLabelText('Class'), 'Fighter');
    expect(screen.getByRole('region', { name: 'Fighter traits' })).toHaveTextContent('D10 per Fighter level');
    await next(user);
    await user.selectOptions(screen.getByLabelText('Background'), 'Soldier');
    expect(screen.getByRole('region', { name: 'Soldier background' })).toHaveTextContent('Savage Attacker');
    await next(user);

    expect(title()).toBe('4. Ability scores');
    for (const [ability, score] of [
      ['Strength', '15'],
      ['Dexterity', '13'],
      ['Constitution', '14'],
      ['Intelligence', '8'],
      ['Wisdom', '12'],
      ['Charisma', '10'],
    ]) {
      await user.selectOptions(screen.getByLabelText(`${ability} score`), score);
    }
    await user.selectOptions(screen.getByLabelText('+1 to'), 'Constitution');
    // Strength 15 + 2 (the background's first ability), Constitution 14 + 1
    expect(screen.getByRole('row', { name: 'Strength 15 17 +3' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Constitution 14 15 +2' })).toBeInTheDocument();
    await next(user);

    expect(title()).toBe('5. Skills');
    expect(screen.getByRole('checkbox', { name: /Athletics/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Perception' }));
    await user.click(screen.getByRole('checkbox', { name: 'Survival' }));
    await next(user);
    expect(title()).toBe('6. Equipment');
    await next(user);
    expect(screen.getByText('Fighters cast no spells at level 1.')).toBeInTheDocument();
    await next(user);
    await user.selectOptions(screen.getByLabelText('Alignment'), 'Lawful neutral');
    await next(user);

    expect(title()).toBe('9. Review');
    const review = screen.getByRole('region', { name: 'Your character' });
    expect(within(review).getByText('Human Fighter 1 · Soldier · Lawful neutral')).toBeInTheDocument();
    // hit points: the d10's 10 plus Constitution +2; chain mail: armour class 16
    expect(within(review).getByText('Hit points').nextSibling).toHaveTextContent('12');
    expect(within(review).getByText('Armour class').nextSibling).toHaveTextContent('16');
    expect(await axeViolations(container)).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Create character' }));
    expect(api.createCharacter).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ name: 'Brannoc', class: 'fighter', skills: ['perception', 'survival'] }),
    );
    expect(await screen.findByText('Sheet opened')).toBeInTheDocument();
  });

  it('restores a draft where it was left, with its rolled scores, and offers no second roll', async () => {
    const choices = {
      ...blankChoices(),
      name: 'Sera',
      species: 'elf',
      class: 'wizard',
      background: 'sage',
      abilities: {
        method: 'roll' as const,
        rollId: 'r1',
        base: { str: 6, dex: 15, con: 12, int: 18, wis: 12, cha: 9 },
      },
    };
    show({ step: 3, choices, roll: { id: 'r1', dice: DICE } });
    expect(title()).toBe('4. Ability scores');
    expect(screen.getByText(/You rolled 18, 15, 12, 12, 9, 6\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Roll 4d6/ })).toBeNull();
    expect(screen.getByLabelText('Intelligence score')).toHaveValue('18');
  });

  it('rolls on the server once, and saves the roll with the draft at once', async () => {
    vi.mocked(api.rollAbilityScores).mockResolvedValue({ id: 'r9', dice: DICE });
    const user = userEvent.setup();
    show({
      step: 3,
      choices: { ...blankChoices(), name: 'Kael', species: 'orc', class: 'barbarian', background: 'soldier' },
      roll: null,
    });
    await user.click(screen.getByRole('radio', { name: /Roll \(4d6/ }));
    await user.click(screen.getByRole('button', { name: 'Roll 4d6 six times' }));
    expect(api.rollAbilityScores).toHaveBeenCalledWith('c1');
    expect(await screen.findByText(/You rolled 18, 15, 12, 12, 9, 6\./)).toBeInTheDocument();
    await waitFor(() =>
      expect(api.saveDraft).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          roll: { id: 'r9', dice: DICE },
          choices: expect.objectContaining({ abilities: expect.objectContaining({ method: 'roll', rollId: 'r9' }) }),
        }),
      ),
    );
  });

  it('a Wizard chooses cantrips, a spellbook of six and four prepared from it', async () => {
    const user = userEvent.setup();
    show({
      step: 6,
      choices: {
        ...blankChoices(),
        name: 'Sera',
        species: 'elf',
        class: 'wizard',
        background: 'sage',
        skills: ['investigation', 'insight'],
      },
      roll: null,
    });
    expect(title()).toBe('7. Spells');
    for (const s of ['Fire Bolt', 'Light', 'Mage Hand']) await user.click(screen.getByRole('checkbox', { name: s }));
    await next(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose 6 spellbook spells.');
    const book = ['Detect Magic', 'Feather Fall', 'Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'];
    const spellbook = screen.getByRole('group', { name: /Spellbook/ });
    for (const s of book) await user.click(within(spellbook).getByRole('checkbox', { name: s }));
    const prepared = screen.getByRole('group', { name: /Prepared from your spellbook/ });
    expect(within(prepared).getAllByRole('checkbox')).toHaveLength(6);
    for (const s of book.slice(2)) await user.click(within(prepared).getByRole('checkbox', { name: s }));
    await next(user);
    expect(title()).toBe('8. Details');
  });

  it('when the server refuses, shows its reasons on the step they belong to', async () => {
    vi.mocked(api.createCharacter).mockRejectedValue(
      new api.CreationRejected('Some choices break the rules', [
        { step: 'skills', message: 'Fighters cannot choose arcana.' },
      ]),
    );
    const user = userEvent.setup();
    const choices = {
      ...blankChoices(),
      name: 'Brannoc',
      species: 'orc',
      class: 'fighter',
      background: 'soldier',
      skills: ['perception' as const, 'survival' as const],
    };
    show({ step: 8, choices, roll: null });
    await user.click(screen.getByRole('button', { name: 'Create character' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fighters cannot choose arcana.');
    expect(title()).toBe('5. Skills');
  });
});
