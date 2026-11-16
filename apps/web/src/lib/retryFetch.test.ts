import { describe, expect, it, vi } from 'vitest';
import { createRetryFetch } from './retryFetch';

const reloading = () =>
  new Response(JSON.stringify({ code: 'PGRST002', message: 'Could not query the database for the schema cache.' }), {
    status: 503,
  });
const ok = () => new Response('[]', { status: 200 });

describe('retrying while the API reloads its schema', () => {
  it('sends a request again after a schema-reload 503, and returns the good answer', async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValueOnce(reloading()).mockResolvedValueOnce(reloading());
    base.mockResolvedValue(ok());
    const waits: number[] = [];
    const retrying = createRetryFetch(base, async ms => void waits.push(ms));
    const r = await retrying('http://api/rest/v1/rpc/create_item', { method: 'POST', body: '{"x":1}' });
    expect(r.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(3);
    // writes too: the refused request never reached the database
    expect(base.mock.calls.every(([, init]) => init?.method === 'POST' && init.body === '{"x":1}')).toBe(true);
    expect(waits).toEqual([500, 1000]);
  });

  it('leaves every other answer alone, other 503s included', async () => {
    const other503 = new Response(JSON.stringify({ code: 'PGRST001' }), { status: 503 });
    for (const answer of [ok(), new Response('no', { status: 500 }), other503, new Response('x', { status: 503 })]) {
      const base = vi.fn<typeof fetch>().mockResolvedValue(answer);
      const r = await createRetryFetch(base, async () => {})('http://api');
      expect(r).toBe(answer);
      expect(base).toHaveBeenCalledTimes(1);
    }
  });

  it('gives up after the last wait, returning the 503', async () => {
    const base = vi.fn<typeof fetch>().mockImplementation(async () => reloading());
    const r = await createRetryFetch(base, async () => {}, [1, 2])('http://api');
    expect(r.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it('sends a Request object again with its body intact', async () => {
    const bodies: string[] = [];
    const base = vi.fn<typeof fetch>().mockImplementation(async input => {
      bodies.push(await (input as Request).text());
      return bodies.length === 1 ? reloading() : ok();
    });
    await createRetryFetch(base, async () => {})(new Request('http://api', { method: 'POST', body: 'hello' }));
    expect(bodies).toEqual(['hello', 'hello']);
  });
});
