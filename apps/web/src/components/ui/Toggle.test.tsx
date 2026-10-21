import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Toggle } from './Toggle';

function Controlled() {
  const [on, setOn] = useState(false);
  return <Toggle checked={on} onChange={setOn} label="DM mode" />;
}

describe('Toggle', () => {
  it('is a labelled switch that flips by click and by keyboard, and says On or Off', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const toggle = screen.getByRole('switch', { name: /DM mode/ });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Off')).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByText('On')).toBeInTheDocument();

    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).not.toBeChecked();
  });
});
