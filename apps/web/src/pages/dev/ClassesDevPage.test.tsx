import { SRD_CLASSES } from '@dnd-manager/srd-data';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../auth/authContext';
import * as srdApi from '../../data/srd';
import { axeViolations } from '../../test/axe';
import ClassesDevPage from './ClassesDevPage';

vi.mock('../../data/srd');

function show(session: AuthState['session']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={{ session, loading: false, signOut: async () => {} }}>
        <ClassesDevPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
const signedIn = { user: { id: 'u1' } } as NonNullable<AuthState['session']>;

describe('/dev/classes', () => {
  it('shows the imported Barbarian: traits, the level 1 to 3 table, features and subclass', async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue(SRD_CLASSES);
    const { container } = show(signedIn);
    expect(await screen.findByRole('heading', { level: 1, name: 'Barbarian srd-5.2' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: 'Hit Point Die D12 per Barbarian level' })).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: '1 +2 Rage, Unarmored Defense, Weapon Mastery 2 +2 2' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: '3 +2 Barbarian Subclass, Primal Knowledge 3 +2 2' })).toBeInTheDocument();
    const frenzy = screen.getByRole('region', { name: 'Level 3: Frenzy' });
    expect(within(frenzy).getByText('mechanics later')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Barbarian Subclass: Path of the Berserker' })).toBeInTheDocument();
    // the Rage bullets are a list
    expect(within(screen.getByRole('region', { name: 'Level 1: Rage' })).getAllByRole('listitem')).toHaveLength(3);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('says what to run when nothing has been imported', async () => {
    vi.mocked(srdApi.listSrdClasses).mockResolvedValue([]);
    show(signedIn);
    expect(await screen.findByText('No classes imported yet. Run pnpm srd:import.')).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in, without querying', () => {
    show(null);
    expect(screen.getByText('Sign in to read the imported SRD classes.')).toBeInTheDocument();
    expect(srdApi.listSrdClasses).not.toHaveBeenCalled();
  });
});
