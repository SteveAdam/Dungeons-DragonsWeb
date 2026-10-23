import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // the page tests type into many fields; on a busy machine (Docker running) some need well over the default 5 s
    testTimeout: 30_000,
  },
});
