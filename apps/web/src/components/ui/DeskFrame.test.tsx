import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeskFrame } from './DeskFrame';

describe('DeskFrame', () => {
  it('puts the brand and actions in a header bar above the page', () => {
    render(
      <DeskFrame brand="DM Manager" actions={<a href="/campaigns">Campaigns</a>}>
        <main>Page</main>
      </DeskFrame>,
    );
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('DM Manager');
    expect(screen.getByRole('link', { name: 'Campaigns' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Page');
  });

  it('puts the footer under the page', () => {
    render(
      <DeskFrame brand="DM Manager" footer={<p>Small print</p>}>
        <main>Page</main>
      </DeskFrame>,
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Small print');
  });

  it('works without actions', () => {
    render(
      <DeskFrame brand="DM Manager">
        <p>Page</p>
      </DeskFrame>,
    );
    expect(screen.getByRole('banner')).toHaveTextContent('DM Manager');
  });
});
