// P4-1: the root layout. It stays mounted while the screens inside it change, so the header, the live connection, the
// toasts and (later) the audio keep running across navigation.
import { DoorOpen, SlidersHorizontal, Swords } from 'lucide-react';
import { Link, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/authContext';
import { useLiveCampaign } from '../hooks/useLiveCampaign';
import { usePresence, useConnectionState } from '../hooks/useRealtime';
import styles from '../App.module.css';
import { AudioSlot } from './AudioSlot';
import { ConnectionIndicator } from './ConnectionIndicator';
import { DisplaySettingsControls } from './DisplaySettingsControls';
import { DmModeIndicator } from './DmModeIndicator';
import { HeaderClock } from './HeaderClock';
import { HeaderPresence } from './PresenceList';
import { SrdAttribution } from './SrdAttribution';
import { ToastRegion } from './ToastRegion';
import { DeskFrame, ICON_PROPS, IconLink, iconClasses } from './ui';

function LiveCampaign({ campaignId }: { campaignId: string }) {
  useLiveCampaign(campaignId);
  return null;
}

function LiveStatus() {
  const people = usePresence();
  const connection = useConnectionState();
  return (
    <>
      <HeaderPresence people={people} />
      {connection && <ConnectionIndicator state={connection} />}
    </>
  );
}

function HeaderActions({ campaignId }: { campaignId: string | undefined }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <nav aria-label="Main" className={styles.nav}>
      {session && campaignId && <HeaderClock campaignId={campaignId} />}
      <DmModeIndicator />
      <LiveStatus />
      <IconLink to="/campaigns" icon={Swords}>
        Campaigns
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

export function AppShell() {
  const { session } = useAuth();
  const campaignId = useMatch('/campaigns/:campaignId/*')?.params.campaignId;
  return (
    <>
      <DeskFrame
        brand={<Link to="/">D&D MANAGER</Link>}
        actions={<HeaderActions campaignId={campaignId} />}
        footer={<SrdAttribution />}
      >
        <Outlet />
      </DeskFrame>
      {session && campaignId && <LiveCampaign campaignId={campaignId} />}
      <ToastRegion />
      <AudioSlot />
    </>
  );
}
