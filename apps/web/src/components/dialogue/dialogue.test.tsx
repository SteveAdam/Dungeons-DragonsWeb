import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as charactersApi from '../../data/characters';
import type { MyCheckRequest, RequestPreview } from '../../data/dialogue';
import * as dialogueApi from '../../data/dialogue';
import * as membersApi from '../../data/members';
import { openCampaignRealtime, setRealtimeTransport, type EventMeta } from '../../lib/realtime';
import { CampaignRealtime } from '../../lib/realtime/campaignRealtime';
import { createFakeCampaign, type FakeCampaign } from '../../test/fakeRealtime';
import { DialogueLayer } from './DialogueLayer';
import { SpeechScroll } from './SpeechScroll';

vi.mock('../../data/dialogue', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/dialogue')>()),
  listMyRequests: vi.fn(),
  previewRequest: vi.fn(),
  answerRequest: vi.fn(),
  listLog: vi.fn(async () => []),
}));
vi.mock('../../data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/members')>()),
  getMyRole: vi.fn(),
}));
vi.mock('../../data/characters', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/characters')>()),
  listCharacters: vi.fn(),
}));

const CAMPAIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ORSA = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const LINE = '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b';
const HAGGLE = '2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c';
const BRANNOC = '3d3d3d3d-3d3d-4d3d-8d3d-3d3d3d3d3d3d';

const request = (over: Partial<MyCheckRequest> = {}): MyCheckRequest => ({
  id: HAGGLE,
  characterIds: [BRANNOC],
  key: 'persuasion',
  kind: 'check',
  dc: 13,
  mode: 'normal',
  reason: null,
  showOdds: true,
  prompt: 'Haggle',
  status: 'open',
  npcId: ORSA,
  createdAt: '',
  answered: [],
  ...over,
});
const preview = (over: Partial<RequestPreview> = {}): RequestPreview => ({
  label: 'Persuasion check',
  bonus: 0,
  bonusBreakdown: [{ label: 'Charisma', value: 0 }],
  mode: 'normal',
  reasons: [],
  chance: 0.4,
  critChance: 0.05,
  autoFail: null,
  notes: [],
  ...over,
});
const line = (showOdds = true) => ({
  npcId: ORSA,
  lineKey: LINE,
  logId: null,
  speaker: 'Orsa, hedge witch',
  disposition: 'friendly' as const,
  text: 'Healing draught, fifty gold.\nNo haggling in my wood. <b>None.</b>',
  options: [
    { label: 'Buy a healing draught', kind: 'say' as const },
    {
      label: 'Haggle',
      kind: 'check' as const,
      requestId: HAGGLE,
      check: { skill: 'persuasion', showOdds, ...(showOdds ? { dc: 13 } : {}) },
    },
    { label: 'Leave', kind: 'end' as const },
  ],
});

describe('the speech scroll', () => {
  it('shows the NPC, how it feels, and the line as plain text with its line breaks', () => {
    render(<SpeechScroll line={line()} />);
    const scroll = screen.getByRole('region', { name: 'Orsa, hedge witch speaks' });
    expect(within(scroll).getByText('Friendly')).toBeInTheDocument();
    const text = within(scroll).getByText(/Healing draught/);
    expect(text.textContent).toBe('“Healing draught, fifty gold.\nNo haggling in my wood. <b>None.</b>”');
    expect(scroll.querySelector('b')).toBeNull();
    // a preview: no buttons do anything
    expect(within(scroll).getByRole('button', { name: /Buy a healing draught/ })).toBeDisabled();
    expect(within(scroll).getByRole('button', { name: /Haggle/ })).toHaveTextContent(/^Haggle · Persuasion DC 13$/);
  });

  it('a hidden DC is simply not there', () => {
    render(<SpeechScroll line={line(false)} />);
    expect(screen.getByRole('button', { name: /Haggle/ })).toHaveTextContent(/^Haggle · Persuasion$/);
  });
});

describe('a player’s dialogue layer', () => {
  let fake: FakeCampaign;
  let close: () => void;
  const dmHeard: { type: string; payload: unknown; meta: EventMeta }[] = [];
  let dmLink: CampaignRealtime;

  beforeEach(async () => {
    vi.clearAllMocks();
    dmHeard.length = 0;
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(charactersApi.listCharacters).mockResolvedValue([
      { id: BRANNOC, campaignId: CAMPAIGN, ownerId: ME, name: 'Brannoc', xp: 0, levelApplied: 1 },
    ]);
    vi.mocked(dialogueApi.listMyRequests).mockResolvedValue([]);
    vi.mocked(dialogueApi.previewRequest).mockResolvedValue(preview());
    fake = createFakeCampaign(CAMPAIGN, { [DM]: 'dm', [ME]: 'player' });
    // the DM, listening on their own channel
    dmLink = new CampaignRealtime(fake.connect(DM), { campaignId: CAMPAIGN, userId: DM, isDm: true });
    void dmLink.start();
    dmLink.on('dialogue_choice', (payload, meta) => dmHeard.push({ type: 'dialogue_choice', payload, meta }));
    setRealtimeTransport(fake.connect(ME));
    close = openCampaignRealtime({ campaignId: CAMPAIGN, userId: ME, isDm: false });
    await act(async () => {
      await Promise.resolve();
      fake.flush();
    });
  });
  afterEach(() => {
    close();
    dmLink.stop();
  });

  function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DialogueLayer campaignId={CAMPAIGN} />
      </QueryClientProvider>,
    );
  }
  const dmSays = (payload: ReturnType<typeof line>) =>
    act(async () => {
      await fake.connect(DM).send({ campaignId: CAMPAIGN, target: { user: ME }, type: 'dialogue', payload });
      fake.flush();
    });

  it('the scroll appears when the DM says a line to this player, with the odds on the check option', async () => {
    vi.mocked(dialogueApi.listMyRequests).mockResolvedValue([request()]);
    show();
    await waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    await dmSays(line());
    const scroll = await screen.findByRole('region', { name: 'Orsa, hedge witch speaks' });
    const haggle = await within(scroll).findByRole('button', { name: /Haggle/ });
    await waitFor(() => expect(haggle).toHaveTextContent('40%'));
    expect(dialogueApi.previewRequest).toHaveBeenCalledWith(CAMPAIGN, BRANNOC, HAGGLE);
  });

  it('choosing what to say tells the DM, stamped with who chose it', async () => {
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    await dmSays(line());
    await user.click(await screen.findByRole('button', { name: 'Buy a healing draught' }));
    act(() => fake.flush());
    expect(dmHeard).toHaveLength(1);
    expect(dmHeard[0].payload).toEqual({ npcId: ORSA, lineKey: LINE, optionIndex: 0, label: 'Buy a healing draught' });
    expect(dmHeard[0].meta.sender).toBe(ME);
    expect(screen.getByRole('button', { name: 'Buy a healing draught' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a check option opens the odds popup with the server’s preview, and Roll answers the request', async () => {
    vi.mocked(dialogueApi.listMyRequests).mockResolvedValue([request()]);
    vi.mocked(dialogueApi.answerRequest).mockResolvedValue({
      id: 'r1',
      campaignId: CAMPAIGN,
      characterId: BRANNOC,
      rolledBy: ME,
      kind: 'check',
      label: 'Persuasion check',
      bonus: 0,
      bonusBreakdown: [],
      target: 13,
      mode: 'normal',
      dice: [15],
      kept: 15,
      total: 15,
      success: true,
      crit: false,
      fumble: false,
      hidden: false,
      createdAt: '',
    } as never);
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    await dmSays(line());
    await user.click(await screen.findByRole('button', { name: /Haggle/ }));
    const popup = await screen.findByRole('dialog');
    expect(await within(popup).findByText('40%')).toBeInTheDocument();
    await user.click(within(popup).getByRole('button', { name: 'Roll' }));
    expect(dialogueApi.answerRequest).toHaveBeenCalledWith(CAMPAIGN, BRANNOC, HAGGLE);
  });

  it('with the odds hidden the popup shows the bonus but no percentage', async () => {
    vi.mocked(dialogueApi.listMyRequests).mockResolvedValue([request({ showOdds: false, dc: null })]);
    vi.mocked(dialogueApi.previewRequest).mockResolvedValue(preview({ chance: null, bonus: 2 }));
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    await dmSays(line(false));
    const haggle = await screen.findByRole('button', { name: /Haggle/ });
    expect(haggle).not.toHaveTextContent('%');
    await user.click(haggle);
    const popup = await screen.findByRole('dialog');
    await within(popup).findByText(/your bonus \+2/);
    expect(within(popup).queryByText(/%/)).not.toBeInTheDocument();
    expect(within(popup).queryByText(/DC/)).not.toBeInTheDocument();
  });

  it('a check offered on its own shows as a card with Roll', async () => {
    vi.mocked(dialogueApi.listMyRequests).mockResolvedValue([
      request({ prompt: 'Read her face', key: 'insight', dc: 10 }),
    ]);
    show();
    const card = await screen.findByRole('region', { name: 'Checks for you' });
    expect(within(card).getByText(/Read her face/)).toHaveTextContent('Read her face · Insight DC 10 · Brannoc');
    expect(within(card).getByRole('button', { name: 'Roll Insight for Brannoc' })).toBeInTheDocument();
  });

  it('shows nothing to a DM', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('dm');
    show();
    await waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    await dmSays(line());
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
