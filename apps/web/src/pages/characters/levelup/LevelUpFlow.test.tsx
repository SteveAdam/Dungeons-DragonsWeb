import {
  buildCharacter,
  type CharacterSheet,
  type CreationChoices,
  type LevelUpClass,
} from '@dnd-manager/rules-engine';
import { SRD_ARMOR, SRD_BACKGROUNDS, SRD_CLASSES, SRD_SPECIES, SRD_SPELLS, SRD_WEAPONS } from '@dnd-manager/srd-data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../data/levelup';
import type { HitDieRoll } from '../../../data/levelup';
import { axeViolations } from '../../../test/axe';
import { LevelUpFlow } from './LevelUpFlow';

vi.mock('../../../data/levelup', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/levelup')>()),
  rollHitDie: vi.fn(),
  applyLevelUp: vi.fn(),
}));

const srd = {
  species: SRD_SPECIES,
  classes: SRD_CLASSES,
  backgrounds: SRD_BACKGROUNDS,
  spells: SRD_SPELLS,
  weapons: SRD_WEAPONS,
  armor: SRD_ARMOR,
};
const noDetails = { personalityTraits: '', ideals: '', bonds: '', flaws: '', appearance: '', backstory: '' };
const fighterChoices: CreationChoices = {
  name: 'Aldric',
  species: 'dwarf',
  class: 'fighter',
  background: 'soldier',
  abilities: { method: 'standard', base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } },
  backgroundBonus: { plus2: 'str', plus1: 'con' },
  skills: ['perception', 'survival'],
  equipment: { class: 'A', background: 'A' },
  spells: { cantrips: [], prepared: [], spellbook: [] },
  alignment: '',
  details: noDetails,
};
const fighter = (over: Partial<CharacterSheet> = {}): CharacterSheet => ({
  ...buildCharacter(fighterChoices, srd).sheet,
  xp: 900,
  ...over,
});
const wizard = (): CharacterSheet => ({
  ...buildCharacter(
    {
      ...fighterChoices,
      name: 'Sera',
      species: 'elf',
      class: 'wizard',
      background: 'sage',
      abilities: { method: 'standard', base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 } },
      backgroundBonus: { plus2: 'int', plus1: 'con' },
      skills: ['investigation', 'medicine'],
      spells: {
        cantrips: ['Fire Bolt', 'Light', 'Mage Hand'],
        spellbook: ['Detect Magic', 'Feather Fall', 'Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
        prepared: ['Mage Armor', 'Magic Missile', 'Sleep', 'Thunderwave'],
      },
    },
    srd,
  ).sheet,
  xp: 900,
});
const cls = (name: string) => SRD_CLASSES.find(c => c.name === name)! as LevelUpClass;

function show(sheet: CharacterSheet, { roll = null as HitDieRoll | null, onApplied = vi.fn() } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <LevelUpFlow
        characterId="ch1"
        sheet={sheet}
        cls={cls(sheet.className)}
        spells={SRD_SPELLS}
        optionalFeats={false}
        existingRoll={roll}
        onApplied={onApplied}
      />
    </QueryClientProvider>,
  );
  return { ...view, onApplied };
}

const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Next' }));
const title = () => screen.getByRole('heading', { level: 2 }).textContent;

beforeEach(() => vi.clearAllMocks());

describe('the level-up flow (P2-10)', () => {
  it('takes a Fighter from 1 to 2 with the average: every step, then the computed review, then apply', async () => {
    vi.mocked(api.applyLevelUp).mockResolvedValue({ level: 2, hitPoints: 20, hitPointsGained: 8, proficiencyBonus: 2 });
    const user = userEvent.setup();
    const { container, onApplied } = show(fighter());
    expect(title()).toBe('Level 2: Hit points');
    expect(screen.getByRole('radio', { name: 'Take the average: 6 +2 = 8' })).toBeChecked();
    await next(user);
    expect(title()).toBe('Level 2: New features');
    expect(screen.getByText('Action Surge')).toBeInTheDocument();
    expect(screen.getByText('Tactical Mind')).toBeInTheDocument();
    await next(user);
    expect(screen.getByText('Level 2 gives no Ability Score Improvement.')).toBeInTheDocument();
    await next(user);
    expect(screen.getByText('No new spells at level 2.')).toBeInTheDocument();
    await next(user);
    const review = screen.getByRole('region', { name: 'After this level' });
    expect(within(review).getByText('Hit points').nextSibling).toHaveTextContent('20 (+8)');
    expect(within(review).getByText('Hit Point Dice').nextSibling).toHaveTextContent('2d10');
    expect(await axeViolations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Apply level 2' }));
    expect(api.applyLevelUp).toHaveBeenCalledWith('ch1', {
      toLevel: 2,
      hitPoints: { method: 'average' },
      spells: { cantrips: [], prepared: [], spellbook: [] },
    });
    expect(onApplied).toHaveBeenCalled();
  });

  it('rolls the Hit Point Die on the server, and then the roll is the gain', async () => {
    vi.mocked(api.rollHitDie).mockResolvedValue({ id: 'r1', die: 7 });
    const user = userEvent.setup();
    show(fighter());
    await user.click(screen.getByRole('radio', { name: 'Roll the die' }));
    await user.click(screen.getByRole('button', { name: 'Roll the d10' }));
    expect(api.rollHitDie).toHaveBeenCalledWith('ch1');
    expect(await screen.findByText(/You rolled 7 on the d10: 7 \+2 = 9 hit points\./)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Take the average/ })).toBeDisabled();
  });

  it('comes back to a roll made before a refresh', () => {
    show(fighter(), { roll: { id: 'r1', die: 3 } });
    expect(screen.getByRole('radio', { name: 'Roll the die' })).toBeChecked();
    expect(screen.getByText(/You rolled 3 on the d10/)).toBeInTheDocument();
  });

  it('at level 3 the subclass must be chosen before going on', async () => {
    const user = userEvent.setup();
    show(fighter({ levelApplied: 2, hp: { max: 20, current: 20, temp: 0 } }));
    await next(user);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Level 3: New features');
    await next(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose your Fighter subclass.');
    await user.click(screen.getByRole('radio', { name: 'Champion' }));
    expect(screen.getByText('Improved Critical')).toBeInTheDocument();
    await next(user);
    expect(title()).toBe('Level 3: Ability scores');
  });

  it('a Wizard adds two spellbook spells and prepares one of them', async () => {
    const user = userEvent.setup();
    show(wizard());
    await next(user);
    await next(user);
    await next(user);
    expect(title()).toBe('Level 2: Spells');
    const book = screen.getByRole('group', { name: /Add to your spellbook/ });
    expect(within(book).queryByRole('checkbox', { name: 'Sleep (level 1)' })).toBeNull();
    await user.click(within(book).getByRole('checkbox', { name: 'Shield (level 1)' }));
    await user.click(within(book).getByRole('checkbox', { name: 'Grease (level 1)' }));
    await next(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose 1 new prepared spell.');
    await user.click(
      within(screen.getByRole('group', { name: /Prepare from your spellbook/ })).getByRole('checkbox', {
        name: 'Shield (level 1)',
      }),
    );
    await next(user);
    expect(screen.getByRole('region', { name: 'After this level' })).toHaveTextContent('Spell slots 3 of level 1');
  });

  it('says when a level is not in the app yet, and offers no way to apply it', () => {
    show(fighter({ levelApplied: 3, xp: 2700, subclass: 'champion' }));
    expect(screen.getByRole('status')).toHaveTextContent('Content for this level is not available yet.');
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
  });

  it('shows the server’s refusal on the step it belongs to', async () => {
    vi.mocked(api.applyLevelUp).mockRejectedValue(
      new api.LevelUpRejected('These choices cannot be applied', [
        { step: 'features', message: 'Level 2 gives no subclass choice.' },
      ]),
    );
    const user = userEvent.setup();
    show(fighter());
    for (let i = 0; i < 4; i++) await next(user);
    await user.click(screen.getByRole('button', { name: 'Apply level 2' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Level 2 gives no subclass choice.');
    expect(title()).toBe('Level 2: New features');
  });
});
