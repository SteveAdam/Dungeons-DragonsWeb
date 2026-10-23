// Before the scenario: the local stack answers, the Edge Functions are served, and the SRD is imported (the import
// is an upsert, so running it again changes nothing).
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localStack } from './stack';

const FUNCTIONS = ['roll', 'create-character', 'apply-level-up'];

export default async function globalSetup() {
  const stack = localStack();
  for (const fn of FUNCTIONS) {
    const r = await fetch(`${stack.url}/functions/v1/${fn}`, { method: 'OPTIONS' }).catch(() => null);
    if (!r?.ok) {
      throw new Error(
        `The ${fn} Edge Function is not answering at ${stack.url}: start them with pnpm functions:serve.`,
      );
    }
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  execSync('pnpm srd:import', { cwd: root, stdio: 'inherit' });
}
