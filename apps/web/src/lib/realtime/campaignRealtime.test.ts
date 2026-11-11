import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeCampaign, type FakeCampaign } from '../../test/fakeRealtime';
import { CampaignRealtime } from './campaignRealtime';
import { AWAY_AFTER_MS } from './presence';

const CAMPAIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PLAYER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MAP = '11111111-1111-4111-8111-111111111111';
const members = new Set([DM, PLAYER, OTHER]);
const ping = { mapId: MAP, x: 1, y: 2, colour: 'gold', name: 'A' };

let fake: FakeCampaign;
let time = 1_000_000;

async function join(userId: string, isDm = false) {
  const realtime = new CampaignRealtime(fake.connect(userId), {
    campaignId: CAMPAIGN,
    userId,
    isDm,
    now: () => time,
  });
  await realtime.start();
  realtime.setMembers(members);
  realtime.setIdentity({ name: userId === DM ? 'The DM' : 'Aldric', characterId: null, groupId: null });
  return realtime;
}

beforeEach(() => {
  fake = createFakeCampaign(CAMPAIGN, { [DM]: 'dm', [PLAYER]: 'player', [OTHER]: 'player' });
  time += 100_000;
});

describe('channels', () => {
  it('a DM joins the campaign, DM and own channels', async () => {
    await join(DM, true);
    fake.flush();
    expect(fake.topicsOf(DM).sort()).toEqual(
      [`campaign:${CAMPAIGN}`, `dm:${CAMPAIGN}`, `user:${CAMPAIGN}:${DM}`].sort(),
    );
  });

  it('a player joins only the campaign and their own channels', async () => {
    await join(PLAYER);
    fake.flush();
    expect(fake.topicsOf(PLAYER).sort()).toEqual([`campaign:${CAMPAIGN}`, `user:${CAMPAIGN}:${PLAYER}`].sort());
  });

  it('leaves its channels when stopped', async () => {
    const realtime = await join(PLAYER);
    fake.flush();
    realtime.stop();
    fake.flush();
    expect(fake.topicsOf(PLAYER)).toEqual([]);
  });
});

describe('events', () => {
  it('a table event reaches the player, stamped with its real sender', async () => {
    const dm = await join(DM, true);
    const player = await join(PLAYER);
    fake.flush();
    const heard = vi.fn();
    player.on('toast', heard);
    await expect(dm.send('campaign', 'toast', { message: 'Hello' })).resolves.toEqual({ ok: true });
    expect(heard).not.toHaveBeenCalled(); // nothing until the test says so
    fake.flush();
    expect(heard).toHaveBeenCalledWith({ message: 'Hello' }, expect.objectContaining({ sender: DM, senderRole: 'dm' }));
  });

  it('a DM-only event never reaches a player', async () => {
    const dm = await join(DM, true);
    const player = await join(PLAYER);
    fake.flush();
    const dmHeard = vi.fn();
    const playerHeard = vi.fn();
    dm.on('toast', dmHeard);
    player.on('toast', playerHeard);
    await dm.send('dm', 'toast', { message: 'Secret' });
    fake.flush();
    expect(dmHeard).toHaveBeenCalledOnce();
    expect(playerHeard).not.toHaveBeenCalled();
  });

  it('a player cannot send what only a DM may', async () => {
    const player = await join(PLAYER);
    fake.flush();
    await expect(player.send('campaign', 'toast', { message: 'Forged' })).resolves.toMatchObject({
      ok: false,
      reason: 'failed',
    });
  });

  it('refuses to send an invalid payload', async () => {
    const dm = await join(DM, true);
    await expect(dm.send('campaign', 'toast', { message: '' })).resolves.toEqual({ ok: false, reason: 'invalid' });
  });

  it('applies the rate limit', async () => {
    const player = await join(PLAYER);
    fake.flush();
    await expect(player.send('campaign', 'ping', ping)).resolves.toEqual({ ok: true });
    time += 1000;
    await expect(player.send('campaign', 'ping', ping)).resolves.toEqual({
      ok: false,
      reason: 'rate-limited',
      retryInMs: 1000,
    });
    time += 1000;
    await expect(player.send('campaign', 'ping', ping)).resolves.toEqual({ ok: true });
  });

  it('ignores anything that fails validation, including a broadcast with no envelope', async () => {
    const player = await join(PLAYER);
    fake.flush();
    const heard = vi.fn();
    player.on('toast', heard);
    fake.inject(`campaign:${CAMPAIGN}`, 'toast', { message: 'Forged', sender: DM });
    fake.inject(`campaign:${CAMPAIGN}`, 'mystery', {});
    fake.flush();
    expect(heard).not.toHaveBeenCalled();
  });

  it('stops listening when asked', async () => {
    const dm = await join(DM, true);
    const player = await join(PLAYER);
    fake.flush();
    const heard = vi.fn();
    player.on('toast', heard)();
    await dm.send('campaign', 'toast', { message: 'Hello' });
    fake.flush();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('presence', () => {
  it('each person sees the other, and sees them leave', async () => {
    const dm = await join(DM, true);
    const player = await join(PLAYER);
    fake.flush();
    expect(dm.getPresence().map(p => p.name)).toEqual(['Aldric', 'The DM']);
    expect(player.getPresence().map(p => p.name)).toEqual(['Aldric', 'The DM']);
    player.stop();
    fake.flush();
    expect(dm.getPresence().map(p => p.name)).toEqual(['The DM']);
  });

  it('asks for the member list again when someone new appears', async () => {
    const dm = await join(DM, true);
    fake.flush();
    dm.setMembers(new Set([DM]));
    const stranger = vi.fn();
    dm.onStranger(stranger);
    await join(PLAYER);
    fake.flush();
    expect(stranger).toHaveBeenCalledOnce();
    expect(dm.getPresence().map(p => p.userId)).toEqual([DM]);
  });

  describe('after three idle minutes', () => {
    beforeEach(() => vi.useFakeTimers({ now: time }));
    afterEach(() => vi.useRealTimers());

    it('shows as away, and active again at the next interaction', async () => {
      const realtime = new CampaignRealtime(fake.connect(PLAYER), {
        campaignId: CAMPAIGN,
        userId: PLAYER,
        isDm: false,
      });
      await realtime.start();
      realtime.setMembers(members);
      fake.flush();
      expect(realtime.getPresence()[0].status).toBe('active');
      vi.advanceTimersByTime(AWAY_AFTER_MS);
      fake.flush();
      expect(realtime.getPresence()[0].status).toBe('away');
      window.dispatchEvent(new Event('keydown'));
      fake.flush();
      expect(realtime.getPresence()[0].status).toBe('active');
      realtime.stop();
    });
  });

  it('a person in a scene shows as in-scene', async () => {
    const player = await join(PLAYER);
    fake.flush();
    player.setStatus('in-scene');
    fake.flush();
    expect(player.getPresence()[0].status).toBe('in-scene');
  });
});

describe('the connection', () => {
  it('starts reconnecting and becomes connected once every channel has joined', async () => {
    const realtime = await join(PLAYER);
    expect(realtime.getConnection()).toBe('reconnecting');
    fake.flush();
    expect(realtime.getConnection()).toBe('connected');
  });

  it('does not count the first connection as a reconnect', async () => {
    const realtime = await join(PLAYER);
    const reconnected = vi.fn();
    realtime.onReconnect(reconnected);
    fake.flush();
    expect(reconnected).not.toHaveBeenCalled();
  });

  it('after a drop: reconnecting, then connected, with one call to refetch', async () => {
    const realtime = await join(PLAYER);
    fake.flush();
    const reconnected = vi.fn();
    realtime.onReconnect(reconnected);
    fake.drop();
    fake.flush();
    expect(realtime.getConnection()).toBe('reconnecting');
    fake.restore();
    fake.flush();
    expect(realtime.getConnection()).toBe('connected');
    expect(reconnected).toHaveBeenCalledOnce();
  });

  it('announces presence again after a rejoin', async () => {
    const dm = await join(DM, true);
    const player = await join(PLAYER);
    fake.flush();
    const track = vi.spyOn(player as unknown as { publishPresence(): void }, 'publishPresence');
    fake.drop();
    fake.restore();
    fake.flush();
    expect(track).toHaveBeenCalled();
    expect(dm.getPresence()).toHaveLength(2);
  });

  it('shows offline when the browser says so, and comes back', async () => {
    const realtime = await join(PLAYER);
    fake.flush();
    const changes = vi.fn();
    realtime.subscribeConnection(changes);
    window.dispatchEvent(new Event('offline'));
    expect(realtime.getConnection()).toBe('offline');
    window.dispatchEvent(new Event('online'));
    expect(realtime.getConnection()).toBe('connected');
    expect(changes).toHaveBeenCalledTimes(2);
    realtime.stop();
  });
});
