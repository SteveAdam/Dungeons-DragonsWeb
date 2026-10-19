import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface AuthState {
  session: Session | null;
  /** True until the stored session has been read on start-up. */
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
