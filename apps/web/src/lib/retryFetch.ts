// While the API (PostgREST) reloads its schema cache, after a migration is pushed or when Realtime recreates its
// message partitions, it answers 503 with code PGRST002 to every request for a few seconds. Such a request never
// reached the database, so sending it again is always safe, writes included. This fetch waits and tries again, so
// people see a short pause instead of "Something went wrong".

/** The waits before each new try: about 30 seconds in all, longer than a slow schema reload. */
export const SCHEMA_RELOAD_WAITS_MS = [500, 1000, 2000, 4000, 8000, 15000] as const;

const isSchemaReload = async (response: Response) => {
  if (response.status !== 503) return false;
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  return (body as { code?: unknown } | null)?.code === 'PGRST002';
};

export function createRetryFetch(
  base: typeof fetch = (...args) => fetch(...args),
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  waits: readonly number[] = SCHEMA_RELOAD_WAITS_MS,
): typeof fetch {
  return async (input, init) => {
    // a Request body can be read once: keep a copy to send again
    const request = input instanceof Request ? input : null;
    for (let attempt = 0; ; attempt++) {
      const response = await base(request ? request.clone() : input, init);
      if (attempt >= waits.length || !(await isSchemaReload(response))) return response;
      await response.body?.cancel().catch(() => undefined);
      await wait(waits[attempt]);
    }
  };
}
