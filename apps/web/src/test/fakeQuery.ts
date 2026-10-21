import { vi } from 'vitest';

export interface Result {
  data: unknown;
  error: unknown;
}

/** A stand-in for a Supabase query builder: every method returns itself, and awaiting it gives `result`. */
export function fakeQuery(result: Result) {
  const q: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is', 'order', 'insert', 'delete', 'update', 'upsert'])
    q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  q.single = vi.fn(async () => result);
  q.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<Result>;
}
