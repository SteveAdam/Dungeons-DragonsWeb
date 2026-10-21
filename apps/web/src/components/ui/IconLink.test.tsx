import { render, screen } from '@testing-library/react';
import { Swords } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { IconLink } from './IconLink';

describe('IconLink', () => {
  it('is a link named by its text, with the icon hidden from screen readers', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <IconLink to="/campaigns" icon={Swords}>
          Campaigns
        </IconLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Campaigns' });
    expect(link).toHaveAttribute('href', '/campaigns');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('marks the current page', () => {
    render(
      <MemoryRouter initialEntries={['/campaigns']}>
        <IconLink to="/campaigns" icon={Swords}>
          Campaigns
        </IconLink>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Campaigns' })).toHaveAttribute('aria-current', 'page');
  });
});
