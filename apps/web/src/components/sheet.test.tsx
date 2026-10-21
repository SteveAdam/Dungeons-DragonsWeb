import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SheetDemoPage } from '../pages/SheetDemoPage';

describe('sheet smoke test', () => {
  it('renders the character header and the DM Manager title', () => {
    render(<SheetDemoPage />);

    expect(screen.getByRole('heading', { name: /Brannoc/i })).toBeTruthy();
    expect(screen.getByText(/Dungeon Master Manager/i)).toBeTruthy();
  });
});
