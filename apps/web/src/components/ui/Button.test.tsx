import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('is a plain button by default, so it never submits a form by accident', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Seal it</Button>);
    const button = screen.getByRole('button', { name: 'Seal it' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-variant', 'primary');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('supports the ghost variant, submit type and disabled state', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="ghost" type="submit" disabled onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveAttribute('type', 'submit');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
