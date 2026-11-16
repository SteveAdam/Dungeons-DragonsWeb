import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../auth/authContext';
import * as membersApi from '../../data/members';
import type { Message } from '../../data/messages';
import * as messagesApi from '../../data/messages';
import { openCampaignRealtime, setRealtimeTransport } from '../../lib/realtime';
import { useMessagePanel } from '../../state/messagePanel';
import { useToasts } from '../../state/toasts';
import { createFakeCampaign, type FakeCampaign } from '../../test/fakeRealtime';
import { MessagePanel } from './MessagePanel';
import { MessagesButton } from './MessagesButton';
import { PrivateNotes } from '../../pages/hub/calendar/PrivateNotes';

vi.mock('../../data/messages', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/messages')>()),
  listThread: vi.fn(),
  listThreads: vi.fn(),
  sendMessage: vi.fn(),
  markThreadRead: vi.fn(),
  listPrivateNotes: vi.fn(),
  deletePrivateNote: vi.fn(),
}));
vi.mock('../../data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/members')>()),
  listMembers: vi.fn(),
  getMyRole: vi.fn(),
}));

const CAMPAIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PAT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const msg = (over: Partial<Message>): Message => ({
  id: 'm1',
  playerId: PAT,
  senderId: PAT,
  body: 'Can I search the cellar?',
  kind: 'message',
  createdAt: '2026-11-16T10:00:00Z',
  readAt: null,
  ...over,
});

function wrap(children: ReactNode, me: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const session = { user: { id: me, email: 'someone@example.test' } } as NonNullable<AuthState['session']>;
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ session, loading: false, signOut: async () => {} }}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const both = (campaignId = CAMPAIGN) => (
  <>
    <MessagesButton campaignId={campaignId} />
    <MessagePanel campaignId={campaignId} />
  </>
);

beforeEach(() => {
  vi.clearAllMocks();
  useMessagePanel.setState({ open: false, playerId: null });
  useToasts.setState({ toasts: [] });
  vi.mocked(membersApi.listMembers).mockResolvedValue([
    { userId: DM, role: 'dm', joinedAt: '2026-01-01', displayName: 'Dee', avatarUrl: null },
    { userId: PAT, role: 'player', joinedAt: '2026-01-02', displayName: 'Pat', avatarUrl: null },
    { userId: ANA, role: 'player', joinedAt: '2026-01-03', displayName: 'Ana', avatarUrl: null },
  ]);
  vi.mocked(messagesApi.markThreadRead).mockResolvedValue(0);
});

describe('a player’s thread with the DM', () => {
  beforeEach(() => vi.mocked(membersApi.getMyRole).mockResolvedValue('player'));

  it('shows an unread dot, opens "Message the DM", and opening marks the DM’s messages read', async () => {
    vi.mocked(messagesApi.listThreads).mockResolvedValue([
      { playerId: PAT, lastBody: 'Yes', lastKind: 'message', lastSender: DM, lastAt: '', unread: 2 },
    ]);
    vi.mocked(messagesApi.listThread).mockResolvedValue([
      msg({}),
      msg({ id: 'm2', senderId: DM, body: 'Yes, roll Investigation.' }),
      msg({ id: 'm3', senderId: DM, kind: 'whisper', body: 'You notice the <i>ring</i>\non his finger' }),
    ]);
    vi.mocked(messagesApi.markThreadRead).mockResolvedValue(2);
    const user = userEvent.setup();
    wrap(both(), PAT);

    await user.click(await screen.findByRole('button', { name: 'Messages, 2 unread' }));
    const panel = screen.getByRole('complementary', { name: 'Message the DM' });
    const thread = await within(panel).findByRole('list', { name: 'Messages with the DM' });
    const items = within(thread).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^You ·/);
    expect(items[1]).toHaveTextContent(/^The DM ·.*Yes, roll Investigation\.$/);
    // a whisper says so in words, and its text stays text, line breaks and all
    const whisper = items[2];
    expect(within(whisper).getByText('A whisper:', { exact: false })).toBeInTheDocument();
    expect(whisper.querySelector('p')?.textContent).toBe('A whisper: You notice the <i>ring</i>\non his finger');
    expect(whisper.querySelector('i')).toBeNull();
    await waitFor(() => expect(messagesApi.markThreadRead).toHaveBeenCalledWith(CAMPAIGN, PAT));
    // players cannot whisper
    expect(within(panel).queryByRole('checkbox', { name: 'Send as a whisper' })).not.toBeInTheDocument();
  });

  it('sends a message to the DM; Ctrl+Enter sends too', async () => {
    vi.mocked(messagesApi.listThreads).mockResolvedValue([]);
    vi.mocked(messagesApi.listThread).mockResolvedValue([]);
    vi.mocked(messagesApi.sendMessage).mockResolvedValue('new');
    const user = userEvent.setup();
    useMessagePanel.setState({ open: true });
    wrap(both(), PAT);
    const box = await screen.findByLabelText('Message to the DM');
    expect(screen.getByText('Nothing yet. Only you and the DM read this.')).toBeInTheDocument();
    await user.type(box, 'Can I{Enter}search?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(messagesApi.sendMessage).toHaveBeenCalledWith({
      campaignId: CAMPAIGN,
      playerId: PAT,
      body: 'Can I\nsearch?',
      kind: 'message',
      saveNote: false,
    });
    await waitFor(() => expect(box).toHaveValue(''));
    await user.type(box, 'Again{Control>}{Enter}{/Control}');
    expect(messagesApi.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('says plainly when the rate limit is reached', async () => {
    vi.mocked(messagesApi.listThreads).mockResolvedValue([]);
    vi.mocked(messagesApi.listThread).mockResolvedValue([]);
    const { DataError } = await import('../../data/errors');
    vi.mocked(messagesApi.sendMessage).mockRejectedValue(
      new DataError('rate-limited', 'That is 20 messages in a minute. Wait a moment before sending more.'),
    );
    const user = userEvent.setup();
    useMessagePanel.setState({ open: true });
    wrap(both(), PAT);
    await user.type(await screen.findByLabelText('Message to the DM'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('20 messages in a minute');
  });
});

describe('the DM’s inbox', () => {
  beforeEach(() => vi.mocked(membersApi.getMyRole).mockResolvedValue('dm'));

  it('lists every player with the last message and unread counts, news first', async () => {
    vi.mocked(messagesApi.listThreads).mockResolvedValue([
      {
        playerId: PAT,
        lastBody: 'Yes, roll it.',
        lastKind: 'message',
        lastSender: DM,
        lastAt: '2026-11-16T10:00:00Z',
        unread: 0,
      },
      {
        playerId: ANA,
        lastBody: 'Help!',
        lastKind: 'message',
        lastSender: ANA,
        lastAt: '2026-11-16T09:00:00Z',
        unread: 3,
      },
    ]);
    const user = userEvent.setup();
    wrap(both(), DM);
    await user.click(await screen.findByRole('button', { name: 'Messages, 3 unread' }));
    const inbox = await screen.findByRole('list', { name: 'Players' });
    const rows = within(inbox).getAllByRole('button');
    expect(rows.map(r => r.textContent)).toEqual(['Ana3 unreadHelp!', 'PatYou: Yes, roll it.']);
    // the DM is not a player: no thread of their own
    expect(within(inbox).queryByText('Dee')).not.toBeInTheDocument();
  });

  it('opens a thread, marks it read, and sends a whisper kept in the player’s private notes', async () => {
    vi.mocked(messagesApi.listThreads).mockResolvedValue([
      { playerId: ANA, lastBody: 'Help!', lastKind: 'message', lastSender: ANA, lastAt: '', unread: 1 },
    ]);
    vi.mocked(messagesApi.listThread).mockResolvedValue([msg({ playerId: ANA, senderId: ANA, body: 'Help!' })]);
    vi.mocked(messagesApi.sendMessage).mockResolvedValue('w1');
    const user = userEvent.setup();
    useMessagePanel.setState({ open: true });
    wrap(both(), DM);
    await user.click(await screen.findByRole('button', { name: /^Ana/ }));
    const panel = screen.getByRole('complementary', { name: 'Messages with Ana' });
    expect(await within(panel).findByText('Help!')).toBeInTheDocument();
    await waitFor(() => expect(messagesApi.markThreadRead).toHaveBeenCalledWith(CAMPAIGN, ANA));

    const save = within(panel).getByRole('checkbox', { name: 'Also save it to Ana’s private notes' });
    expect(save).toBeDisabled();
    await user.click(within(panel).getByRole('checkbox', { name: 'Send as a whisper' }));
    await user.click(save);
    await user.type(within(panel).getByLabelText('Message to Ana'), 'You notice the harbourmaster’s ring');
    await user.click(within(panel).getByRole('button', { name: 'Whisper' }));
    expect(messagesApi.sendMessage).toHaveBeenCalledWith({
      campaignId: CAMPAIGN,
      playerId: ANA,
      body: 'You notice the harbourmaster’s ring',
      kind: 'whisper',
      saveNote: true,
    });

    await user.click(within(panel).getByRole('button', { name: 'All players' }));
    expect(screen.getByRole('complementary', { name: 'Messages' })).toBeInTheDocument();
  });
});

describe('live messages', () => {
  let fake: FakeCampaign;
  let close: () => void;

  async function live(me: string, isDm: boolean) {
    fake = createFakeCampaign(CAMPAIGN, { [DM]: 'dm', [PAT]: 'player', [ANA]: 'player' });
    setRealtimeTransport(fake.connect(me));
    close = openCampaignRealtime({ campaignId: CAMPAIGN, userId: me, isDm });
    await act(async () => {
      await Promise.resolve();
      fake.flush();
    });
  }
  afterEach(() => close());

  const announce = (playerId: string, kind: 'message' | 'whisper', to: 'player' | 'dm') =>
    act(async () => {
      await fake.connect(DM).send({
        campaignId: CAMPAIGN,
        target: to === 'dm' ? 'dm' : { user: playerId },
        type: 'message',
        payload: { messageId: '11111111-1111-4111-8111-111111111111', playerId, kind },
      });
      fake.flush();
    });

  it('a player is toasted about a whisper while the panel is closed, and the unread count is read again', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(messagesApi.listThreads).mockResolvedValue([]);
    await live(PAT, false);
    wrap(both(), PAT);
    await screen.findByRole('button', { name: 'Messages' });
    vi.mocked(messagesApi.listThreads).mockResolvedValue([
      { playerId: PAT, lastBody: 'x', lastKind: 'whisper', lastSender: DM, lastAt: '', unread: 1 },
    ]);
    await announce(PAT, 'whisper', 'player');
    expect(useToasts.getState().toasts.map(t => t.message)).toEqual(['A whisper from the DM']);
    expect(await screen.findByRole('button', { name: 'Messages, 1 unread' })).toBeInTheDocument();
  });

  it('no toast when the thread is already open', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(messagesApi.listThreads).mockResolvedValue([]);
    vi.mocked(messagesApi.listThread).mockResolvedValue([]);
    await live(PAT, false);
    useMessagePanel.setState({ open: true });
    wrap(both(), PAT);
    await screen.findByLabelText('Message to the DM');
    await announce(PAT, 'message', 'player');
    expect(useToasts.getState().toasts).toEqual([]);
  });
});

describe('private notes (saved whispers)', () => {
  it('a player sees the whispers kept for them, as plain text, and can remove one', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(messagesApi.listPrivateNotes).mockResolvedValue([
      { id: 'n1', body: 'The ring bears a <b>kraken</b>\nseal', createdAt: '' },
    ]);
    vi.mocked(messagesApi.deletePrivateNote).mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(<PrivateNotes campaignId={CAMPAIGN} />, PAT);
    const section = await screen.findByRole('region', { name: 'Your private notes' });
    expect(section.querySelector('p:not([class*="Hint"])')?.textContent).toBe('The ring bears a <b>kraken</b>\nseal');
    expect(section.querySelector('b')).toBeNull();
    await user.click(within(section).getByRole('button', { name: 'Remove this private note' }));
    expect(messagesApi.deletePrivateNote).toHaveBeenCalledWith('n1');
  });

  it('a DM never asks for anyone’s private notes', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('dm');
    const { container } = wrap(<PrivateNotes campaignId={CAMPAIGN} />, DM);
    await waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(messagesApi.listPrivateNotes).not.toHaveBeenCalled();
  });
});
