// P4-1: the live parts of the shell, against the in-memory campaign.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/authContext';
import { getRealtime, setRealtimeTransport, type PresenceEntry } from '../lib/realtime';
import { useToasts } from '../state/toasts';
import { createFakeCampaign, type FakeCampaign } from '../test/fakeRealtime';
import { AppShell } from './AppShell';
import { ConnectionIndicator } from './ConnectionIndicator';
import { HeaderPresence, PresenceList } from './PresenceList';
import { ToastRegion, TOAST_MS } from './ToastRegion';

const CAMPAIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

vi.mock('../data/campaigns', async importOriginal => ({
  ...(await importOriginal<typeof import('../data/campaigns')>()),
  getCampaign: vi.fn(async () => ({ id: CAMPAIGN, name: 'C', gameSeconds: 3600 })),
  subscribeToClock: vi.fn(() => () => {}),
}));
vi.mock('../data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('../data/members')>()),
  getMyRole: vi.fn(async () => 'player'),
  listMembers: vi.fn(async () => [
    { userId: ME, role: 'player', joinedAt: '2026-01-01', displayName: 'Pat', avatarUrl: null },
    { userId: DM, role: 'dm', joinedAt: '2026-01-01', displayName: 'Dee', avatarUrl: null },
  ]),
}));
vi.mock('../data/characters', async importOriginal => ({
  ...(await importOriginal<typeof import('../data/characters')>()),
  listCharacters: vi.fn(async () => []),
}));
vi.mock('../data/partyGroups', async importOriginal => ({
  ...(await importOriginal<typeof import('../data/partyGroups')>()),
  listGroups: vi.fn(async () => []),
}));
vi.mock('../data/calendar', async importOriginal => ({
  ...(await importOriginal<typeof import('../data/calendar')>()),
  getCalendar: vi.fn(async () => null),
}));

const person = (name: string, status: PresenceEntry['status']): PresenceEntry => ({
  userId: `${name}-id`,
  name,
  characterId: null,
  groupId: null,
  status,
  since: '2026-01-01T00:00:00.000Z',
});

describe('ConnectionIndicator', () => {
  it.each([
    ['connected', 'Connected'],
    ['reconnecting', 'Reconnecting…'],
    ['offline', 'Offline'],
  ] as const)('says so in words when %s', (state, text) => {
    render(<ConnectionIndicator state={state} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });
});

describe('PresenceList', () => {
  it('gives each status in words, not colour alone', () => {
    render(<PresenceList people={[person('Ann', 'active'), person('Bo', 'away'), person('Cy', 'in-scene')]} />);
    const rows = within(screen.getByRole('list', { name: 'At the table' })).getAllByRole('listitem');
    expect(rows.map(r => r.textContent)).toEqual(['AAnnActive', 'BBoAway', 'CCyIn scene']);
  });

  it('labels each avatar in the header', () => {
    render(<HeaderPresence people={[person('Ann Lee', 'away')]} />);
    expect(screen.getByRole('img', { name: 'Ann Lee, Away', hidden: true })).toHaveTextContent('AL');
  });

  it('shows nothing when nobody is there', () => {
    const { container } = render(<HeaderPresence people={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ToastRegion', () => {
  beforeEach(() => useToasts.setState({ toasts: [] }));

  it('is a polite live region that exists before any toast arrives', () => {
    render(<ToastRegion />);
    const region = screen.getByRole('status', { name: 'Notifications' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('announces a toast inside the region', () => {
    render(<ToastRegion />);
    act(() => useToasts.getState().push('The table is paused'));
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent('The table is paused');
  });

  it('can be dismissed', async () => {
    render(<ToastRegion />);
    act(() => useToasts.getState().push('Bye'));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
  });

  it('goes away by itself', () => {
    vi.useFakeTimers();
    render(<ToastRegion />);
    act(() => useToasts.getState().push('Soon gone'));
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByText('Soon gone')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('the app shell', () => {
  let fake: FakeCampaign;
  let client: QueryClient;
  const session = { user: { id: ME, email: 'p@example.test' } } as NonNullable<AuthState['session']>;

  async function live() {
    await waitFor(() => expect(getRealtime()).not.toBeNull());
    await act(async () => {
      await Promise.resolve();
      fake.flush();
    });
    await act(async () => {
      fake.flush();
    });
  }

  function renderShell() {
    render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={{ session, loading: false, signOut: async () => {} }}>
          <MemoryRouter initialEntries={[`/campaigns/${CAMPAIGN}`]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/campaigns/:campaignId" element={<Link to={`/campaigns/${CAMPAIGN}/next`}>Go on</Link>} />
                <Route path="/campaigns/:campaignId/next" element={<p>Second screen</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    fake = createFakeCampaign(CAMPAIGN, { [ME]: 'player', [DM]: 'dm' });
    setRealtimeTransport(fake.connect(ME));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useToasts.setState({ toasts: [] });
  });

  it('keeps the header and the connection across navigation', async () => {
    renderShell();
    await live();
    const banner = screen.getByRole('banner');
    const connection = getRealtime();
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Go on' }));
    expect(await screen.findByText('Second screen')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBe(banner);
    expect(getRealtime()).toBe(connection);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('has the empty audio slot', () => {
    renderShell();
    expect(screen.getByTestId('audio-slot')).toBeEmptyDOMElement();
  });

  it('shows the person in the header once they are present', async () => {
    renderShell();
    await live();
    await waitFor(() => {
      act(() => fake.flush());
      expect(screen.getByRole('img', { name: 'Pat, Active', hidden: true })).toBeInTheDocument();
    });
  });

  it('refetches durable data after a reconnect', async () => {
    renderShell();
    await live();
    await screen.findByText('Connected');
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    act(() => {
      fake.drop();
      fake.flush();
    });
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalled();
    act(() => {
      fake.restore();
      fake.flush();
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith();
  });

  it('shows a toast event from the DM', async () => {
    renderShell();
    await live();
    await act(async () => {
      await fake
        .connect(DM)
        .send({ campaignId: CAMPAIGN, target: 'campaign', type: 'toast', payload: { message: 'Roll!' } });
      fake.flush();
    });
    expect(screen.getByRole('status', { name: 'Notifications' })).toHaveTextContent('Roll!');
  });
});
