// P4-5: one thread between the DM and a player, and the box to write in. A DM can send a whisper instead, and keep it in
// the player's private notes. Opening the thread marks the other side's messages read. Text is plain text.
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { friendlyMessage } from '../../data/errors';
import { MESSAGE_MAX, type Message } from '../../data/messages';
import { useMarkThreadRead, useSendMessage, useThread } from '../../hooks/useMessages';
import { Button } from '../ui';
import styles from './Messages.module.css';

interface ThreadViewProps {
  campaignId: string;
  /** The player whose thread this is. */
  playerId: string;
  playerName: string;
  me: string | undefined;
  isDm: boolean;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** The other side's messages that the viewer has not read. */
const unreadFor = (messages: readonly Message[], isDm: boolean, me: string | undefined) =>
  messages.filter(m => m.readAt === null && (isDm ? m.senderId === m.playerId : m.senderId !== me)).length;

export function ThreadView({ campaignId, playerId, playerName, me, isDm }: ThreadViewProps) {
  const id = useId();
  const thread = useThread(campaignId, playerId);
  const send = useSendMessage(campaignId);
  const markRead = useMarkThreadRead(campaignId);
  const [body, setBody] = useState('');
  const [whisper, setWhisper] = useState(false);
  const [saveNote, setSaveNote] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  const messages = thread.data;
  const unread = messages ? unreadFor(messages, isDm, me) : 0;
  const { mutate: mark, isPending: marking } = markRead;
  useEffect(() => {
    if (unread > 0 && !marking) mark(playerId);
  }, [unread, marking, mark, playerId]);

  // the newest message is at the bottom: keep it in view
  useEffect(() => {
    const el = list.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!body.trim() || send.isPending) return;
    send.mutate(
      { playerId, body, kind: whisper ? 'whisper' : 'message', saveNote: whisper && saveNote },
      {
        onSuccess: () => {
          setBody('');
          setWhisper(false);
          setSaveNote(false);
        },
      },
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter (or Cmd+Enter) sends; Enter alone is a new line
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  }

  const who = (m: Message) => (m.senderId === me ? 'You' : m.senderId === m.playerId ? playerName : 'The DM');

  return (
    <>
      <div className={styles.body}>
        {thread.isError ? (
          <p role="alert" className={styles.alert}>
            {friendlyMessage(thread.error)}
          </p>
        ) : !messages ? (
          <p className={styles.muted}>Unrolling the letters…</p>
        ) : messages.length === 0 ? (
          <p className={styles.muted}>
            {isDm
              ? `Nothing yet. Only ${playerName} and the DMs read this thread.`
              : 'Nothing yet. Only you and the DM read this.'}
          </p>
        ) : (
          <ol
            ref={list}
            className={styles.thread}
            aria-label={isDm ? `Messages with ${playerName}` : 'Messages with the DM'}
          >
            {messages.map(m => (
              <li
                key={m.id}
                className={[
                  styles.message,
                  m.senderId === me ? styles.mine : '',
                  m.kind === 'whisper' ? styles.whisper : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.who}>
                  {who(m)} · <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
                </span>
                <p className={styles.text}>
                  {m.kind === 'whisper' && <span className={styles.whisperLabel}>A whisper: </span>}
                  {m.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor={`${id}-body`} className="visually-hidden">
          {isDm ? `Message to ${playerName}` : 'Message to the DM'}
        </label>
        <textarea
          id={`${id}-body`}
          className={styles.textarea}
          value={body}
          maxLength={MESSAGE_MAX}
          placeholder={isDm ? `Write to ${playerName}…` : 'Write to the DM…'}
          onChange={e => setBody(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {isDm && (
          <div className={styles.row}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={whisper}
                onChange={e => {
                  setWhisper(e.target.checked);
                  if (!e.target.checked) setSaveNote(false);
                }}
              />
              Send as a whisper
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={saveNote}
                disabled={!whisper}
                onChange={e => setSaveNote(e.target.checked)}
              />
              {`Also save it to ${playerName}’s private notes`}
            </label>
          </div>
        )}
        {send.isError && (
          <p role="alert" className={styles.alert}>
            {friendlyMessage(send.error)}
          </p>
        )}
        <div className={styles.row}>
          <span
            className={styles.muted}
          >{`${body.length.toLocaleString('en')} / ${MESSAGE_MAX.toLocaleString('en')}`}</span>
          <Button type="submit" disabled={!body.trim() || send.isPending}>
            {send.isPending ? 'Sending…' : whisper ? 'Whisper' : 'Send'}
          </Button>
        </div>
      </form>
    </>
  );
}
