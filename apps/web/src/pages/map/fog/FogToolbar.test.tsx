import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../../../test/axe';
import { strokePath } from './fogPath';
import { FogToolbar, type FogToolbarProps } from './FogToolbar';

function show(over: Partial<FogToolbarProps> = {}) {
  const props: FogToolbarProps = {
    enabled: true,
    perGroup: false,
    brush: null,
    radius: 60,
    strokeCount: 3,
    canUndo: true,
    groups: [],
    groupId: null,
    busy: false,
    onBrush: vi.fn(),
    onRadius: vi.fn(),
    onRevealAll: vi.fn(),
    onHideAll: vi.fn(),
    onUndo: vi.fn(),
    onSimplify: vi.fn(),
    onGroup: vi.fn(),
    onTurnOn: vi.fn(),
    ...over,
  };
  return { props, ...render(<FogToolbar {...props} />) };
}

describe('the fog tools', () => {
  it('says the fog is cosmetic', () => {
    show();
    expect(screen.getByText(/Fog is cosmetic/)).toHaveTextContent('could still open the map image itself');
  });

  it('picks up and puts down the reveal and hide brushes', async () => {
    const { props, rerender } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Reveal brush' }));
    expect(props.onBrush).toHaveBeenCalledWith('reveal');
    rerender(<FogToolbar {...props} brush="reveal" />);
    expect(screen.getByRole('button', { name: 'Reveal brush' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Reveal brush' }));
    expect(props.onBrush).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole('button', { name: 'Hide brush' }));
    expect(props.onBrush).toHaveBeenLastCalledWith('hide');
  });

  it('sizes the brush in map pixels', () => {
    const { props } = show();
    const slider = screen.getByLabelText('Size 60');
    expect(slider).toHaveAttribute('aria-valuetext', '60 pixels on the map');
    // a range input takes a value change rather than typing
    slider.setAttribute('value', '120');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(props.onRadius).toBeDefined();
  });

  it('reveals or hides everything, and undoes', async () => {
    const { props } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Reveal all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hide all' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(props.onRevealAll).toHaveBeenCalledOnce();
    expect(props.onHideAll).toHaveBeenCalledOnce();
    expect(props.onUndo).toHaveBeenCalledOnce();
  });

  it('cannot undo with nothing to undo', () => {
    show({ canUndo: false });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('lists the keyboard shortcuts, and marks them on the controls', () => {
    show();
    expect(screen.getByText(/R reveal brush, H hide brush, \[ and \] brush size, Ctrl\+Z undo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide brush' })).toHaveAttribute('aria-keyshortcuts', 'H');
  });

  it('offers to simplify only a fog of more than 2,000 strokes', async () => {
    const { props, rerender } = show({ strokeCount: 2000 });
    expect(screen.queryByRole('button', { name: /Simplify fog/ })).not.toBeInTheDocument();
    rerender(<FogToolbar {...props} strokeCount={2001} />);
    await userEvent.click(screen.getByRole('button', { name: 'Simplify fog (2001 strokes)' }));
    expect(props.onSimplify).toHaveBeenCalledOnce();
  });

  it('in per-group mode, chooses whose fog is drawn', async () => {
    const { props } = show({
      perGroup: true,
      groups: [
        { id: 'g1', name: 'Vanguard' },
        { id: 'g2', name: 'Rearguard' },
      ],
      groupId: 'g1',
    });
    await userEvent.selectOptions(screen.getByLabelText('Drawing the fog of'), 'Rearguard');
    expect(props.onGroup).toHaveBeenCalledWith('g2');
  });

  it('in per-group mode with no groups, explains why the brushes are off', () => {
    show({ perGroup: true, groups: [], groupId: null });
    expect(screen.getByRole('button', { name: 'Reveal brush' })).toBeDisabled();
    expect(screen.getByText(/Make a party group first/)).toBeInTheDocument();
  });

  it('when fog is off, offers to turn it on and says what that does', async () => {
    const { props } = show({ enabled: false });
    expect(screen.getByText(/players see all of it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal brush' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Turn on fog/ }));
    expect(props.onTurnOn).toHaveBeenCalledOnce();
    expect(screen.getByText(/Fog is cosmetic/)).toBeInTheDocument();
  });

  it('has no accessibility problems', async () => {
    const { container } = show({ perGroup: true, groups: [{ id: 'g1', name: 'Vanguard' }], groupId: 'g1' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('strokePath', () => {
  it('draws a line through the points', () => {
    expect(
      strokePath([
        [1, 2],
        [3, 4],
        [5, 6],
      ]),
    ).toBe('M1 2L3 4L5 6');
  });

  it('draws a lone point as a dot (a line of no length with round caps)', () => {
    expect(strokePath([[7, 8]])).toBe('M7 8L7 8');
    expect(strokePath([])).toBe('');
  });
});
