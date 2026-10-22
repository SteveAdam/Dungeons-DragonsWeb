import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataError } from '../../data/errors';
import type { RollRow } from '../../data/rolls';
import { axeViolations } from '../../test/axe';
import { OddsPopup, type OddsCheck, type OddsPopupProps } from './OddsPopup';

const perception: OddsCheck = {
  label: 'Search the undergrowth',
  kind: 'check',
  skill: 'Perception',
  bonus: 3,
  bonusBreakdown: [
    { label: 'Wisdom', value: 0 },
    { label: 'Proficiency', value: 3 },
  ],
  target: 14,
};
const bless = { count: 1, sides: 4, sign: 1 as const, label: 'Bless' };

const rollRow = (over: Partial<RollRow>): RollRow => ({
  id: 'r1',
  campaignId: 'c1',
  characterId: null,
  rolledBy: 'u1',
  kind: 'check',
  label: 'Search the undergrowth',
  bonus: 3,
  bonusBreakdown: null,
  target: 14,
  mode: 'normal',
  dice: [12],
  kept: 12,
  total: 15,
  success: true,
  crit: false,
  fumble: false,
  hidden: false,
  createdAt: '',
  ...over,
});

function show(check: OddsCheck, onRoll: OddsPopupProps['onRoll'] = vi.fn(), onClose = vi.fn()) {
  render(<OddsPopup open check={check} onRoll={onRoll} onClose={onClose} />);
  return { dialog: screen.getByRole('dialog', { name: check.label }), onRoll, onClose };
}

describe('the odds (acceptance 1)', () => {
  it('a +3 check against DC 14 is 50%', () => {
    const { dialog } = show(perception);
    expect(within(dialog).getByText('50%')).toBeInTheDocument();
    expect(within(dialog).getByText('chance to succeed')).toBeInTheDocument();
    expect(within(dialog).getByText('Perception check, DC 14, your bonus +3')).toBeInTheDocument();
    expect(within(dialog).getByText('Wisdom +0 · Proficiency +3')).toBeInTheDocument();
    expect(within(dialog).getByText('Roll one d20.')).toBeInTheDocument();
  });

  it('with an advantage reason it is 75%, says 50% without, and lists the reason', () => {
    const { dialog } = show({ ...perception, advantage: ['you watch from high ground'] });
    expect(within(dialog).getByText('75%')).toBeInTheDocument();
    expect(within(dialog).getByText('50% without advantage')).toBeInTheDocument();
    expect(within(dialog).getByText('Advantage: you watch from high ground')).toBeInTheDocument();
    expect(within(dialog).getByText('Roll two d20 and keep the higher.')).toBeInTheDocument();
  });

  it('advantage and disadvantage cancel to 50%, and both reasons are shown cancelled', () => {
    const { dialog } = show({ ...perception, advantage: ['high ground'], disadvantage: ['Poisoned'] });
    expect(within(dialog).getByText('50%')).toBeInTheDocument();
    const reasons = within(dialog).getByRole('list', { name: 'Advantage and disadvantage' });
    const items = within(reasons).getAllByRole('listitem');
    expect(items.map(li => li.textContent)).toEqual([
      'Advantage: high ground cancelled',
      'Disadvantage: Poisoned cancelled',
    ]);
    expect(reasons.querySelectorAll('s')).toHaveLength(2);
    expect(within(dialog).queryByText(/without/)).not.toBeInTheDocument();
  });

  it('attacks show the critical hit chance and use AC', () => {
    const { dialog } = show({ label: 'Longsword', kind: 'attack', bonus: 5, target: 13, advantage: ['hidden'] });
    expect(within(dialog).getByText('attack, AC 13, your bonus +5')).toBeInTheDocument();
    expect(within(dialog).getByText('Critical hit chance: 10%')).toBeInTheDocument();
  });

  it('bonus dice count, and each says what it adds', () => {
    const { dialog } = show({ ...perception, bonusDice: [bless] });
    expect(within(dialog).getByText('63%')).toBeInTheDocument(); // 62.5%
    expect(within(dialog).getByText('Bless (+1d4): about +12 points')).toBeInTheDocument();
  });
});

describe('rolling', () => {
  it('rolls with the resolved mode and shows the dice, the total and the result, announced politely', async () => {
    const onRoll = vi.fn(async () => rollRow({ mode: 'advantage', dice: [6, 17], kept: 17, total: 20 }));
    const { dialog } = show({ ...perception, advantage: ['high ground'] }, onRoll);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll' }));
    expect(onRoll).toHaveBeenCalledWith('advantage');
    const status = await within(dialog).findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Total 20 (17 + 3) against DC 14'));
    expect(status).toHaveTextContent('Success');
    expect(status).toHaveAttribute('aria-live', 'polite');
    // the kept die is bright, the other faded
    const dice = dialog.querySelectorAll('[aria-hidden="true"] span');
    expect([...dice].map(d => d.textContent)).toEqual(['6', '17']);
    expect(dice[0].className).toMatch(/faded/);
    expect(dice[1].className).not.toMatch(/faded/);
    expect(within(dialog).getByRole('button', { name: 'Roll again' })).toBeEnabled();
  });

  it('names a failure, a critical hit and a natural 1', async () => {
    const results = [
      rollRow({ dice: [4], kept: 4, total: 7, success: false }),
      rollRow({ kind: 'attack', dice: [20], kept: 20, total: 25, success: true, crit: true }),
      rollRow({ kind: 'attack', dice: [1], kept: 1, total: 6, success: false, fumble: true }),
    ];
    const onRoll = vi.fn(async () => results.shift()!);
    const { dialog } = show({ label: 'Strike', kind: 'attack', bonus: 5, target: 13 }, onRoll);
    const status = within(dialog).getByRole('status');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll' }));
    await waitFor(() => expect(status).toHaveTextContent('Failure'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll again' }));
    await waitFor(() => expect(status).toHaveTextContent('Critical hit'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll again' }));
    await waitFor(() => expect(status).toHaveTextContent('Natural 1: a miss'));
  });

  it('says when an unrolled bonus die decides the result', async () => {
    const onRoll = vi.fn(async () => rollRow({ dice: [9], kept: 9, total: 12, success: false }));
    const { dialog } = show({ ...perception, bonusDice: [bless] }, onRoll);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('status')).toHaveTextContent('Roll Bless +1d4 and add it: that decides it'),
    );
  });

  it('a failed roll shows a plain message and the button comes back', async () => {
    const onRoll = vi.fn(async () => {
      throw new DataError('rate-limited');
    });
    const { dialog } = show(perception, onRoll);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Too many rolls in the last minute');
    expect(within(dialog).getByRole('button', { name: 'Roll' })).toBeEnabled();
  });
});

describe('keyboard and accessibility (acceptance 4)', () => {
  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Check the odds</button>
        <OddsPopup open={open} check={perception} onClose={() => setOpen(false)} onRoll={vi.fn()} />
      </>
    );
  }

  it('focus goes to Roll, Tab stays inside, Escape closes and focus returns to the opener', async () => {
    const user = userEvent.setup();
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Check the odds' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Roll' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Close the odds' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Roll' })).toHaveFocus(); // wrapped around
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('clicking outside closes it; the close button too', async () => {
    const { onClose, dialog } = show(perception);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close the odds' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('passes an axe check, before and after rolling', async () => {
    const onRoll = vi.fn(async () => rollRow({ mode: 'advantage', dice: [6, 17], kept: 17, total: 20 }));
    const { dialog } = show(
      { ...perception, advantage: ['high ground'], disadvantage: ['Poisoned'], bonusDice: [bless] },
      onRoll,
    );
    expect(await axeViolations(dialog)).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Roll' }));
    await within(dialog).findByText(/Total 20/);
    expect(await axeViolations(dialog)).toEqual([]);
  });

  it('renders nothing while closed', () => {
    render(<OddsPopup open={false} check={perception} onClose={vi.fn()} onRoll={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
