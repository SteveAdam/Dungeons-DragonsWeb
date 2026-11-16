import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataError } from '../../data/errors';
import * as membersApi from '../../data/members';
import * as safetyApi from '../../data/safety';
import { useToasts } from '../../state/toasts';
import { PauseBanner } from './PauseBanner';
import { SafetyControls } from './SafetyControls';

vi.mock('../../data/safety', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/safety')>()),
  getTablePause: vi.fn(),
  requestPause: vi.fn(),
  resumeTable: vi.fn(),
}));
vi.mock('../../data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('../../data/members')>()),
  getMyRole: vi.fn(),
}));

const C = 'c1';
function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  useToasts.setState({ toasts: [] });
});

describe('the pause banner', () => {
  it('shows nothing while the table plays on', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(safetyApi.getTablePause).mockResolvedValue(safetyApi.NOT_PAUSED);
    const { container } = wrap(<PauseBanner campaignId={C} />);
    await waitFor(() => expect(safetyApi.getTablePause).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('players see that the table is paused, never who asked, and have no Resume', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(safetyApi.getTablePause).mockResolvedValue({ paused: true, since: null, anonymous: false, name: null });
    wrap(<PauseBanner campaignId={C} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('The table is paused');
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });

  it('the DM is told who asked, and resumes', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('dm');
    vi.mocked(safetyApi.getTablePause).mockResolvedValue({
      paused: true,
      since: '2026-11-16T10:00:00Z',
      anonymous: false,
      name: 'Ana',
    });
    vi.mocked(safetyApi.resumeTable).mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(<PauseBanner campaignId={C} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Pause requested by Ana');
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(safetyApi.resumeTable).toHaveBeenCalledWith(C);
  });

  it('an anonymous X-card shows the DM no name', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('dm');
    vi.mocked(safetyApi.getTablePause).mockResolvedValue({ paused: true, since: null, anonymous: true, name: null });
    wrap(<PauseBanner campaignId={C} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Pause requested: an anonymous X-card');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/ by /);
  });
});

describe('the pause controls', () => {
  it('a player asks for a pause, or plays the X-card, in one press', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(safetyApi.requestPause).mockResolvedValue(undefined);
    const user = userEvent.setup();
    wrap(<SafetyControls campaignId={C} />);
    await user.click(await screen.findByRole('button', { name: 'Anonymous X-card' }));
    expect(safetyApi.requestPause).toHaveBeenCalledWith(C, true);
    await waitFor(() =>
      expect(useToasts.getState().toasts.map(t => t.message)).toEqual([
        'X-card played. The DM is told, without your name.',
      ]),
    );
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(safetyApi.requestPause).toHaveBeenLastCalledWith(C, false);
  });

  it('says so when asked again too soon', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('player');
    vi.mocked(safetyApi.requestPause).mockRejectedValue(
      new DataError('rate-limited', 'You asked for a pause a moment ago. The DM has been told.'),
    );
    const user = userEvent.setup();
    wrap(<SafetyControls campaignId={C} />);
    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(useToasts.getState().toasts.map(t => t.message)).toEqual([
        'You asked for a pause a moment ago. The DM has been told.',
      ]),
    );
  });

  it('the DM has no pause buttons (they have Resume)', async () => {
    vi.mocked(membersApi.getMyRole).mockResolvedValue('dm');
    const { container } = wrap(<SafetyControls campaignId={C} />);
    await waitFor(() => expect(membersApi.getMyRole).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
