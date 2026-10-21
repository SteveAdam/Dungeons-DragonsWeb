import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataError, friendlyMessage, toDataError } from './errors';

afterEach(() => vi.restoreAllMocks());

describe('toDataError', () => {
  it('recognises a wrong invite code', () => {
    const e = toDataError({ code: 'P0001', message: 'Invalid invite code' });
    expect(e.kind).toBe('invalid-code');
    expect(e.message).toMatch(/does not match any campaign/);
  });
  it.each([
    ['Sign in first', undefined],
    ['anything', 401],
  ])('recognises a signed-out user (%s, %s)', (message, status) => {
    expect(toDataError({ message, status }).kind).toBe('signed-out');
  });
  it('maps database codes', () => {
    expect(toDataError({ code: '42501', message: 'x' }).kind).toBe('forbidden');
    expect(toDataError({ code: 'PGRST116', message: 'x' }).kind).toBe('not-found');
    expect(toDataError({ code: '23514', message: 'x' }).kind).toBe('validation');
  });
  it.each([
    'TypeError: Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
    'fetch failed',
  ])('recognises a network failure: %s', message => expect(toDataError({ message }).kind).toBe('network'));
  it('treats an unknown error as a network problem when the browser is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(toDataError({ message: 'something odd' }).kind).toBe('network');
  });
  it('falls back to unknown, including for empty values', () => {
    expect(toDataError({ message: 'something odd' }).kind).toBe('unknown');
    expect(toDataError(null).kind).toBe('unknown');
    expect(toDataError(undefined).kind).toBe('unknown');
  });
  it('passes a DataError through unchanged', () => {
    const original = new DataError('validation', 'Custom text');
    expect(toDataError(original)).toBe(original);
  });
});

describe('friendlyMessage', () => {
  it('never shows raw database text to the user', () => {
    const text = friendlyMessage({ message: 'relation "campaign_secrets" violates row-level security policy' });
    expect(text).not.toMatch(/campaign_secrets|row-level/);
    expect(text).toBe('Something went wrong. Please try again.');
  });
});
