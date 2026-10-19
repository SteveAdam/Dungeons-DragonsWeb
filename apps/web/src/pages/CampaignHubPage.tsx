import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice } from '../components/ErrorNotice';
import { DmBanner, Paper, RibbonTabs, Toggle } from '../components/ui';
import { toDataError } from '../data/errors';
import { useCampaign, useInviteCode } from '../hooks/useCampaigns';
import { useDmMode } from '../hooks/useDmMode';
import { useMembers } from '../hooks/useMembers';
import styles from './CampaignHubPage.module.css';
import { ComingSoonTab } from './hub/ComingSoonTab';
import { MapsTab } from './hub/MapsTab';
import { PeopleTab } from './hub/PeopleTab';
import { SealedInviteCard } from './hub/SealedInviteCard';

const TABS = [
  { id: 'maps', label: 'Maps' },
  { id: 'notes', label: 'Notes' },
  { id: 'web', label: 'Web' },
  { id: 'people', label: 'People' },
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

  if (!campaignId) return <Navigate to="/campaigns" replace />;
  if (tab !== undefined && !isTab(tab)) return <Navigate to={`/campaigns/${campaignId}/maps`} replace />;
  const activeTab: TabId = isTab(tab) ? tab : 'maps';

  if (campaign.isPending) return <p role="status" className={styles.status}>Unrolling the chronicle…</p>;
  if (campaign.isError) {
    return (
      <main className={styles.page}>
        <Link to="/campaigns" className={styles.back}>← All campaigns</Link>
        <ErrorNotice error={campaign.error} onRetry={toDataError(campaign.error).kind === 'not-found' ? undefined : () => campaign.refetch()} />
      </main>
    );
  }

  const memberLabel = members.isSuccess
    ? `${members.data.length} ${members.data.length === 1 ? 'member' : 'members'}`
    : members.isError ? 'members unavailable' : 'counting members…';
  const tabLabel = TABS.find(t => t.id === activeTab)?.label ?? '';

  return (
    <>
      {dmMode && <DmBanner />}
      <main className={styles.page}>
        <Link to="/campaigns" className={styles.back}>← All campaigns</Link>

        <Paper as="header" variant="torn" className={styles.banner}>
          <div>
            <p className={styles.kicker}>The chronicle of</p>
            <h1 className={styles.name}>{campaign.data.name}</h1>
            <p className={styles.sub}>{`D&D 5e · ${campaign.data.rulesEdition} rules · ${memberLabel}`}</p>
          </div>
          {isDm && <Toggle checked={dmMode} onChange={setDmMode} label="DM mode" />}
        </Paper>

        {dmMode && <SealedInviteCard code={invite.data ?? null} loading={invite.isPending} error={invite.error} />}

        <RibbonTabs
          aria-label="Campaign sections"
          tabs={[...TABS]}
          value={activeTab}
          onChange={id => navigate(`/campaigns/${campaignId}/${id}`)}
        />

        <section role="tabpanel" aria-label={tabLabel} className={styles.panel}>
          {activeTab === 'maps' && <MapsTab campaignId={campaignId} includeHidden={dmMode} />}
          {activeTab === 'people' && <PeopleTab campaignId={campaignId} />}
          {activeTab === 'notes' && <ComingSoonTab name="Notes" />}
          {activeTab === 'web' && <ComingSoonTab name="Web" />}
        </section>
      </main>
    </>
  );
}
