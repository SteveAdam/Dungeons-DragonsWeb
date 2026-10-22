import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// findBy… and waitFor give up after 1 s by default; with every test file running in parallel (and Docker busy)
// a page can take longer than that to settle, which made tests fail at random
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
