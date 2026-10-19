import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/authContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { SignInPage } from './auth/SignInPage';
import { CampaignHubPage } from './pages/CampaignHubPage';
import { CampaignListPage } from './pages/CampaignListPage';
import { SheetDemoPage } from './pages/SheetDemoPage';

function AppHeader() {
  const { session, signOut } = useAuth();
  return (
    <header className="app-header">
      <Link to="/campaigns" className="app-header-brand">DM Manager</Link>
      <nav aria-label="Main" className="app-header-nav">
        <Link to="/campaigns">Campaigns</Link>
        <Link to="/sheet">Character sheet</Link>
        {session && <button type="button" onClick={() => void signOut()}>Sign out</button>}
      </nav>
    </header>
  );
}

export function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<Navigate to="/campaigns" replace />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/campaigns" element={<ProtectedRoute><CampaignListPage /></ProtectedRoute>} />
        <Route path="/campaigns/:campaignId/:tab?" element={<ProtectedRoute><CampaignHubPage /></ProtectedRoute>} />
        <Route path="/sheet" element={<SheetDemoPage />} />
        <Route path="*" element={<Navigate to="/campaigns" replace />} />
      </Routes>
    </>
  );
}

export default App;
