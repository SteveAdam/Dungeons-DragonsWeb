import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

vi.mock('../auth/authContext', () => ({ useAuth: () => ({ session: null }) }));

describe('home page', () => {
  it('shows the rules engine odds for a +3 check against DC 14 (P1-1 acceptance 3)', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Odds check: a +3 check against DC 14 succeeds 50% of the time.')).toBeInTheDocument();
  });
});
