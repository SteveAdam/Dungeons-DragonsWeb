import { QueryClient } from '@tanstack/react-query';
import { toDataError } from '../data/errors';

/** Only a dropped connection is worth retrying. A wrong code or a missing campaign will not fix itself. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return toDataError(error).kind === 'network' && failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}
