import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmModeIndicator } from '../../components/DmModeIndicator';
import * as campaignsApi from '../../data/campaigns';
import { DataError } from '../../data/errors';
import type { CampaignMap } from '../../data/maps';
import * as mapsApi from '../../data/maps';
import * as membersApi from '../../data/members';
import * as notesApi from '../../data/pinSecrets';
import type { Pin } from '../../data/pins';
import * as pinsApi from '../../data/pins';
import { useDmModeStore } from '../../state/dmModeStore';
import type { MapCanvasProps } from './MapCanvas';
import { MapViewPage } from './MapViewPage';

// Leaflet needs a real layout engine, so the canvas is replaced by buttons: one per pin it was given,
// and one that "clicks the map" at (120, 80).
vi.mock('./MapCanvas', () => ({
  MapCanvas: ({ pins, onSelectPin, addMode, onPlace, imageUrl }: MapCanvasProps) => (
    <div data-testid="map" data-image={imageUrl} data-adding={String(addMode)}>
      {pins.map(p => (
        <button key={p.id} onClick={() => onSelectPin(p.id)}>{`pin: ${p.title}`}</button>
      ))}
      <button onClick={() => onPlace({ x: 120, y: 80 })}>map click</button>
    </div>
  ),
}));
vi.mock('../../lib/storage', () => ({ mapImageStore: { getUrl: vi.fn(async () => 'blob:the-map') } }));
// keep the real validation; mock only the calls that reach the server
vi.mock('../../data/pins', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/pins')>()),
  listPins: vi.fn(),
  createPin: vi.fn(),
  updatePin: vi.fn(),
  deletePin: vi.fn(),
}));
vi.mock('../../data/pinSecrets');
vi.mock('../../data/maps');
vi.mock('../../data/campaigns');
vi.mock('../../data/members');

const map: CampaignMap = {
  id: 'm1',
  campaignId: 'c1',
  name: 'Port Vellum',
  imagePath: 'c1/port.png',
  width: 2000,
  height: 1500,
  visibleToPlayers: true,
  fogMode: 'shared',
  parentPinId: null,
  createdAt: '',
};
const pin = (over: Partial<Pin>): Pin => ({
  id: 'p',
  mapId: 'm1',
  type: 'location',
  title: 'Pin',
  x: 10,
  y: 10,
  color: '#8E2A22',
  size: 32,
  visibleToPlayers: true,
  description: '',
  history: '',
  traits: [],
  tags: [],
  musicUrl: null,
  ...over,
});
const tavern = pin({ id: 'p1', title: 'The Drowned Rat', description: 'A harbour tavern', tags: ['inn'] });
const lair = pin({ id: 'p2', title: 'Smugglers’ cave', visibleToPlayers: false, type: 'faction' });

function signInAs(role: 'dm' | 'player') {
  vi.mocked(membersApi.getMyRole).mockResolvedValue(role);
  vi.mocked(campaignsApi.getCampaign).mockResolvedValue({
    id: 'c1',
    name: 'The Sunken Crown',
    rulesEdition: '2024',
    nextSessionAt: null,
    createdAt: '',
  });
  vi.mocked(mapsApi.getMap).mockResolvedValue(map);
  // what the database would return: hidden pins only for a DM who asks for them
  vi.mocked(pinsApi.listPins).mockImplementation(async (_id, { includeHidden }) =>
    role === 'dm' && includeHidden ? [tavern, lair] : [tavern],
  );
  vi.mocked(notesApi.getPinNotes).mockResolvedValue('The cave floods at high tide');
}

function renderMap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/campaigns/c1/maps/m1']}>
        <DmModeIndicator />
        <Routes>
          <Route path="/campaigns/:campaignId/maps/:mapId" element={<MapViewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useDmModeStore.setState({ dmMode: true });
});

describe('map view as a player (acceptance 2)', () => {
  it('shows the map and the visible pin only, and never asks for hidden data or DM notes', async () => {
    signInAs('player');
    const user = userEvent.setup();
    renderMap();

    expect(await screen.findByRole('button', { name: 'pin: The Drowned Rat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Smugglers/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-image', 'blob:the-map');
    expect(mapsApi.getMap).toHaveBeenCalledWith('m1', { includeHidden: false });
    expect(pinsApi.listPins).toHaveBeenCalledWith('m1', { includeHidden: false });
    expect(pinsApi.listPins).not.toHaveBeenCalledWith('m1', { includeHidden: true });

    await user.click(screen.getByRole('button', { name: 'pin: The Drowned Rat' }));
    const panel = screen.getByRole('complementary', { name: 'Pin: The Drowned Rat' });
    expect(within(panel).getByText('A harbour tavern')).toBeInTheDocument();
    expect(within(panel).getByText('inn')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Save pin/ })).not.toBeInTheDocument();
    expect(within(panel).queryByText(/DM notes/)).not.toBeInTheDocument();
    expect(notesApi.getPinNotes).not.toHaveBeenCalled();
  });

  it('has no DM tools, no DM switch and no DM badge', async () => {
    signInAs('player');
    renderMap();
    await screen.findByTestId('map');
    expect(screen.queryByRole('toolbar', { name: 'Map tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /DM mode/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'DM mode is on' })).not.toBeInTheDocument();
  });

  it('is told plainly when the map is hidden or gone', async () => {
    signInAs('player');
    vi.mocked(mapsApi.getMap).mockRejectedValue(new DataError('not-found', 'We could not find that map.'));
    renderMap();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not find that map.');
    expect(screen.getByRole('link', { name: 'The Sunken Crown' })).toHaveAttribute('href', '/campaigns/c1/maps');
  });
});

describe('map view as a DM (acceptance 1)', () => {
  it('shows hidden pins, the DM badge, and a breadcrumb back to the campaign', async () => {
    signInAs('dm');
    renderMap();
    expect(await screen.findByRole('button', { name: 'pin: Smugglers’ cave' })).toBeInTheDocument();
    expect(screen.getByRole('note', { name: 'DM mode is on' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'The Sunken Crown' })).toBeInTheDocument();
    expect(within(crumbs).getByText('Port Vellum')).toHaveAttribute('aria-current', 'page');
  });

  it('places a new pin by clicking "Add pin" then the map, and opens it', async () => {
    signInAs('dm');
    const created = pin({ id: 'p3', title: 'New pin', visibleToPlayers: false, x: 120, y: 80 });
    vi.mocked(pinsApi.createPin).mockResolvedValue(created);
    const user = userEvent.setup();
    renderMap();
    await screen.findByTestId('map');

    await user.click(screen.getByRole('button', { name: 'Add pin' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-adding', 'true');
    vi.mocked(pinsApi.listPins).mockResolvedValue([tavern, lair, created]);
    await user.click(screen.getByRole('button', { name: 'map click' }));

    expect(pinsApi.createPin).toHaveBeenCalledWith('m1', { x: 120, y: 80 }, undefined);
    expect(await screen.findByRole('complementary', { name: 'Pin: New pin' })).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-adding', 'false');
  });

  it('edits the fields and the DM notes, saving notes only through pin_secrets', async () => {
    signInAs('dm');
    vi.mocked(pinsApi.updatePin).mockImplementation(async (_id, changes) => ({ ...lair, ...changes }) as Pin);
    vi.mocked(notesApi.savePinNotes).mockImplementation(async (_id, notes) => notes);
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: Smugglers’ cave' }));

    const panel = screen.getByRole('complementary', { name: 'Pin: Smugglers’ cave' });
    const notes = await within(panel).findByRole('textbox', { name: /DM notes/ });
    await waitFor(() => expect(notes).toHaveValue('The cave floods at high tide'));
    expect(notesApi.getPinNotes).toHaveBeenCalledWith('p2');

    await user.clear(within(panel).getByRole('textbox', { name: 'Title' }));
    await user.type(within(panel).getByRole('textbox', { name: 'Title' }), 'Smugglers’ grotto');
    await user.type(within(panel).getByRole('textbox', { name: /Tags/ }), 'secret, coast');
    await user.click(within(panel).getByRole('switch', { name: /Visible to players/ }));
    await user.type(notes, ' — guarded by Maren');
    await user.click(within(panel).getByRole('button', { name: 'Save pin' }));

    await waitFor(() => expect(pinsApi.updatePin).toHaveBeenCalled());
    const [pinId, changes] = vi.mocked(pinsApi.updatePin).mock.calls[0];
    expect(pinId).toBe('p2');
    expect(changes).toMatchObject({ title: 'Smugglers’ grotto', tags: ['secret', 'coast'], visibleToPlayers: true });
    expect(changes).not.toHaveProperty('dmNotes');
    expect(notesApi.savePinNotes).toHaveBeenCalledWith('p2', 'The cave floods at high tide — guarded by Maren');
    expect(await within(panel).findByRole('status')).toHaveTextContent('Saved');
  });

  it('refuses a bad colour or a plain http music link before saving', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: The Drowned Rat' }));
    const panel = screen.getByRole('complementary', { name: /The Drowned Rat/ });

    const colour = within(panel).getByRole('textbox', { name: 'Colour' });
    await user.clear(colour);
    await user.type(colour, 'crimson');
    await user.click(within(panel).getByRole('button', { name: 'Save pin' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('six hex digits');

    await user.clear(colour);
    await user.type(colour, '#8E2A22');
    await user.type(within(panel).getByRole('textbox', { name: /Music link/ }), 'http://bard.example/song.mp3');
    await user.click(within(panel).getByRole('button', { name: 'Save pin' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('https://');
    expect(pinsApi.updatePin).not.toHaveBeenCalled();
  });

  it('deletes a pin only after confirming', async () => {
    signInAs('dm');
    vi.mocked(pinsApi.deletePin).mockResolvedValue();
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: Smugglers’ cave' }));
    const panel = screen.getByRole('complementary', { name: /Smugglers/ });

    await user.click(within(panel).getByRole('button', { name: 'Delete pin' }));
    expect(pinsApi.deletePin).not.toHaveBeenCalled();
    await user.click(within(panel).getByRole('button', { name: 'Keep' }));
    await user.click(within(panel).getByRole('button', { name: 'Delete pin' }));
    vi.mocked(pinsApi.listPins).mockResolvedValue([tavern]);
    await user.click(within(panel).getByRole('button', { name: 'Yes, delete' }));

    expect(pinsApi.deletePin).toHaveBeenCalledWith('p2');
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  });
});

describe('DM previewing as a player (acceptance 3)', () => {
  it('turning DM mode off makes the same requests a player makes: no hidden pins, no notes', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderMap();
    await screen.findByRole('button', { name: 'pin: Smugglers’ cave' });

    await user.click(screen.getByRole('switch', { name: /DM mode/ }));

    await waitFor(() => expect(screen.queryByRole('button', { name: /Smugglers/ })).not.toBeInTheDocument());
    expect(pinsApi.listPins).toHaveBeenLastCalledWith('m1', { includeHidden: false });
    expect(mapsApi.getMap).toHaveBeenLastCalledWith('m1', { includeHidden: false });
    expect(screen.queryByRole('toolbar', { name: 'Map tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('note', { name: 'DM mode is on' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pin: The Drowned Rat' }));
    expect(screen.queryByRole('textbox', { name: /DM notes/ })).not.toBeInTheDocument();
    expect(notesApi.getPinNotes).not.toHaveBeenCalled();
  });

  it('closes a hidden pin’s panel when DM mode goes off', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: Smugglers’ cave' }));
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /DM mode/ }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
  });
});
