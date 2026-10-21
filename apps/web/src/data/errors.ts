// One error type for the whole data layer, so screens can show a friendly message
// without knowing anything about Supabase.

export type DataErrorKind =
  'invalid-code' | 'network' | 'not-found' | 'forbidden' | 'validation' | 'signed-out' | 'unknown';

const MESSAGES: Record<DataErrorKind, string> = {
  'invalid-code': 'That invite code does not match any campaign. Check it with your DM and try again.',
  network: 'Could not reach the server. Check your connection and try again.',
  'not-found': 'We could not find that campaign. It may have been removed, or you may not be a member.',
  forbidden: 'You are not allowed to do that.',
  validation: 'Please check what you entered and try again.',
  'signed-out': 'Your session has ended. Please sign in again.',
  unknown: 'Something went wrong. Please try again.',
};

export class DataError extends Error {
  readonly kind: DataErrorKind;
  constructor(kind: DataErrorKind, message?: string) {
    super(message ?? MESSAGES[kind]);
    this.name = 'DataError';
    this.kind = kind;
  }
}

const NETWORK_MESSAGE = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;

/** Turns whatever Supabase or the browser threw into a DataError. */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  const e = (error ?? {}) as { message?: string; code?: string; status?: number };
  const message = e.message ?? '';

  if (message === 'Invalid invite code') return new DataError('invalid-code');
  if (message === 'Sign in first' || e.status === 401) return new DataError('signed-out');
  if (e.code === '42501' || e.status === 403) return new DataError('forbidden');
  if (e.code === 'PGRST116') return new DataError('not-found'); // .single() matched no rows
  if (e.code === '23514' || e.code === '22001') return new DataError('validation');
  if (NETWORK_MESSAGE.test(message) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return new DataError('network');
  }
  return new DataError('unknown');
}

export const friendlyMessage = (error: unknown): string => toDataError(error).message;
