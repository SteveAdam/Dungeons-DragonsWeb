// Before the scenario: the local stack answers, the Edge Functions are served, and the SRD is imported (the import
// is an upsert, so running it again changes nothing).
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localStack } from './stack';

const FUNCTIONS = ['roll', 'create-character', 'apply-level-up'];

export default async function globalSetup() {
  const stack = localStack();
  for (const fn of FUNCTIONS) {
    // a local worker restarting answers with an error for a moment, so give it up to a minute
    let r: Response | null = null;
    for (let i = 0; i < 20 && !r?.ok; i++) {
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 3000));
      r = await fetch(`${stack.url}/functions/v1/${fn}`, { method: 'OPTIONS' }).catch(() => null);
    }
    if (!r?.ok) {
      throw new Error(
        `The ${fn} Edge Function is not answering at ${stack.url}: start them with pnpm functions:serve.`,
      );
    }
  }
  // The local runtime compiles a function on its first real request, and can stop that for using too much CPU. Paying
  // for it here keeps it out of the scenario. No token: each answers 401 once it is up.
  for (const fn of FUNCTIONS) {
    let status = 0;
    for (let i = 0; i < 20 && (status === 0 || status >= 500); i++) {
      const r = await fetch(`${stack.url}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { apikey: stack.anonKey, 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => null);
      status = r?.status ?? 0;
      await r?.text();
      if (status === 0 || status >= 500) await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (status === 0 || status >= 500)
      throw new Error(`The ${fn} Edge Function would not start (last answer ${status}).`);
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  execSync('pnpm srd:import', { cwd: root, stdio: 'inherit' });
}
