import {
  ArrowLeft,
  BookMarked,
  CalendarDays,
  Feather,
  Library,
  Map as MapIcon,
  ScrollText,
  Tent,
  Users,
  Waypoints,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ErrorNotice } from '../components/ErrorNotice';
import { Band, Cell, Dice, IconLink, PageGrid, Paper, RibbonTabs, Toggle } from '../components/ui';
import { friendlyMessage, toDataError } from '../data/errors';
import { ClockWidget } from '../components/ClockWidget';
import { WeatherCard } from '../components/WeatherCard';
import { useAuth } from '../auth/authContext';
import { useCharacters } from '../hooks/useCharacters';
import { useCampaign, useInviteCode, useSetOptionalFeats, useSetPrepareAfterRestOnly } from '../hooks/useCampaigns';
import { useDmMode } from '../hooks/useDmMode';
import { useMembers } from '../hooks/useMembers';
import { useCalendar } from '../hooks/useCalendar';
import { calendarClock } from '../lib/gameClock';
import { useShowDmIndicator } from '../state/dmIndicator';
import styles from './CampaignHubPage.module.css';
import { CalendarTab } from './hub/calendar/CalendarTab';
import { NotesTab } from './hub/calendar/NotesTab';
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
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'web', label: 'Web', icon: Waypoints },
  { id: 'people', label: 'People', icon: Users },
] as const;
// the DM's library is a page of its own at /campaigns/:id/library, so the ribbon simply leads there
const LIBRARY_TAB = { id: 'library', label: 'Library', icon: Library };
type TabId = (typeof TABS)[number]['id'];
const isTab = (value: string | undefined): value is TabId => TABS.some(t => t.id === value);

export function CampaignHubPage() {
  const { campaignId, tab } = useParams();
  const navigate = useNavigate();
  const campaign = useCampaign(campaignId);
  const calendar = useCalendar(campaignId);
  const { session } = useAuth();
  const characters = useCharacters(campaignId);
  const myCharacter = characters.data?.find(c => c.ownerId === session?.user.id);
  const members = useMembers(campaignId);
  const { isDm, dmMode, setDmMode } = useDmMode(campaignId);
  const invite = useInviteCode(campaignId, dmMode);
  const feats = useSetOptionalFeats(campaignId ?? '');
  const prepareRule = useSetPrepareAfterRestOnly(campaignId ?? '');
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
      <PageGrid className={styles.page}>
        <Cell>
          <IconLink to="/campaigns" end icon={ArrowLeft} className={styles.back}>
            All campaigns
          </IconLink>
        </Cell>
        <Cell>
          <ErrorNotice
            error={campaign.error}
            onRetry={toDataError(campaign.error).kind === 'not-found' ? undefined : () => campaign.refetch()}
          />
        </Cell>
      </PageGrid>
    );
  }

  const memberLabel = members.isSuccess
    ? `${members.data.length} ${members.data.length === 1 ? 'member' : 'members'}`
    : members.isError
      ? 'members unavailable'
      : 'counting members…';
  const tabLabel = TABS.find(t => t.id === activeTab)?.label ?? '';

  const nextSession = campaign.data.nextSessionAt
    ? new Date(campaign.data.nextSessionAt).toLocaleString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  // In DM mode the desk (invitation and clock) takes the right third of the grid, two rows tall; the table rules sit
  // under the chronicle. Without the desk the chronicle spans the page.
  const desk = dmMode;

  return (
    <>
      <PageGrid className={styles.page}>
        <Cell>
          <IconLink to="/campaigns" end icon={ArrowLeft} className={styles.back}>
            All campaigns
          </IconLink>
        </Cell>

        {/* The chronicle spread: the campaign's title page, left-aligned on the grid. */}
        <Cell as="header" span={desk ? 8 : 12} spanMd={6} className={styles.spreadCell}>
          <Paper className={styles.spread}>
            <p className={styles.kicker}>The chronicle of</p>
            <h1 className={styles.name}>{campaign.data.name}</h1>
            <p aria-hidden="true" className={styles.ornament}>
              <span>✦</span>
            </p>
            <ul className={styles.chips} aria-label="About this campaign">
              <li>{`D&D 5e · ${campaign.data.rulesEdition} rules`}</li>
              <li>{memberLabel}</li>
              <li>{calendarClock(campaign.data.gameSeconds, calendar.data)}</li>
            </ul>
          </Paper>
          <Dice style={{ left: '-0.5rem', bottom: '-1.2rem', transform: 'rotate(-14deg)' }} />
        </Cell>

        {desk && (
          <Cell as="aside" span={4} spanMd={6} aria-label="DM desk" className={styles.desk}>
            <SealedInviteCard code={invite.data ?? null} loading={invite.isPending} error={invite.error} />
            <ClockWidget campaignId={campaignId} />
          </Cell>
        )}

        {isDm && (
          // the switches sit on parchment: ink text never goes straight onto the brick
          <Cell span={desk ? 8 : 12} spanMd={6} className={styles.rulesCell}>
            <Paper as="section" texture="flat" aria-label="Table rules" className={styles.rules}>
              {dmMode && (
                <div className={styles.dmSwitch}>
                  <Toggle
                    checked={campaign.data.optionalFeats ?? false}
                    disabled={feats.isPending}
                    onChange={on => feats.mutate(on)}
                    label="Optional feats"
                  />
                  <p className={styles.dmHint}>
                    {feats.isError
                      ? friendlyMessage(feats.error)
                      : 'Lets players take a feat instead of an Ability Score Improvement (the feats themselves come later).'}
                  </p>
                </div>
              )}
              {dmMode && (
                <div className={styles.dmSwitch}>
                  <Toggle
                    checked={campaign.data.prepareAfterRestOnly ?? true}
                    disabled={prepareRule.isPending}
                    onChange={on => prepareRule.mutate(on)}
                    label="Prepare spells after a rest"
                  />
                  <p className={styles.dmHint}>
                    {prepareRule.isError
                      ? friendlyMessage(prepareRule.error)
                      : 'Players change their prepared spells only after a long rest, before they next cast with a slot.'}
                  </p>
                </div>
              )}
              <div className={styles.dmSwitch}>
                <Toggle checked={dmMode} onChange={setDmMode} label="DM mode" />
                <p className={styles.dmHint}>
                  {dmMode ? 'Switch off to see exactly what players see.' : 'You are previewing the player view.'}
                </p>
              </div>
            </Paper>
          </Cell>
        )}

        <Cell>
          <Band
            items={[
              nextSession ? `Next session: ${nextSession}` : null,
              `In the world it is ${calendarClock(campaign.data.gameSeconds, calendar.data)}`,
            ]}
          />
        </Cell>

        {myCharacter && (
          <Cell>
            <WeatherCard campaignId={campaignId} characterId={myCharacter.id} />
          </Cell>
        )}

        <Cell>
          <RibbonTabs
            aria-label="Campaign sections"
            tabs={dmMode ? [...TABS, LIBRARY_TAB] : [...TABS]}
            value={activeTab}
            onChange={id => navigate(`/campaigns/${campaignId}/${id}`)}
          />
          <Paper as="section" texture="flat" role="tabpanel" aria-label={tabLabel} className={styles.panel}>
            {activeTab === 'maps' && <MapsTab campaignId={campaignId} includeHidden={dmMode} />}
            {activeTab === 'characters' && <CharactersTab campaignId={campaignId} />}
            {activeTab === 'party' && <PartyTab campaignId={campaignId} dmMode={dmMode} />}
            {activeTab === 'entities' && <CodexTab campaignId={campaignId} dmMode={dmMode} />}
            {activeTab === 'people' && <PeopleTab campaignId={campaignId} canManage={dmMode} />}
            {activeTab === 'notes' && <NotesTab campaignId={campaignId} dmMode={dmMode} />}
            {activeTab === 'calendar' && <CalendarTab campaignId={campaignId} dmMode={dmMode} />}
            {activeTab === 'web' && <ComingSoonTab name="Web" />}
          </Paper>
        </Cell>
        <Cell as="p" aria-hidden="true" className={styles.motto}>
          What is hidden shall be found
        </Cell>
      </PageGrid>
    </>
  );
}
