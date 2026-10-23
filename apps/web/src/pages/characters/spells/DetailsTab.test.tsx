import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../data/details';
import { DataError } from '../../../data/errors';
import { axeViolations } from '../../../test/axe';
import { DetailsTab } from './DetailsTab';

vi.mock('../../../data/details', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../data/details')>()),
  getDetails: vi.fn(),
  saveDetails: vi.fn(),
}));

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DetailsTab characterId="ch1" campaignId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getDetails).mockResolvedValue({ alignment: 'Neutral good', backstory: 'Apprentice of the tower' });
});

describe('the Details tab (P2-11)', () => {
  it('shows what is stored, as plain text, with every field and its limit', async () => {
    const { container } = show();
    expect(await screen.findByLabelText('Backstory')).toHaveValue('Apprentice of the tower');
    expect(screen.getByLabelText('Alignment')).toHaveValue('Neutral good');
    for (const f of [
      'Age',
      'Height',
      'Weight',
      'Eyes',
      'Skin',
      'Hair',
      'Languages',
      'Allies and organisations',
      'Treasure',
      'Flaws',
    ]) {
      expect(screen.getByLabelText(f)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Age')).toHaveAttribute('maxlength', '40');
    expect(screen.getByText('23 / 8000')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('All saved');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('saves a moment after typing stops, and says so', async () => {
    vi.mocked(api.saveDetails).mockResolvedValue();
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByLabelText('Eyes'), 'grey');
    await user.click(screen.getByRole('radio', { name: 'moon' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(api.saveDetails).toHaveBeenCalledTimes(1);
    expect(api.saveDetails).toHaveBeenCalledWith('ch1', 'c1', {
      alignment: 'Neutral good',
      backstory: 'Apprentice of the tower',
      eyes: 'grey',
      symbol: 'moon',
    });
  });

  it('says when a save fails', async () => {
    vi.mocked(api.saveDetails).mockRejectedValue(new DataError('forbidden'));
    const user = userEvent.setup();
    show();
    await user.type(await screen.findByLabelText('Hair'), 'black');
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Not saved:/);
  });
});
