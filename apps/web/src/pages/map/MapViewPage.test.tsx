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
import type { Region } from '../../data/regions';
import * as regionsApi from '../../data/regions';
import { useDmModeStore } from '../../state/dmModeStore';
import type { MapCanvasProps } from './MapCanvas';
import { MapViewPage } from './MapViewPage';

// Leaflet needs a real layout engine, so the canvas is replaced by buttons: one per pin it was given,
// and one that "clicks the map" at (120, 80).
vi.mock('./MapCanvas', () => ({
  MapCanvas: ({
    pins,
    onSelectPin,
    addMode,
    onPlace,
    imageUrl,
    canMovePins,
    onMovePin,
    subMapPinIds,
    onEnterSubMap,
    regions,
    onSelectRegion,
    drawMode,
    onDrawRegion,
    canEditRegions,
    onChangeRegion,
  }: MapCanvasProps) => (
    <div data-testid="map" data-image={imageUrl} data-adding={String(addMode)} data-drawing={String(drawMode)}>
      {regions.map(r => (
        <span key={r.id}>
          <button onClick={() => onSelectRegion(r.id)}>{`region: ${r.name}`}</button>
          {canEditRegions && (
            <button onClick={() => onChangeRegion(r.id, { cx: 500, cy: 400 })}>{`move region: ${r.name}`}</button>
          )}
        </span>
      ))}
      {drawMode && <button onClick={() => onDrawRegion({ cx: 600, cy: 500, radius: 150 })}>draw region</button>}
      {pins.map(p => (
        <span key={p.id}>
          <button data-pos={`${p.x},${p.y}`} onClick={() => onSelectPin(p.id)}>{`pin: ${p.title}`}</button>
          {canMovePins && <button onClick={() => onMovePin(p.id, { x: 300, y: 200 })}>{`move: ${p.title}`}</button>}
          {subMapPinIds.has(p.id) && <button onClick={() => onEnterSubMap(p.id)}>{`enter: ${p.title}`}</button>}
        </span>
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
vi.mock('../../data/regions', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/regions')>()),
  listRegions: vi.fn(),
  createRegion: vi.fn(),
  updateRegion: vi.fn(),
  deleteRegion: vi.fn(),
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
  vi.mocked(mapsApi.listSubMaps).mockResolvedValue(new Map());
  vi.mocked(mapsApi.getMapTrail).mockResolvedValue([]);
  vi.mocked(regionsApi.listRegions).mockImplementation(async (_id, { includeHidden }) =>
    role === 'dm' && includeHidden ? [sands, wraithwood] : [sands],
  );
}

const region = (over: Partial<Region>): Region => ({
  id: 'r',
  mapId: 'm1',
  name: 'Region',
  cx: 100,
  cy: 100,
  radius: 50,
  terrain: 'grassland',
  weather: 'clear',
  description: '',
  visibleToPlayers: true,
  ...over,
});
const sands = region({ id: 'r1', name: 'The Glass Sands', terrain: 'desert', weather: 'extreme_heat' });
const wraithwood = region({
  id: 'r2',
  name: 'Wraithwood',
  terrain: 'boreal_forest',
  weather: 'snow',
  visibleToPlayers: false,
});

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

describe('maps beneath pins', () => {
  const kingdom = {
    id: 'm-kingdom',
    name: 'The Kingdom',
    imagePath: 'c1/k.png',
    visibleToPlayers: true,
    createdAt: '',
    parentPinId: 'p1',
  };

  it('a pin with a map beneath shows an Enter link, and entering opens that map', async () => {
    signInAs('player');
    vi.mocked(mapsApi.listSubMaps).mockResolvedValue(new Map([['p1', kingdom]]));
    const user = userEvent.setup();
    renderMap();

    await user.click(await screen.findByRole('button', { name: 'pin: The Drowned Rat' }));
    const enter = await screen.findByRole('link', { name: 'Enter The Kingdom' });
    expect(enter).toHaveAttribute('href', '/campaigns/c1/maps/m-kingdom');
    expect(mapsApi.listSubMaps).toHaveBeenCalledWith(['p1'], { includeHidden: false });

    vi.mocked(mapsApi.getMap).mockResolvedValue({ ...map, id: 'm-kingdom', name: 'The Kingdom', parentPinId: 'p1' });
    vi.mocked(mapsApi.getMapTrail).mockResolvedValue([{ mapId: 'm1', name: 'Port Vellum' }]);
    await user.click(screen.getByRole('button', { name: 'enter: The Drowned Rat' })); // the double-click
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    await waitFor(() => expect(within(crumbs).getByText('The Kingdom')).toHaveAttribute('aria-current', 'page'));
    expect(within(crumbs).getByRole('link', { name: 'Port Vellum' })).toHaveAttribute('href', '/campaigns/c1/maps/m1');
    expect(mapsApi.getMap).toHaveBeenLastCalledWith('m-kingdom', { includeHidden: false });
  });

  it('a DM can add a map beneath a location pin, but not beneath other types', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderMap();

    await user.click(await screen.findByRole('button', { name: 'pin: The Drowned Rat' })); // location
    await user.click(await screen.findByRole('button', { name: 'Add a map beneath this pin' }));
    expect(screen.getByRole('form', { name: 'A map beneath The Drowned Rat' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pin: Smugglers’ cave' })); // faction
    await screen.findByRole('complementary', { name: /Smugglers/ });
    expect(screen.queryByRole('button', { name: 'Add a map beneath this pin' })).not.toBeInTheDocument();
  });

  it('the option follows the Type picked in the editor, before saving', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: The Drowned Rat' })); // location
    const panel = await screen.findByRole('complementary', { name: /The Drowned Rat/ });
    await within(panel).findByRole('button', { name: 'Add a map beneath this pin' });

    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Type' }), 'character');
    expect(within(panel).queryByRole('button', { name: 'Add a map beneath this pin' })).not.toBeInTheDocument();
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Type' }), 'location');
    expect(within(panel).getByRole('button', { name: 'Add a map beneath this pin' })).toBeInTheDocument();

    // the faction pin starts from its own saved type, not the one picked for the tavern
    await user.click(screen.getByRole('button', { name: 'pin: Smugglers’ cave' }));
    await screen.findByRole('complementary', { name: /Smugglers/ });
    expect(screen.queryByRole('button', { name: 'Add a map beneath this pin' })).not.toBeInTheDocument();
  });

  it('players never get the option', async () => {
    signInAs('player');
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: The Drowned Rat' }));
    expect(screen.queryByRole('button', { name: 'Add a map beneath this pin' })).not.toBeInTheDocument();
  });

  it('warns that the map beneath is kept when its pin is deleted', async () => {
    signInAs('dm');
    vi.mocked(mapsApi.listSubMaps).mockResolvedValue(new Map([['p1', kingdom]]));
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: The Drowned Rat' }));
    await screen.findByRole('link', { name: 'Enter The Kingdom' });
    await user.click(screen.getByRole('button', { name: 'Delete pin' }));
    expect(screen.getByText(/The Kingdom, is kept as a separate hidden map/)).toBeInTheDocument();
  });
});

describe('moving pins', () => {
  it('a DM drags a pin: it moves at once and the new place is saved', async () => {
    signInAs('dm');
    let finish: (pin: Pin) => void = () => {};
    vi.mocked(pinsApi.updatePin).mockImplementation(() => new Promise(resolve => (finish = resolve)));
    const user = userEvent.setup();
    renderMap();

    await user.click(await screen.findByRole('button', { name: 'move: The Drowned Rat' }));
    expect(pinsApi.updatePin).toHaveBeenCalledWith('p1', { x: 300, y: 200 });
    // optimistic: the pin is already in its new place while the save is still on its way
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'pin: The Drowned Rat' })).toHaveAttribute('data-pos', '300,200'),
    );
    finish({ ...tavern, x: 300, y: 200 });
  });

  it('a failed move puts the pin back and says why', async () => {
    signInAs('dm');
    vi.mocked(pinsApi.updatePin).mockRejectedValue(new DataError('network'));
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'move: The Drowned Rat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
    expect(screen.getByRole('button', { name: 'pin: The Drowned Rat' })).toHaveAttribute('data-pos', '10,10');
  });

  it('players cannot move pins', async () => {
    signInAs('player');
    renderMap();
    await screen.findByRole('button', { name: 'pin: The Drowned Rat' });
    expect(screen.queryByRole('button', { name: /^move:/ })).not.toBeInTheDocument();
  });

  it('the position can be typed, and must stay on the map', async () => {
    signInAs('dm');
    vi.mocked(pinsApi.updatePin).mockImplementation(async (_id, changes) => ({ ...tavern, ...changes }) as Pin);
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'pin: The Drowned Rat' }));
    const panel = screen.getByRole('complementary', { name: /The Drowned Rat/ });
    const x = within(panel).getByRole('spinbutton', { name: /X, from the left/ });
    expect(x).toHaveValue(10);

    await user.clear(x);
    await user.type(x, '5000'); // the map is 2000 px wide
    await user.click(within(panel).getByRole('button', { name: 'Save pin' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('X from 0 to 2000');
    expect(pinsApi.updatePin).not.toHaveBeenCalled();

    await user.clear(x);
    await user.type(x, '640');
    await user.click(within(panel).getByRole('button', { name: 'Save pin' }));
    await waitFor(() =>
      expect(pinsApi.updatePin).toHaveBeenCalledWith('p1', expect.objectContaining({ x: 640, y: 10 })),
    );
  });
});

describe('terrain and weather regions', () => {
  it('a player sees revealed regions only, and opens one to read its terrain, travel and weather rules', async () => {
    signInAs('player');
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'region: The Glass Sands' }));
    expect(screen.queryByRole('button', { name: 'region: Wraithwood' })).not.toBeInTheDocument();
    expect(regionsApi.listRegions).toHaveBeenCalledWith('m1', { includeHidden: false });

    const panel = screen.getByRole('complementary', { name: 'Region: The Glass Sands' });
    expect(within(panel).getByText('Desert')).toBeInTheDocument();
    expect(within(panel).getByText('Travel: 24 miles a day at a normal pace')).toBeInTheDocument();
    expect(within(panel).getByText('Extreme heat')).toBeInTheDocument();
    expect(within(panel).getByText(/Constitution save each hour \(DC 5/)).toBeInTheDocument();
    expect(within(panel).queryByRole('form', { name: 'Edit region' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add region' })).not.toBeInTheDocument();
  });

  it('two regions on the same map have their own weather on the same day', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'region: Wraithwood' }));
    const panel = screen.getByRole('complementary', { name: 'Region: Wraithwood' });
    expect(within(panel).getByRole('combobox', { name: 'Weather today' })).toHaveValue('snow');
    expect(within(panel).getByText('Travel: 12 miles a day at a normal pace (difficult terrain)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'region: The Glass Sands' }));
    const sandsPanel = screen.getByRole('complementary', { name: 'Region: The Glass Sands' });
    expect(within(sandsPanel).getByRole('combobox', { name: 'Weather today' })).toHaveValue('extreme_heat');
  });

  it('a DM draws a region with "Add region", and it opens hidden and ready to edit', async () => {
    signInAs('dm');
    const fresh = region({ id: 'r3', name: 'New region', cx: 600, cy: 500, radius: 150, visibleToPlayers: false });
    vi.mocked(regionsApi.createRegion).mockResolvedValue(fresh);
    vi.mocked(regionsApi.listRegions).mockResolvedValue([sands, wraithwood, fresh]);
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'Add region' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-drawing', 'true');
    await user.click(screen.getByRole('button', { name: 'draw region' }));

    expect(regionsApi.createRegion).toHaveBeenCalledWith('m1', { cx: 600, cy: 500, radius: 150 }, undefined);
    const panel = await screen.findByRole('complementary', { name: 'Region: New region' });
    expect(within(panel).getByText('Hidden from players')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-drawing', 'false');
  });

  it('edits terrain and weather, and checks the circle stays on the map', async () => {
    signInAs('dm');
    vi.mocked(regionsApi.updateRegion).mockImplementation(async (_id, changes) => ({ ...sands, ...changes }) as Region);
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'region: The Glass Sands' }));
    const panel = screen.getByRole('complementary', { name: 'Region: The Glass Sands' });

    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Terrain' }), 'badlands');
    await user.selectOptions(within(panel).getByRole('combobox', { name: 'Weather today' }), 'sandstorm');
    expect(within(panel).getByText(/Heavily obscured beyond a few feet/)).toBeInTheDocument();

    const cx = within(panel).getByRole('spinbutton', { name: /Centre X/ });
    await user.clear(cx);
    await user.type(cx, '9000');
    await user.click(within(panel).getByRole('button', { name: 'Save region' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('X from 0 to 2000');
    expect(regionsApi.updateRegion).not.toHaveBeenCalled();

    await user.clear(cx);
    await user.type(cx, '700');
    await user.click(within(panel).getByRole('button', { name: 'Save region' }));
    await waitFor(() =>
      expect(regionsApi.updateRegion).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ cx: 700, terrain: 'badlands', weather: 'sandstorm' }),
      ),
    );
  });

  it('"Roll weather" picks weather the chosen terrain usually sees', async () => {
    signInAs('dm');
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'region: Wraithwood' }));
    const panel = screen.getByRole('complementary', { name: 'Region: Wraithwood' });
    await user.click(within(panel).getByRole('button', { name: 'Roll weather' }));
    expect(['snow', 'overcast', 'extreme_cold', 'fog', 'clear']).toContain(
      (within(panel).getByRole('combobox', { name: 'Weather today' }) as HTMLSelectElement).value,
    );
  });

  it('a DM moves a region on the map and the move is saved', async () => {
    signInAs('dm');
    vi.mocked(regionsApi.updateRegion).mockImplementation(async (_id, changes) => ({ ...sands, ...changes }) as Region);
    const user = userEvent.setup();
    renderMap();
    await user.click(await screen.findByRole('button', { name: 'move region: The Glass Sands' }));
    expect(regionsApi.updateRegion).toHaveBeenCalledWith('r1', { cx: 500, cy: 400 });
  });

  it('anyone can hide the region layer', async () => {
    signInAs('player');
    const user = userEvent.setup();
    renderMap();
    await screen.findByRole('button', { name: 'region: The Glass Sands' });
    await user.click(screen.getByRole('switch', { name: 'Show regions and weather' }));
    expect(screen.queryByRole('button', { name: 'region: The Glass Sands' })).not.toBeInTheDocument();
  });
});
