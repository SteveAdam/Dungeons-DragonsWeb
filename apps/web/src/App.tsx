import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './auth/LoginPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoadingRunes } from './components/LoadingRunes';
import { CampaignHubPage } from './pages/CampaignHubPage';
import { CampaignListPage } from './pages/CampaignListPage';
import { HomePage } from './pages/HomePage';

// /theme exists only in development: in a production build import.meta.env.DEV is false,
// so the route and the page's code are dropped.
const ThemePage = import.meta.env.DEV ? lazy(() => import('./pages/ThemePage')) : null;
const OddsDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/OddsDevPage')) : null;
const SrdDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/SrdDevPage')) : null;
const ClassesDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/ClassesDevPage')) : null;
const MonstersDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/MonstersDevPage')) : null;
const RealtimeDevPage = import.meta.env.DEV ? lazy(() => import('./pages/dev/RealtimeDevPage')) : null;
// The map view brings Leaflet; load it only when a map is opened.
const MapViewPage = lazy(() => import('./pages/map/MapViewPage').then(m => ({ default: m.MapViewPage })));
const CharacterSheetPage = lazy(() =>
  import('./pages/characters/CharacterSheetPage').then(m => ({ default: m.CharacterSheetPage })),
);
const CreateCharacterPage = lazy(() => import('./pages/characters/create/CreateCharacterPage'));
const LevelUpPage = lazy(() => import('./pages/characters/levelup/LevelUpPage'));
const LibraryPage = lazy(() => import('./pages/library/LibraryPage'));

export function App() {
  return (
    <Routes>
      {/* P4-1: the shell stays mounted while the screens inside it change */}
      <Route element={<AppShell />}>
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
          path="/campaigns/:campaignId/library"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingRunes>Unlocking the library…</LoadingRunes>}>
                <LibraryPage />
              </Suspense>
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
              <Suspense fallback={<LoadingRunes>Unrolling the map…</LoadingRunes>}>
                <MapViewPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:campaignId/characters/new"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingRunes>Laying out the blank sheet…</LoadingRunes>}>
                <CreateCharacterPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:campaignId/characters/:characterId/level-up"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingRunes>Turning the page…</LoadingRunes>}>
                <LevelUpPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:campaignId/characters/:characterId/:tab?"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingRunes>Unfolding the sheet…</LoadingRunes>}>
                <CharacterSheetPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
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
        {MonstersDevPage && (
          <Route
            path="/dev/monsters"
            element={
              <Suspense fallback={null}>
                <MonstersDevPage />
              </Suspense>
            }
          />
        )}
        {RealtimeDevPage && (
          <Route
            path="/campaigns/:campaignId/dev/realtime"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <RealtimeDevPage />
                </Suspense>
              </ProtectedRoute>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
