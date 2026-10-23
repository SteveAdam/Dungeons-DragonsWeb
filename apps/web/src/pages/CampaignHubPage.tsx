import { ArrowLeft, BookMarked, Feather, Map as MapIcon, ScrollText, Tent, Users, Waypoints } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice } from '../components/ErrorNotice';
import { IconLink, Paper, RibbonTabs, Toggle } from '../components/ui';
import { toDataError } from '../data/errors';
import { ClockWidget } from '../components/ClockWidget';
import { useCampaign, useInviteCode, useLiveClock } from '../hooks/useCampaigns';
import { useDmMode } from '../hooks/useDmMode';
import { useMembers } from '../hooks/useMembers';
import { useShowDmIndicator } from '../state/dmIndicator';
import styles from './CampaignHubPage.module.css';
import { CharactersTab } from './hub/CharactersTab';
import { CodexTab } from './hub/codex/CodexTab';
import { ComingSoonTab } from './hub/ComingSoonTab';
import { MapsTab } from './hub/MapsTab';
import { PartyTab } from './hub/party/PartyTab';
import { PeopleTab } from './hub/PeopleTab';
import { SealedInviteCard } from './hub/SealedInviteCard';

const TABS = [
  { id: 'maps', label: 'Maps', icon: MapIcon },
  { id: 'characters', label: 'Characters', icon: ScrollText },
  { id: 'party', label: 'Party', icon: Tent },
  { id: 'entities', label: 'Codex', icon: BookMarked },
  { id: 'notes', label: 'Notes', icon: Feather },
  { id: 'web', label: 'Web', icon: Waypoints },
  { id: 'people', label: 'People', icon: Users },
] as const;
type TabId = (typeof TABS)[number]['id'];
const isTab = (value: string | undefined): value is TabId => TABS.some(t => t.id === value);

export function CampaignHubPage() {
  const { campaignId, tab } = useParams();
  const navigate = useNavigate();
  const campaign = useCampaign(campaignId);
  const members = useMembers(campaignId);
  const { isDm, dmMode, setDmMode } = useDmMode(campaignId);
  const invite = useInviteCode(campaignId, dmMode);
  useLiveClock(campaignId);
  useShowDmIndicator(dmMode);

  if (!campaignId) return <Navigate to="/campaigns" replace />;
  if (tab !== undefined && !isTab(tab)) return <Navigate to={`/campaigns/${campaignId}/maps`} replace />;
  const activeTab: TabId = isTab(tab) ? tab : 'maps';

  if (campaign.isPending)
    return (
      <p role="status" className={styles.status}>
        Unrolling the chronicle…
      </p>
    );
  if (campaign.isError) {
    return (
      <main className={styles.page}>
        <IconLink to="/campaigns" end icon={ArrowLeft} className={styles.back}>
          All campaigns
        </IconLink>
        <ErrorNotice
          error={campaign.error}
          onRetry={toDataError(campaign.error).kind === 'not-found' ? undefined : () => campaign.refetch()}
        />
      </main>
    );
  }

  const memberLabel = members.isSuccess
    ? `${members.data.length} ${members.data.length === 1 ? 'member' : 'members'}`
    : members.isError
      ? 'members unavailable'
      : 'counting members…';
  const tabLabel = TABS.find(t => t.id === activeTab)?.label ?? '';

  return (
    <>
      <main className={styles.page}>
        <IconLink to="/campaigns" end icon={ArrowLeft} className={styles.back}>
          All campaigns
        </IconLink>

        {/* The scroll: parchment between two wooden rods. */}
        <Paper as="header" className={styles.scroll}>
          <p className={styles.kicker}>The chronicle of</p>
          <h1 className={styles.name}>{campaign.data.name}</h1>
          <p aria-hidden="true" className={styles.ornament}>
            <span>✦</span>
          </p>
          <p className={styles.sub}>{`D&D 5e · ${campaign.data.rulesEdition} rules · ${memberLabel}`}</p>
        </Paper>

        {(isDm || dmMode) && (
          <div className={styles.dmRow}>
            {dmMode && <SealedInviteCard code={invite.data ?? null} loading={invite.isPending} error={invite.error} />}
            {dmMode && <ClockWidget campaignId={campaignId} />}
            {isDm && (
              <div className={styles.dmSwitch}>
                <Toggle checked={dmMode} onChange={setDmMode} label="DM mode" />
                <p className={styles.dmHint}>
                  {dmMode ? 'Switch off to see exactly what players see.' : 'You are previewing the player view.'}
                </p>
              </div>
            )}
          </div>
        )}

        <RibbonTabs
          aria-label="Campaign sections"
          tabs={[...TABS]}
          value={activeTab}
          onChange={id => navigate(`/campaigns/${campaignId}/${id}`)}
        />

        <Paper as="section" texture="flat" role="tabpanel" aria-label={tabLabel} className={styles.panel}>
          {activeTab === 'maps' && <MapsTab campaignId={campaignId} includeHidden={dmMode} />}
          {activeTab === 'characters' && <CharactersTab campaignId={campaignId} />}
          {activeTab === 'party' && <PartyTab campaignId={campaignId} dmMode={dmMode} />}
          {activeTab === 'entities' && <CodexTab campaignId={campaignId} dmMode={dmMode} />}
          {activeTab === 'people' && <PeopleTab campaignId={campaignId} canManage={dmMode} />}
          {activeTab === 'notes' && <ComingSoonTab name="Notes" />}
          {activeTab === 'web' && <ComingSoonTab name="Web" />}
        </Paper>
        <p aria-hidden="true" className={styles.motto}>
          What is hidden shall be found
        </p>
      </main>
    </>
  );
}
