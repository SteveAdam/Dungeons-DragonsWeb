// The local Supabase stack's address and keys, read from `supabase status`. Refuses anything that is not local, so
// the end-to-end test can never run against a hosted project.
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface LocalStack {
  url: string;
  anonKey: string;
  serviceKey: string;
}

let cached: LocalStack | undefined;

export function localStack(): LocalStack {
  if (cached) return cached;
  const root = fileURLToPath(new URL('..', import.meta.url));
  const out = execSync('pnpm exec supabase status -o env', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .filter(l => l.includes('='))
      .map(l => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
      }),
  );
  const url = env.API_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url ?? '')) {
    throw new Error(`The end-to-end test runs only against the local stack (pnpm db:start); got ${url ?? 'nothing'}.`);
  }
  cached = { url, anonKey: env.ANON_KEY, serviceKey: env.SERVICE_ROLE_KEY };
  return cached;
}
