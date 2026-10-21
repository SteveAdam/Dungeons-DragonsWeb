import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../data/campaigns';
import * as campaignsApi from '../data/campaigns';
import { DataError } from '../data/errors';
import * as mapsApi from '../data/maps';
import * as membersApi from '../data/members';
import { shouldRetry } from '../lib/queryClient';
import { useDmModeStore } from '../state/dmModeStore';
import { useCampaign, useCampaigns, useCreateCampaign, useInviteCode, useJoinCampaign } from './useCampaigns';
import { useDmMode } from './useDmMode';
import { useMaps } from './useMaps';
import { useMembers, useMyRole } from './useMembers';

// The data layer is mocked, so these tests prove the hooks, not Supabase.
vi.mock('../data/campaigns');
vi.mock('../data/members');
vi.mock('../data/maps');

const campaign: Campaign = {
  id: 'c1',
  name: 'The Sunken Crown',
  rulesEdition: '2024',
  nextSessionAt: null,
  createdAt: '2026-10-18T10:00:00Z',
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useDmModeStore.setState({ dmMode: true });
});

describe('campaign hooks', () => {
  it('useCampaigns returns the list', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([campaign]);
    const { result } = renderHook(() => useCampaigns(), { wrapper: setup().wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([campaign]);
  });

  it('useCampaigns exposes a failure as a DataError', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockRejectedValue(new DataError('network'));
    const { result } = renderHook(() => useCampaigns(), { wrapper: setup().wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ kind: 'network' });
  });

  it('useCampaign does nothing without an id', () => {
    renderHook(() => useCampaign(undefined), { wrapper: setup().wrapper });
    expect(campaignsApi.getCampaign).not.toHaveBeenCalled();
  });

  it('useCreateCampaign creates the campaign and refreshes the list', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(campaignsApi.createCampaign).mockResolvedValue(campaign);
    const { result } = renderHook(() => ({ list: useCampaigns(), create: useCreateCampaign() }), {
      wrapper: setup().wrapper,
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([campaign]);
    await act(() => result.current.create.mutateAsync('The Sunken Crown'));

    expect(campaignsApi.createCampaign).toHaveBeenCalledWith('The Sunken Crown');
    await waitFor(() => expect(result.current.list.data).toEqual([campaign]));
    expect(campaignsApi.listCampaigns).toHaveBeenCalledTimes(2);
  });

  it('useJoinCampaign returns the campaign id and refreshes the list', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(campaignsApi.joinCampaign).mockResolvedValue('c1');
    const { result } = renderHook(() => ({ list: useCampaigns(), join: useJoinCampaign() }), {
      wrapper: setup().wrapper,
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    let joined: string | undefined;
    await act(async () => {
      joined = await result.current.join.mutateAsync('7F3A9C21');
    });
    expect(joined).toBe('c1');
    expect(campaignsApi.joinCampaign).toHaveBeenCalledWith('7F3A9C21');
    await waitFor(() => expect(campaignsApi.listCampaigns).toHaveBeenCalledTimes(2));
  });

  it('useJoinCampaign exposes a wrong code and does not refresh the list', async () => {
    vi.mocked(campaignsApi.listCampaigns).mockResolvedValue([]);
    vi.mocked(campaignsApi.joinCampaign).mockRejectedValue(new DataError('invalid-code'));
    const { result } = renderHook(() => ({ list: useCampaigns(), join: useJoinCampaign() }), {
      wrapper: setup().wrapper,
    });
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    act(() => result.current.join.mutate('WRONG'));
    await waitFor(() => expect(result.current.join.isError).toBe(true));
    expect(result.current.join.error).toMatchObject({ kind: 'invalid-code' });
    expect(campaignsApi.listCampaigns).toHaveBeenCalledTimes(1);
  });

  it('useInviteCode never asks unless enabled', async () => {
    vi.mocked(campaignsApi.getInviteCode).mockResolvedValue('7F3A9C21');
    const { wrapper } = setup();
    const off = renderHook(() => useInviteCode('c1', false), { wrapper });
    expect(off.result.current.fetchStatus).toBe('idle');
    expect(campaignsApi.getInviteCode).not.toHaveBeenCalled();

    const on = renderHook(() => useInviteCode('c1', true), { wrapper });
    await waitFor(() => expect(on.result.current.data).toBe('7F3A9C21'));
  });
});

describe('member and map hooks', () => {
  it('useMembers and useMyRole pass the data through and wait for an id', async () => {
    vi.mocked(membersApi.listMembers).mockResolvedValue([]);
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    const { wrapper } = setup();
    renderHook(() => ({ a: useMembers(undefined), b: useMyRole(undefined) }), { wrapper });
    expect(membersApi.listMembers).not.toHaveBeenCalled();
    expect(membersApi.getMyRole).not.toHaveBeenCalled();

    const { result } = renderHook(() => useMyRole('c1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBe('player'));
  });

  it('useMaps passes includeHidden through and keeps the two answers apart', async () => {
    vi.mocked(mapsApi.listMaps).mockImplementation(async (_id, { includeHidden }) =>
      includeHidden ? [{ id: 'h', name: 'Hidden', imagePath: 'c1/h.png', visibleToPlayers: false, createdAt: '' }] : [],
    );
    const { result, rerender } = renderHook(({ hidden }) => useMaps('c1', hidden), {
      wrapper: setup().wrapper,
      initialProps: { hidden: false },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mapsApi.listMaps).toHaveBeenLastCalledWith('c1', { includeHidden: false });
    expect(result.current.data).toEqual([]);

    rerender({ hidden: true });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mapsApi.listMaps).toHaveBeenLastCalledWith('c1', { includeHidden: true });
  });
});

describe('retry policy', () => {
  it('retries only dropped connections, and only twice', () => {
    expect(shouldRetry(0, new DataError('network'))).toBe(true);
    expect(shouldRetry(1, new DataError('network'))).toBe(true);
    expect(shouldRetry(2, new DataError('network'))).toBe(false);
    expect(shouldRetry(0, new DataError('invalid-code'))).toBe(false);
    expect(shouldRetry(0, new DataError('not-found'))).toBe(false);
    expect(shouldRetry(0, new Error('boom'))).toBe(false);
  });
});

describe('useDmMode', () => {
  const asRole = (role: 'dm' | 'player' | null) => vi.mocked(membersApi.getMyRole).mockResolvedValue(role);

  it('is on for a DM whose preference is on', async () => {
    asRole('dm');
    const { result } = renderHook(() => useDmMode('c1'), { wrapper: setup().wrapper });
    await waitFor(() => expect(result.current.isDm).toBe(true));
    expect(result.current.dmMode).toBe(true);
  });

  it('is never on for a player, whatever the stored preference says', async () => {
    asRole('player');
    useDmModeStore.setState({ dmMode: true });
    const { result } = renderHook(() => useDmMode('c1'), { wrapper: setup().wrapper });
    await waitFor(() => expect(result.current.roleLoading).toBe(false));
    expect(result.current.isDm).toBe(false);
    expect(result.current.dmMode).toBe(false);
  });

  it('is off while the role is still loading, so nothing leaks early', () => {
    vi.mocked(membersApi.getMyRole).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDmMode('c1'), { wrapper: setup().wrapper });
    expect(result.current.dmMode).toBe(false);
  });

  it('follows the switch, shares one store across hooks, and is saved in localStorage', async () => {
    asRole('dm');
    const { wrapper } = setup();
    const first = renderHook(() => useDmMode('c1'), { wrapper });
    const second = renderHook(() => useDmMode('c1'), { wrapper });
    await waitFor(() => expect(first.result.current.isDm).toBe(true));

    act(() => first.result.current.setDmMode(false));
    expect(first.result.current.dmMode).toBe(false);
    expect(second.result.current.dmMode).toBe(false);
    expect(JSON.parse(localStorage.getItem('dm-manager:dm-mode') ?? '{}').state.dmMode).toBe(false);
  });
});
