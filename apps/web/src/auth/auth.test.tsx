import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from './authContext';
import { AuthProvider } from './AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() } },
}));

type Listener = (event: string, session: Session | null) => void;
let listener: Listener = () => {};
const unsubscribe = vi.fn();
const session = { user: { id: 'u1' } } as Session;

function startWith(initial: Session | null) {
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: initial }, error: null } as never);
  vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((cb: Listener) => {
    listener = cb;
    return { data: { subscription: { unsubscribe } } };
  }) as never);
  vi.mocked(supabase.auth.signOut).mockImplementation((async () => {
    listener('SIGNED_OUT', null);
    return { error: null };
  }) as never);
}

function Who() {
  const { session: current } = useAuth();
  return <p>{`Login page, signed in as ${current?.user.id ?? 'nobody'}`}</p>;
}

function SignOutButton() {
  const { signOut } = useAuth();
  return <button onClick={() => void signOut()}>Sign out</button>;
}

function renderApp(path: string) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<Who />} />
            <Route
              path="/campaigns"
              element={
                <ProtectedRoute>
                  <p>Secret campaigns</p>
                  <SignOutButton />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ProtectedRoute', () => {
  it('waits for the stored session before deciding', () => {
    vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}));
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({ data: { subscription: { unsubscribe } } } as never);
    renderApp('/campaigns');
    expect(screen.getByRole('status')).toHaveTextContent('Checking your seal');
    expect(screen.queryByText('Secret campaigns')).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to /login', async () => {
    startWith(null);
    renderApp('/campaigns');
    expect(await screen.findByText(/^Login page/)).toBeInTheDocument();
    expect(screen.queryByText('Secret campaigns')).not.toBeInTheDocument();
  });

  it('shows the page to a signed-in user', async () => {
    startWith(session);
    renderApp('/campaigns');
    expect(await screen.findByText('Secret campaigns')).toBeInTheDocument();
  });

  it('returns to /login after signing out', async () => {
    startWith(session);
    renderApp('/campaigns');
    const button = await screen.findByRole('button', { name: 'Sign out' });
    await act(async () => {
      button.click();
    });
    expect(await screen.findByText(/^Login page/)).toBeInTheDocument();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});

describe('AuthProvider', () => {
  it('follows sign-in events after start-up', async () => {
    startWith(null);
    renderApp('/campaigns');
    expect(await screen.findByText('Login page, signed in as nobody')).toBeInTheDocument();
    act(() => listener('SIGNED_IN', session));
    await waitFor(() => expect(screen.getByText('Login page, signed in as u1')).toBeInTheDocument());
  });

  it('stops listening when it unmounts', async () => {
    startWith(session);
    const { unmount } = renderApp('/campaigns');
    await screen.findByText('Secret campaigns');
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('useAuth outside the provider fails loudly', () => {
    const Broken = () => {
      useAuth();
      return null;
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Broken />)).toThrow('useAuth must be used inside <AuthProvider>');
  });
});
