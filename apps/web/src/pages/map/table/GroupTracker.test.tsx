import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MemberVitals, Spotlight } from '../../../data/groupTokens';
import { axeViolations } from '../../../test/axe';
import { aGroup } from '../../../test/groupFixtures';
import { GroupStrip } from './GroupStrip';
import { GroupTracker, type GroupTrackerProps } from './GroupTracker';

const vanguard = aGroup({
  id: 'g1',
  name: 'Vanguard',
  color: '#8E2A22',
  mapId: 'vault',
  mapName: 'The drowned vault',
  regionName: 'Vault gates',
  characterIds: ['c1', 'c2'],
});
const rearguard = aGroup({
  id: 'g2',
  name: 'Rearguard',
  color: '#3D6A5D',
  mapId: 'port',
  mapName: 'Port Vellum',
  characterIds: ['c3'],
});
const vitals: MemberVitals[] = [
  { characterId: 'c1', name: 'Brannoc', className: 'Fighter', hp: { current: 39, max: 50 } },
  { characterId: 'c2', name: 'Sera', className: 'Rogue', hp: { current: 5, max: 12 } },
  { characterId: 'c3', name: 'Tolin', className: 'Cleric', hp: { current: 0, max: 10 } },
];

function show(over: Partial<GroupTrackerProps> = {}) {
  const props: GroupTrackerProps = {
    groups: [vanguard, rearguard],
    vitals,
    mapId: 'port',
    regions: [
      { id: 'r1', name: 'Harbour' },
      { id: 'r2', name: 'Market' },
    ],
    selectedGroupId: null,
    spotlight: null,
    sharePositions: false,
    busy: false,
    onSelect: vi.fn(),
    onJump: vi.fn(),
    onBringHere: vi.fn(),
    onMoveToRegion: vi.fn(),
    onSpotlight: vi.fn(),
    onNewGroup: vi.fn(),
    onShare: vi.fn(),
    ...over,
  };
  return { props, ...render(<GroupTracker {...props} />) };
}

describe('the split-party tracker', () => {
  it('lists each group with where it is and who is in it', () => {
    show();
    expect(screen.getByRole('button', { name: 'Vanguard' })).toBeInTheDocument();
    expect(screen.getByText('The drowned vault · Vault gates')).toBeInTheDocument();
    expect(screen.getByText('Port Vellum')).toBeInTheDocument();
    const members = within(screen.getByRole('list', { name: 'Vanguard members' }));
    expect(members.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      expect.stringContaining('Brannoc Fighter'),
      expect.stringContaining('Sera Rogue'),
    ]);
  });

  it('shows hit points as bars that also say the state in words', () => {
    show();
    expect(screen.getByRole('meter', { name: 'Brannoc hit points' })).toHaveAttribute(
      'aria-valuetext',
      '39 of 50, Healthy',
    );
    expect(screen.getByRole('meter', { name: 'Sera hit points' })).toHaveAttribute(
      'aria-valuetext',
      '5 of 12, Wounded',
    );
    expect(screen.getByRole('meter', { name: 'Tolin hit points' })).toHaveAttribute('aria-valuetext', '0 of 10, Down');
    expect(screen.getByText('39/50')).toBeInTheDocument();
  });

  it('jumps to the map of a group that is elsewhere, and says "Viewing now" for one that is here', async () => {
    const { props } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Jump to the map of Vanguard' }));
    expect(props.onJump).toHaveBeenCalledWith('vault');
    const here = screen.getByRole('button', { name: 'Rearguard is on this map' });
    expect(here).toBeDisabled();
    expect(here).toHaveTextContent('Viewing now');
  });

  it('cannot jump to a group that is on no map', () => {
    show({ groups: [aGroup({ id: 'g9', name: 'Lost', characterIds: [] })] });
    expect(screen.getByRole('button', { name: 'Jump to the map of Lost' })).toBeDisabled();
    expect(screen.getByText('Not on any map')).toBeInTheDocument();
  });

  it('brings a group from another map to this one', async () => {
    const { props } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Bring Vanguard here' }));
    expect(props.onBringHere).toHaveBeenCalledWith(vanguard);
    expect(screen.queryByRole('button', { name: 'Bring Rearguard here' })).not.toBeInTheDocument();
  });

  it('moves a group to a region from its menu, the keyboard way', async () => {
    const { props } = show();
    await userEvent.selectOptions(screen.getByLabelText('Move Rearguard to a region'), 'Market');
    expect(props.onMoveToRegion).toHaveBeenCalledWith(rearguard, 'r2');
  });

  it('offers no region menu on a map with no regions', () => {
    show({ regions: [] });
    expect(screen.queryByLabelText('Move Rearguard to a region')).not.toBeInTheDocument();
  });

  it('makes a new group', async () => {
    const { props } = show();
    await userEvent.click(screen.getByRole('button', { name: '+ New group' }));
    expect(props.onNewGroup).toHaveBeenCalledOnce();
  });

  it('selects a group when its name is pressed', async () => {
    const { props } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Rearguard' }));
    expect(props.onSelect).toHaveBeenCalledWith('g2');
  });

  it('gives a group the spotlight, and takes it away', async () => {
    const { props } = show();
    await userEvent.click(screen.getAllByRole('button', { name: 'Spotlight' })[0]);
    expect(props.onSpotlight).toHaveBeenCalledWith('g1', '');
  });

  it('lets the DM write a line for the spotlighted group', async () => {
    const spotlight: Spotlight = {
      groupId: 'g1',
      groupName: 'Vanguard',
      place: 'Vault gates',
      summary: '',
      mine: false,
    };
    const { props } = show({ spotlight });
    expect(screen.getByRole('button', { name: 'Stop the spotlight' })).toHaveAttribute('aria-pressed', 'true');
    const form = screen.getByRole('form', { name: 'Spotlight for Vanguard' });
    await userEvent.type(within(form).getByLabelText('A line for the other groups'), 'Picking the lock');
    await userEvent.click(within(form).getByRole('button', { name: 'Save line' }));
    expect(props.onSpotlight).toHaveBeenCalledWith('g1', 'Picking the lock');
    await userEvent.click(within(form).getByRole('button', { name: 'End the spotlight' }));
    expect(props.onSpotlight).toHaveBeenLastCalledWith(null, '');
  });

  it('switches whether players see the other groups, and says what each setting does', async () => {
    const { props, rerender } = show();
    expect(screen.getByText('Each player sees only their own group.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Players see where other groups are/ }));
    expect(props.onShare).toHaveBeenCalledWith(true);
    rerender(<GroupTracker {...props} sharePositions />);
    expect(screen.getByText(/never their hit points/)).toBeInTheDocument();
  });

  it('says so when there are no groups yet', () => {
    show({ groups: [] });
    expect(screen.getByText(/No groups yet/)).toBeInTheDocument();
  });

  it('has no accessibility problems', async () => {
    const { container } = show();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('the strip under the map', () => {
  it('shows a card for each group, with its members and the way to its map', async () => {
    const onJump = vi.fn();
    render(<GroupStrip groups={[vanguard, rearguard]} vitals={vitals} mapId="port" onJump={onJump} />);
    const strip = within(screen.getByRole('list', { name: 'Where the groups are' }));
    expect(strip.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/Brannoc, Sera/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Jump to Vanguard (strip)' }));
    expect(onJump).toHaveBeenCalledWith('vault');
    expect(screen.getByRole('button', { name: 'Rearguard is on this map' })).toBeDisabled();
  });

  it('shows nothing with no groups', () => {
    const { container } = render(<GroupStrip groups={[]} vitals={[]} mapId="port" onJump={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
