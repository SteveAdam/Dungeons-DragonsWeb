// P2-3: the SRD attribution must be on every page. Every route renders inside the one page layout (DeskFrame),
// which carries it in its footer; this renders each route and looks for it.
import { SRD_ATTRIBUTION } from '@dnd-manager/srd-data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthContext, type AuthState } from './auth/authContext';

type Session = NonNullable<AuthState['session']>;

vi.mock('./data/campaigns', async importOriginal => ({
  ...(await importOriginal<typeof import('./data/campaigns')>()),
  listCampaigns: vi.fn(() => new Promise(() => {})),
  getCampaign: vi.fn(() => new Promise(() => {})),
  // the live game clock (P2-8) would open a realtime connection
  subscribeToClock: vi.fn(() => () => {}),
}));
vi.mock('./data/members', async importOriginal => ({
  ...(await importOriginal<typeof import('./data/members')>()),
  getMyRole: vi.fn(() => new Promise(() => {})),
  listMembers: vi.fn(() => new Promise(() => {})),
}));
vi.mock('./data/characters', async importOriginal => ({
  ...(await importOriginal<typeof import('./data/characters')>()),
  getCharacter: vi.fn(() => new Promise(() => {})),
  listEffects: vi.fn(() => new Promise(() => {})),
}));

const signedIn = { user: { id: 'u1', email: 'player@example.test' } } as Session;

function renderAt(path: string, session: Session | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ session, loading: false, signOut: async () => {} }}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const PAGES = [
  '/',
  '/login',
  '/campaigns',
  '/campaigns/c1',
  '/campaigns/c1/entities',
  '/campaigns/c1/characters/ch1',
  '/sheet',
  '/theme',
  '/dev/odds',
  '/dev/srd',
  '/dev/classes',
  '/no-such-page',
];

describe('the SRD attribution footer', () => {
  it.each(PAGES)('is on %s, signed in or not', async path => {
    for (const session of [signedIn, null]) {
      renderAt(path, session);
      const footer = await screen.findByRole('contentinfo');
      expect(within(footer).getByLabelText('SRD attribution')).toHaveTextContent(SRD_ATTRIBUTION);
      document.body.innerHTML = '';
    }
  });
});
