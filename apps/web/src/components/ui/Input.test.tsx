import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

function Labelled() {
  const [value, setValue] = useState('');
  return (
    <>
      <label htmlFor="name">Name</label>
      <Input id="name" value={value} onChange={e => setValue(e.target.value)} />
    </>
  );
}

describe('Input', () => {
  it('works with a label and takes typing', async () => {
    render(<Labelled />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await userEvent.type(input, 'Brannoc');
    expect(input).toHaveValue('Brannoc');
  });
});
