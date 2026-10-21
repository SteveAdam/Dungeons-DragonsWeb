import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { RibbonTabs } from './RibbonTabs';

const TABS = [
  { id: 'maps', label: 'Maps' },
  { id: 'notes', label: 'Notes' },
  { id: 'people', label: 'People' },
];

function Controlled() {
  const [value, setValue] = useState('maps');
  return <RibbonTabs aria-label="Sections" tabs={TABS} value={value} onChange={setValue} />;
}

describe('RibbonTabs', () => {
  it('marks one tab selected and makes only that one tabbable', () => {
    render(<Controlled />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Maps' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Maps' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('tabindex', '-1');
  });

  it('changes tab by click and by arrow keys, wrapping round', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('tab', { name: 'People' }));
    expect(screen.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Maps' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Maps' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'People' })).toHaveAttribute('aria-selected', 'true');
  });
});
