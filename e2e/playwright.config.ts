// P2-12: the Phase 2 end-to-end test runs against the local Supabase stack (pnpm db:start), with the Edge
// Functions served (pnpm functions:serve) and the app's dev server started here, pointed at that stack. It never
// touches the hosted project: the stack's own URL and publishable key override apps/web/.env.
import { defineConfig } from '@playwright/test';
import { localStack } from './stack';

const stack = localStack();
const PORT = 5174;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // one scenario, with three people in it: run it alone
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  webServer: {
    command: `pnpm -C ../apps/web exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: stack.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: stack.anonKey,
    },
  },
});
