import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/authContext';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { DisplaySettingsControls } from './components/DisplaySettingsControls';
import { DmModeIndicator } from './components/DmModeIndicator';
import { DeskFrame } from './components/ui';
import { CampaignHubPage } from './pages/CampaignHubPage';
import { CampaignListPage } from './pages/CampaignListPage';
import { HomePage } from './pages/HomePage';
import { SheetDemoPage } from './pages/SheetDemoPage';
import styles from './App.module.css';

// /theme exists only in development: in a production build import.meta.env.DEV is false,
// so the route and the page's code are dropped.
const ThemePage = import.meta.env.DEV ? lazy(() => import('./pages/ThemePage')) : null;

function HeaderActions() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <nav aria-label="Main" className={styles.nav}>
      <DmModeIndicator />
      <Link to="/campaigns">Campaigns</Link>
      <Link to="/sheet">Character sheet</Link>
      <details className={styles.display}>
        <summary>Display</summary>
        <div className={styles.displayMenu}>
          <DisplaySettingsControls />
        </div>
      </details>
      {session && (
        <button
          type="button"
          className={styles.signOut}
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
        >
          Sign out
        </button>
      )}
    </nav>
  );
}

export function App() {
  return (
    <DeskFrame brand={<Link to="/">DM Manager</Link>} actions={<HeaderActions />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/campaigns"
          element={
            <ProtectedRoute>
              <CampaignListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:campaignId/:tab?"
          element={
            <ProtectedRoute>
              <CampaignHubPage />
            </ProtectedRoute>
          }
        />
        <Route path="/sheet" element={<SheetDemoPage />} />
        {ThemePage && (
          <Route
            path="/theme"
            element={
              <Suspense fallback={null}>
                <ThemePage />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DeskFrame>
  );
}

export default App;
