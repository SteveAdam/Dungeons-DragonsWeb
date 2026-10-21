import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Paper } from './Paper';

describe('Paper', () => {
  it('renders the chosen element with its content and attributes', () => {
    render(
      <Paper as="section" aria-label="Notes">
        Hello
      </Paper>,
    );
    const paper = screen.getByRole('region', { name: 'Notes' });
    expect(paper.tagName).toBe('SECTION');
    expect(paper).toHaveTextContent('Hello');
    expect(paper).toHaveAttribute('data-variant', 'flat');
  });

  it('marks the torn variant and keeps extra classes', () => {
    render(
      <Paper variant="torn" className="extra">
        Torn
      </Paper>,
    );
    const paper = screen.getByText('Torn');
    expect(paper).toHaveAttribute('data-variant', 'torn');
    expect(paper.className).toContain('extra');
  });

  it('is worn by default and flat on request', () => {
    render(
      <>
        <Paper>Banner</Paper>
        <Paper texture="flat">Form</Paper>
      </>,
    );
    expect(screen.getByText('Banner')).toHaveAttribute('data-texture', 'full');
    expect(screen.getByText('Form')).toHaveAttribute('data-texture', 'flat');
  });

  it('supports the framed variant', () => {
    render(<Paper variant="framed">Hero</Paper>);
    expect(screen.getByText('Hero')).toHaveAttribute('data-variant', 'framed');
  });
});
