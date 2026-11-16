import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../auth/authContext';
import * as handoutsApi from '../../data/handouts';
import type { Handout } from '../../data/handouts';
import * as membersApi from '../../data/members';
import * as groupsApi from '../../data/partyGroups';
import { openCampaignRealtime, setRealtimeTransport } from '../../lib/realtime';
import { createFakeHandoutImageStore } from '../../lib/storage/handoutImages';
import { HandoutsTab } from '../../pages/hub/handouts/HandoutsTab';
import { createFakeCampaign, type FakeCampaign } from '../../test/fakeRealtime';
import { HandoutList } from './HandoutList';
import { HandoutPopup } from './HandoutPopup';

vi.mock('../../data/handouts', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/handouts')>()),
  listHandouts: vi.fn(),
  createHandout: vi.fn(),
  updateHandout: vi.fn(),
  deleteHandout: vi.fn(),
  showHandout: vi.fn(),
  takeBackHandout: vi.fn(),
  markHandoutSeen: vi.fn(async () => undefined),
}));
vi.mock('../../data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/members')>()),
  listMembers: vi.fn(),
}));
vi.mock('../../data/partyGroups', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/partyGroups')>()),
  listGroups: vi.fn(),
}));

const CAMPAIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LETTER = '11111111-1111-4111-8111-111111111111';
const MAP_HANDOUT = '22222222-2222-4222-8222-222222222222';

const handout = (over: Partial<Handout>): Handout => ({
  id: LETTER,
  campaignId: CAMPAIGN,
  title: 'A letter from the harbourmaster',
  kind: 'text',
  body: 'Meet me at the docks.\nCome alone. <b>Burn this.</b>',
  imagePath: null,
  createdAt: '2026-11-14T10:00:00Z',
  shares: [{ userId: ME, sharedAt: '2026-11-14T10:05:00Z', seenAt: null }],
  ...over,
});

function wrap(children: ReactNode, userId = ME) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const session = { user: { id: userId, email: 'someone@example.test' } } as NonNullable<AuthState['session']>;
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ session, loading: false, signOut: async () => {} }}>
        <MemoryRouter>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(handoutsApi.markHandoutSeen).mockResolvedValue(undefined);
});

describe('the handout popup', () => {
  let fake: FakeCampaign;
  let close: () => void;

  beforeEach(async () => {
    fake = createFakeCampaign(CAMPAIGN, { [DM]: 'dm', [ME]: 'player', [ANA]: 'player' });
    setRealtimeTransport(fake.connect(ME));
    close = openCampaignRealtime({ campaignId: CAMPAIGN, userId: ME, isDm: false });
    await act(async () => {
      await Promise.resolve();
      fake.flush();
    });
  });
  afterEach(() => close());

  const dmShows = (handoutId: string, to = ME) =>
    act(async () => {
      await fake
        .connect(DM)
        .send({ campaignId: CAMPAIGN, target: { user: to }, type: 'handout', payload: { handoutId } });
      fake.flush();
    });

  it('appears when the DM shows this player a handout, and "Later" keeps it new', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([]);
    const user = userEvent.setup();
    wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await waitFor(() => expect(handoutsApi.listHandouts).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([handout({})]);
    await dmShows(LETTER);
    const notice = await screen.findByRole('dialog', { name: 'A letter from the harbourmaster' });
    expect(within(notice).getByText('The DM shows you a handout')).toBeInTheDocument();
    await user.click(within(notice).getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(handoutsApi.markHandoutSeen).not.toHaveBeenCalled();
  });

  it('"Read it" opens the whole handout as plain text, line breaks kept, and marks it opened', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([handout({})]);
    const user = userEvent.setup();
    wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await dmShows(LETTER);
    // what the database says once it is opened
    const opened = handout({
      shares: [{ userId: ME, sharedAt: '2026-11-14T10:05:00Z', seenAt: '2026-11-14T10:06:00Z' }],
    });
    const readIt = await screen.findByRole('button', { name: 'Read it' });
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([opened]);
    await user.click(readIt);

    const viewer = screen.getByRole('dialog', { name: 'A letter from the harbourmaster' });
    const text = within(viewer).getByText(/Meet me at the docks/);
    expect(text.textContent).toBe('Meet me at the docks.\nCome alone. <b>Burn this.</b>');
    // the markup in the text stays text
    expect(viewer.querySelector('b')).toBeNull();
    expect(handoutsApi.markHandoutSeen).toHaveBeenCalledWith(LETTER);
    await user.click(within(viewer).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape is the same as "Later"', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([handout({})]);
    const user = userEvent.setup();
    wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await dmShows(LETTER);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(handoutsApi.markHandoutSeen).not.toHaveBeenCalled();
  });

  it('stays away for a handout this player cannot read (taken back, or never theirs)', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([]);
    wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await dmShows(LETTER);
    await waitFor(() => expect(handoutsApi.listHandouts).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never hears about a handout shown to another player', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([]);
    wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await waitFor(() => expect(handoutsApi.listHandouts).toHaveBeenCalledTimes(1));
    await dmShows(LETTER, ANA);
    expect(handoutsApi.listHandouts).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a handout shown while the player was away pops up when they come back; "Later" is remembered', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([handout({})]);
    const user = userEvent.setup();
    const first = wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await user.click(await screen.findByRole('button', { name: 'Later' }));
    first.unmount();

    wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await waitFor(() => expect(handoutsApi.listHandouts).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shown again, it pops up again even after "Later"', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([handout({})]);
    const user = userEvent.setup();
    wrap(<HandoutPopup campaignId={CAMPAIGN} />);
    await user.click(await screen.findByRole('button', { name: 'Later' }));
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([
      handout({ shares: [{ userId: ME, sharedAt: '2026-11-14T11:00:00Z', seenAt: null }] }),
    ]);
    await dmShows(LETTER);
    expect(await screen.findByRole('dialog', { name: 'A letter from the harbourmaster' })).toBeInTheDocument();
  });
});

describe('the handouts list in the Pack', () => {
  it('lists the handouts shown to this player, newest first, with a "new" marker until opened', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([
      handout({
        id: MAP_HANDOUT,
        title: 'The real map',
        kind: 'image',
        body: null,
        imagePath: `${CAMPAIGN}/fake-1.png`,
      }),
      handout({ shares: [{ userId: ME, sharedAt: '2026-11-14T10:05:00Z', seenAt: '2026-11-14T10:06:00Z' }] }),
    ]);
    const user = userEvent.setup();
    const store = createFakeHandoutImageStore();
    expect(await store.upload(CAMPAIGN, new File(['x'], 'm.png', { type: 'image/png' }))).toBe(
      `${CAMPAIGN}/fake-1.png`,
    );
    wrap(<HandoutList campaignId={CAMPAIGN} store={store} />);

    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('button');
    expect(items.map(b => b.textContent)).toEqual(['The real mapnew', 'A letter from the harbourmaster']);
    expect(screen.getByRole('heading', { name: 'Handouts, 1 new' })).toBeInTheDocument();

    // what the database says once it is opened
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([
      handout({
        id: MAP_HANDOUT,
        title: 'The real map',
        kind: 'image',
        body: null,
        imagePath: `${CAMPAIGN}/fake-1.png`,
        shares: [{ userId: ME, sharedAt: '2026-11-14T10:05:00Z', seenAt: '2026-11-14T10:07:00Z' }],
      }),
      handout({ shares: [{ userId: ME, sharedAt: '2026-11-14T10:05:00Z', seenAt: '2026-11-14T10:06:00Z' }] }),
    ]);
    await user.click(items[0]);
    expect(handoutsApi.markHandoutSeen).toHaveBeenCalledWith(MAP_HANDOUT);
    const viewer = screen.getByRole('dialog', { name: 'The real map' });
    expect(within(list).queryByText('new')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Handouts' })).toBeInTheDocument();
    expect(await within(viewer).findByRole('img', { name: 'The real map' })).toHaveAttribute(
      'src',
      `fake://handouts/${CAMPAIGN}/fake-1.png`,
    );
  });

  it('zooms an image in and out', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([
      handout({ id: MAP_HANDOUT, title: 'The real map', kind: 'image', body: 'Drawn in a hurry', imagePath: 'x' }),
    ]);
    const user = userEvent.setup();
    wrap(<HandoutList campaignId={CAMPAIGN} store={createFakeHandoutImageStore()} />);
    await user.click(await screen.findByRole('button', { name: /The real map/ }));
    const viewer = screen.getByRole('dialog', { name: 'The real map' });
    expect(within(viewer).getByText('100%')).toBeInTheDocument();
    expect(within(viewer).getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    await user.click(within(viewer).getByRole('button', { name: 'Zoom in' }));
    await user.click(within(viewer).getByRole('button', { name: 'Zoom in' }));
    expect(within(viewer).getByText('200%')).toBeInTheDocument();
    expect(within(viewer).getByText('Drawn in a hurry')).toBeInTheDocument();
  });

  it('opening an old handout again does not mark anything', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([
      handout({ shares: [{ userId: ME, sharedAt: '2026-11-14T10:05:00Z', seenAt: '2026-11-14T10:06:00Z' }] }),
    ]);
    const user = userEvent.setup();
    wrap(<HandoutList campaignId={CAMPAIGN} />);
    await user.click(await screen.findByRole('button', { name: /harbourmaster/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(handoutsApi.markHandoutSeen).not.toHaveBeenCalled();
  });

  it('says so when nothing has been shown yet', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([]);
    wrap(<HandoutList campaignId={CAMPAIGN} />);
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  });
});

describe('the DM’s handouts library', () => {
  beforeEach(() => {
    vi.mocked(membersApi.listMembers).mockResolvedValue([
      { userId: DM, role: 'dm', joinedAt: '2026-01-01', displayName: 'Dee', avatarUrl: null },
      { userId: ME, role: 'player', joinedAt: '2026-01-02', displayName: 'Pat', avatarUrl: null },
      { userId: ANA, role: 'player', joinedAt: '2026-01-03', displayName: 'Ana', avatarUrl: null },
    ]);
    vi.mocked(groupsApi.listGroups).mockResolvedValue([]);
  });

  it('makes a text handout', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([]);
    vi.mocked(handoutsApi.createHandout).mockResolvedValue(handout({ shares: [] }));
    const user = userEvent.setup();
    const store = createFakeHandoutImageStore();
    wrap(<HandoutsTab campaignId={CAMPAIGN} store={store} />, DM);
    await user.click(await screen.findByRole('button', { name: 'New handout' }));
    await user.type(screen.getByLabelText('Title'), 'A riddle');
    await user.type(screen.getByLabelText(/^Text \(shown/), 'What walks on four legs{Enter}in the morning?');
    expect(screen.getByText('39 / 8,000')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Make the handout' }));
    expect(handoutsApi.createHandout).toHaveBeenCalledWith(
      CAMPAIGN,
      { title: 'A riddle', kind: 'text', body: 'What walks on four legs\nin the morning?', image: null },
      store,
    );
  });

  it('asks for an image before making an image handout, and refuses an SVG', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([]);
    const user = userEvent.setup({ applyAccept: false });
    wrap(<HandoutsTab campaignId={CAMPAIGN} />, DM);
    await user.click(await screen.findByRole('button', { name: 'New handout' }));
    await user.type(screen.getByLabelText('Title'), 'The map');
    await user.click(screen.getByRole('radio', { name: 'Image' }));
    await user.click(screen.getByRole('button', { name: 'Make the handout' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an image for the handout.');
    await user.upload(
      screen.getByLabelText(/^Image \(PNG/),
      new File(['<svg/>'], 'map.svg', { type: 'image/svg+xml' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('PNG, JPG or WebP');
    expect(handoutsApi.createHandout).not.toHaveBeenCalled();
  });

  it('shows a handout to chosen players and says who has it', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([handout({ shares: [] })]);
    vi.mocked(handoutsApi.showHandout).mockResolvedValue([ANA]);
    const user = userEvent.setup();
    wrap(<HandoutsTab campaignId={CAMPAIGN} />, DM);
    expect(await screen.findByText('Not shown to anyone yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show to…' }));
    await user.click(screen.getByRole('radio', { name: 'Chosen players' }));
    // DMs are not on the list: handouts are for players
    expect(screen.queryByRole('checkbox', { name: 'Dee' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show it' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one player.');
    await user.click(screen.getByRole('checkbox', { name: 'Ana' }));
    await user.click(screen.getByRole('button', { name: 'Show it' }));
    expect(handoutsApi.showHandout).toHaveBeenCalledWith(LETTER, { kind: 'players', userIds: [ANA] });
    expect(await screen.findByRole('status')).toHaveTextContent('Shown to Ana.');
  });

  it('lists who has a handout and whether they opened it; one can be taken back', async () => {
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([
      handout({
        shares: [
          { userId: ME, sharedAt: '2026-11-14T10:05:00Z', seenAt: '2026-11-14T10:06:00Z' },
          { userId: ANA, sharedAt: '2026-11-14T10:05:00Z', seenAt: null },
        ],
      }),
    ]);
    vi.mocked(handoutsApi.takeBackHandout).mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(<HandoutsTab campaignId={CAMPAIGN} />, DM);
    const who = await screen.findByRole('list', { name: 'Who has “A letter from the harbourmaster”' });
    expect(
      within(who)
        .getAllByRole('listitem')
        .map(li => li.textContent),
    ).toEqual(['Pat · opened', 'Ana · new']);
    await user.click(screen.getByRole('button', { name: 'Take “A letter from the harbourmaster” back from Ana' }));
    expect(handoutsApi.takeBackHandout).toHaveBeenCalledWith(LETTER, ANA);
  });

  it('deletes a handout only after confirming', async () => {
    const letter = handout({});
    vi.mocked(handoutsApi.listHandouts).mockResolvedValue([letter]);
    vi.mocked(handoutsApi.deleteHandout).mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(<HandoutsTab campaignId={CAMPAIGN} />, DM);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/The player who has it loses it too/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(handoutsApi.deleteHandout).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete it' }));
    expect(handoutsApi.deleteHandout).toHaveBeenCalledWith(letter, expect.anything());
  });
});
