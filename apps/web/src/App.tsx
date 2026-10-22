import { lazy, Suspense } from 'react';
import { DoorOpen, ScrollText, SlidersHorizontal, Swords } from 'lucide-react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/authContext';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { DisplaySettingsControls } from './components/DisplaySettingsControls';
import { DmModeIndicator } from './components/DmModeIndicator';
import { SrdAttribution } from './components/SrdAttribution';
import { DeskFrame, ICON_PROPS, IconLink, iconClasses } from './components/ui';
import { CampaignHubPage } from './pages/CampaignHubPage';
import { CampaignListPage } from './pages/CampaignListPage';
import { HomePage } from './pages/HomePage';
import { SheetDemoPage } from './pages/SheetDemoPage';
import styles from './App.module.css';

// /theme exists only in development: in a production build import.meta.env.DEV is false,
// so the route and the page's code are dropped.
const ThemePage = import.meta.env.DEV ? lazy(() => import('./pages/ThemePage')) : null;
const OddsDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/OddsDevPage')) : null;
const SrdDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/SrdDevPage')) : null;
const ClassesDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/ClassesDevPage')) : null;
// The map view brings Leaflet; load it only when a map is opened.
const MapViewPage = lazy(() => import('./pages/map/MapViewPage').then(m => ({ default: m.MapViewPage })));
const CharacterSheetPage = lazy(() =>
  import('./pages/characters/CharacterSheetPage').then(m => ({ default: m.CharacterSheetPage })),
);

function HeaderActions() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <nav aria-label="Main" className={styles.nav}>
      <DmModeIndicator />
      <IconLink to="/campaigns" icon={Swords}>
        Campaigns
      </IconLink>
      <IconLink to="/sheet" icon={ScrollText}>
        Character sheet
      </IconLink>
      <details className={styles.display}>
        <summary className={iconClasses.host}>
          <SlidersHorizontal {...ICON_PROPS} className={iconClasses.icon} />
          Display
        </summary>
        <div className={styles.displayMenu}>
          <DisplaySettingsControls />
        </div>
      </details>
      {session && (
        <button
          type="button"
          className={`${styles.signOut} ${iconClasses.host}`}
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
        >
          <DoorOpen {...ICON_PROPS} className={iconClasses.icon} />
          Sign out
        </button>
      )}
    </nav>
  );
}

export function App() {
  return (
    <DeskFrame brand={<Link to="/">D&D MANAGER</Link>} actions={<HeaderActions />} footer={<SrdAttribution />}>
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
        <Route
          path="/campaigns/:campaignId/maps/:mapId"
          element={
            <ProtectedRoute>
              <Suspense fallback={<p className="auth-status">Unrolling the map…</p>}>
                <MapViewPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:campaignId/characters/:characterId"
          element={
            <ProtectedRoute>
              <Suspense fallback={<p className="auth-status">Unfolding the sheet…</p>}>
                <CharacterSheetPage />
              </Suspense>
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
        {OddsDevPage && (
          <Route
            path="/dev/odds"
            element={
              <Suspense fallback={null}>
                <OddsDevPage />
              </Suspense>
            }
          />
        )}
        {SrdDevPage && (
          <Route
            path="/dev/srd"
            element={
              <Suspense fallback={null}>
                <SrdDevPage />
              </Suspense>
            }
          />
        )}
        {ClassesDevPage && (
          <Route
            path="/dev/classes"
            element={
              <Suspense fallback={null}>
                <ClassesDevPage />
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
