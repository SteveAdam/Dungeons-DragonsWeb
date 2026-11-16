import { describe, expect, it, vi } from 'vitest';
import { createFakeHandoutImageStore } from '../lib/storage/handoutImages';
import { createHandout, HANDOUT_BODY_MAX, isNewFor, type Handout } from './handouts';

// Every case here is refused before anything reaches the server, so no Supabase stand-in is needed.
describe('createHandout refuses before uploading or saving', () => {
  const store = () => {
    const fake = createFakeHandoutImageStore();
    vi.spyOn(fake, 'upload');
    return fake;
  };

  it('a handout without a title', async () => {
    const s = store();
    await expect(createHandout('c1', { title: '   ', kind: 'text', body: 'x' }, s)).rejects.toMatchObject({
      kind: 'validation',
      message: 'Give the handout a title of 1 to 120 characters.',
    });
    expect(s.upload).not.toHaveBeenCalled();
  });

  it('a text handout with no text', async () => {
    await expect(createHandout('c1', { title: 'Riddle', kind: 'text', body: ' \n ' }, store())).rejects.toMatchObject({
      message: 'Write the handout’s text.',
    });
  });

  it('text longer than 8,000 characters', async () => {
    await expect(
      createHandout('c1', { title: 'Saga', kind: 'text', body: 'a'.repeat(HANDOUT_BODY_MAX + 1) }, store()),
    ).rejects.toMatchObject({ message: 'A handout’s text can be at most 8,000 characters.' });
  });

  it('an image handout without an image', async () => {
    const s = store();
    await expect(createHandout('c1', { title: 'Map', kind: 'image', body: '' }, s)).rejects.toMatchObject({
      message: 'Choose an image for the handout.',
    });
    expect(s.upload).not.toHaveBeenCalled();
  });

  it('an image of the wrong type', async () => {
    const s = store();
    await expect(
      createHandout(
        'c1',
        { title: 'Map', kind: 'image', body: '', image: new File(['<svg/>'], 'm.svg', { type: 'image/svg+xml' }) },
        s,
      ),
    ).rejects.toMatchObject({ kind: 'validation' });
    expect(s.files.size).toBe(0);
  });
});

describe('isNewFor', () => {
  const h = (seenAt: string | null): Handout => ({
    id: 'h',
    campaignId: 'c1',
    title: 'T',
    kind: 'text',
    body: 'b',
    imagePath: null,
    createdAt: '',
    shares: [{ userId: 'me', sharedAt: '', seenAt }],
  });

  it('is new for its player until opened', () => {
    expect(isNewFor(h(null), 'me')).toBe(true);
    expect(isNewFor(h('2026-11-14T10:00:00Z'), 'me')).toBe(false);
  });

  it('is never new for someone it was not shown to', () => {
    expect(isNewFor(h(null), 'someone-else')).toBe(false);
    expect(isNewFor(h(null), undefined)).toBe(false);
  });
});
