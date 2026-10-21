import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DmBanner } from './DmBanner';

describe('DmBanner', () => {
  it('says in words that DM mode is on, with the rule hidden from screen readers', () => {
    const { container } = render(<DmBanner />);
    expect(screen.getByRole('note', { name: 'DM mode is on' })).toHaveTextContent('DM mode');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });
});
