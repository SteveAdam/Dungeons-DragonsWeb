import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './Tag';

describe('Tag', () => {
  it('shows its label as text', () => {
    render(<Tag>Hidden from players</Tag>);
    expect(screen.getByText('Hidden from players').tagName).toBe('SPAN');
  });
});
