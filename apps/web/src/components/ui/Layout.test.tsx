import { render, screen } from '@testing-library/react';
import { Map as MapIcon } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Band, Cell, Dice, PageGrid, SectionTitle, StepCard } from './Layout';

describe('the layout kit', () => {
  it('lays cells on the page grid with their spans, halving them on mid-sized screens by default', () => {
    render(
      <PageGrid>
        <Cell span={8} data-testid="spread">
          Spread
        </Cell>
        <Cell span={4} spanMd={6} as="aside" aria-label="Desk">
          Desk
        </Cell>
      </PageGrid>,
    );
    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('spread'));
    expect(screen.getByTestId('spread').style.getPropertyValue('--span')).toBe('8');
    expect(screen.getByTestId('spread').style.getPropertyValue('--span-md')).toBe('4');
    expect(screen.getByRole('complementary', { name: 'Desk' }).style.getPropertyValue('--span-md')).toBe('6');
  });

  it('section titles are real headings', () => {
    render(<SectionTitle>Abilities</SectionTitle>);
    expect(screen.getByRole('heading', { level: 2, name: 'Abilities' })).toBeInTheDocument();
  });

  it('the band joins its items and drops empty ones, and shows nothing with none', () => {
    const { container, rerender } = render(<Band items={['Next session: Friday', null, 'Day 1, 01:01']} />);
    expect(container).toHaveTextContent('Next session: Friday✦ Day 1, 01:01');
    rerender(<Band items={[null]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a step card is a link with its title and text; the number and icon are decoration', () => {
    render(
      <MemoryRouter>
        <StepCard to="/maps" icon={MapIcon} title="Maps" number={1}>
          Five maps
        </StepCard>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /^Maps\s*Five maps$/ });
    expect(link).toHaveAttribute('href', '/maps');
  });

  it('dice are hidden from screen readers', () => {
    const { container } = render(<Dice />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
