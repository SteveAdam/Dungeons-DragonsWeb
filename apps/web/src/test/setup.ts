import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// findBy… and waitFor give up after 1 s by default; with every test file running in parallel (and Docker busy)
// a page can take longer than that to settle, which made tests fail at random
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

// No test talks to a real server: a realtime subscription that slips through a mock gets a socket that never
// connects, instead of opening a connection to whatever Supabase URL is configured.
class OfflineWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly readyState = 0;
  readonly url: string;
  constructor(url: string | URL) {
    super();
    this.url = String(url);
  }
  send() {}
  close() {}
}
globalThis.WebSocket = OfflineWebSocket as unknown as typeof WebSocket;
