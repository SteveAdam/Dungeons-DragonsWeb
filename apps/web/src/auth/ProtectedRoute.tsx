import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './authContext';

/** Renders its children for a signed-in user; sends everyone else to sign in, then back here. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading)
    return (
      <p role="status" className="auth-status">
        Checking your seal…
      </p>
    );
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
