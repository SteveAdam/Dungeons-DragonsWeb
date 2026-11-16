// P4-5: the messages drawer. A player sees their thread with the DM ("Message the DM"); a DM sees the inbox (every
// player, the last message and how many are unread) and opens one thread at a time. Escape closes it.
import { ArrowLeft, X } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '../../auth/authContext';
import type { ThreadSummary } from '../../data/messages';
import { useMembers, useMyRole } from '../../hooks/useMembers';
import { useThreads } from '../../hooks/useMessages';
import { useMessagePanel } from '../../state/messagePanel';
import { Button, ICON_PROPS, iconClasses, Paper } from '../ui';
import styles from './Messages.module.css';
import { ThreadView } from './ThreadView';

function Inbox({
  players,
  threads,
  me,
  onOpen,
}: {
  players: readonly { userId: string; displayName: string }[];
  threads: readonly ThreadSummary[];
  me: string | undefined;
  onOpen: (playerId: string) => void;
}) {
  if (players.length === 0) return <p className={styles.muted}>No players have joined yet.</p>;
  // players with news first, then the most recent threads, then everyone else by name
  const rows = players
    .map(p => ({ player: p, thread: threads.find(t => t.playerId === p.userId) }))
    .sort(
      (a, b) =>
        (b.thread?.unread ?? 0) - (a.thread?.unread ?? 0) ||
        (b.thread?.lastAt ?? '').localeCompare(a.thread?.lastAt ?? '') ||
        a.player.displayName.localeCompare(b.player.displayName),
    );
  return (
    <ul className={styles.inbox} aria-label="Players">
      {rows.map(({ player, thread }) => (
        <li key={player.userId}>
          <button type="button" className={styles.player} onClick={() => onOpen(player.userId)}>
            <span className={styles.playerName}>{player.displayName}</span>
            {thread && thread.unread > 0 ? (
              <span className={styles.count}>
                {thread.unread}
                <span className="visually-hidden"> unread</span>
              </span>
            ) : (
              <span />
            )}
            <span className={styles.preview}>
              {thread
                ? `${thread.lastSender === me ? 'You: ' : thread.lastSender === player.userId ? '' : 'DM: '}${thread.lastKind === 'whisper' ? 'A whisper: ' : ''}${thread.lastBody}`
                : 'No messages yet'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MessagePanel({ campaignId }: { campaignId: string }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const role = useMyRole(campaignId);
  const isDm = role.data === 'dm';
  const { open, playerId, setOpen, showThread } = useMessagePanel();
  const members = useMembers(campaignId);
  const threads = useThreads(campaignId, open && isDm);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open || !role.data) return null;
  const players = (members.data ?? []).filter(m => m.role === 'player');
  const threadOf = isDm ? playerId : (me ?? null);
  const nameOf = (id: string) => players.find(p => p.userId === id)?.displayName ?? 'A player';
  const title = !isDm ? 'Message the DM' : threadOf ? `Messages with ${nameOf(threadOf)}` : 'Messages';

  return (
    <Paper as="aside" texture="full" aria-label={title} className={styles.panel}>
      <div className={styles.head}>
        {isDm && threadOf && (
          <Button variant="ghost" aria-label="All players" onClick={() => showThread(null)}>
            <ArrowLeft {...ICON_PROPS} />
          </Button>
        )}
        <h2 className={styles.title}>{title}</h2>
        <Button variant="ghost" aria-label="Close messages" className={iconClasses.host} onClick={() => setOpen(false)}>
          <X {...ICON_PROPS} />
        </Button>
      </div>
      {threadOf ? (
        <ThreadView
          key={threadOf}
          campaignId={campaignId}
          playerId={threadOf}
          playerName={nameOf(threadOf)}
          me={me}
          isDm={isDm}
        />
      ) : (
        <div className={styles.body}>
          <Inbox players={players} threads={threads.data ?? []} me={me} onOpen={showThread} />
        </div>
      )}
    </Paper>
  );
}
