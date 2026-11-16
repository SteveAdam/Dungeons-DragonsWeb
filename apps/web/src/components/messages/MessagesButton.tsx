// P4-5: the header's Messages button, with a wax dot when something is unread, and the live listener that keeps threads
// fresh and toasts a message the open panel is not showing.
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../../auth/authContext';
import { useMembers, useMyRole } from '../../hooks/useMembers';
import { useLiveMessages, useThreads } from '../../hooks/useMessages';
import { useMessagePanel } from '../../state/messagePanel';
import { ICON_PROPS, iconClasses } from '../ui';
import styles from './Messages.module.css';

export function MessagesButton({ campaignId }: { campaignId: string }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const role = useMyRole(campaignId);
  const isDm = role.data === 'dm';
  const members = useMembers(campaignId);
  const threads = useThreads(campaignId, !!role.data);
  const { open, setOpen } = useMessagePanel();
  useLiveMessages(campaignId, {
    me,
    isDm,
    nameOf: id => members.data?.find(m => m.userId === id)?.displayName ?? 'A player',
  });

  if (!role.data) return null;
  const unread = (threads.data ?? []).reduce((n, t) => n + t.unread, 0);
  return (
    <button
      type="button"
      className={`${styles.headerButton} ${iconClasses.host}`}
      aria-expanded={open}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      onClick={() => setOpen(!open)}
    >
      <MessageCircle {...ICON_PROPS} className={iconClasses.icon} />
      {isDm ? 'Messages' : 'Message the DM'}
      {unread > 0 && <span className={styles.dot} aria-hidden="true" />}
    </button>
  );
}
