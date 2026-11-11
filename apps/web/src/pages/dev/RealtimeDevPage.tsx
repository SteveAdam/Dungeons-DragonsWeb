// Development only (P4-1): sends test events and tries real channel joins, for the two-window test and the e2e test.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Paper } from '../../components/ui';
import { useMembers } from '../../hooks/useMembers';
import { useRealtime, useRealtimeEvent } from '../../hooks/useRealtime';
import { probeTopic } from '../../lib/realtime/probe';
import type { SendTarget } from '../../lib/realtime';

export default function RealtimeDevPage() {
  const { campaignId = '' } = useParams();
  const realtime = useRealtime();
  const members = useMembers(campaignId);
  const [heard, setHeard] = useState<string[]>([]);
  const [sent, setSent] = useState('');
  const [probes, setProbes] = useState<Record<string, string>>({});

  useRealtimeEvent('toast', (payload, meta) => setHeard(h => [...h, `${payload.message} (from ${meta.senderRole})`]));

  async function send(target: SendTarget, message: string) {
    const result = await realtime?.send(target, 'toast', { message });
    setSent(result?.ok ? `Sent: ${message}` : `Not sent: ${result?.reason ?? 'no connection'}`);
  }

  async function probe(label: string, topic: string) {
    setProbes(p => ({ ...p, [label]: 'trying' }));
    const answer = await probeTopic(topic);
    setProbes(p => ({ ...p, [label]: answer }));
  }

  const other = members.data?.find(m => m.userId !== realtime?.userId);
  const topics: [string, string][] = [
    ['campaign', `campaign:${campaignId}`],
    ['dm', `dm:${campaignId}`],
    ['own user', `user:${campaignId}:${realtime?.userId ?? ''}`],
    ['other user', `user:${campaignId}:${other?.userId ?? ''}`],
  ];

  return (
    <Paper as="main" texture="flat" style={{ margin: '1.5rem', padding: '1.5rem', color: 'var(--ink)' }}>
      <h1>Realtime test bench</h1>
      <p>You are {realtime ? (realtime.isDm ? 'a DM' : 'a player') : 'not connected'}.</p>
      <Button onClick={() => void send('campaign', 'Hello, table')}>Send to the table</Button>{' '}
      <Button onClick={() => void send('dm', 'For DM eyes only')}>Send to DMs only</Button>
      <p role="status">{sent}</p>
      <h2>Heard</h2>
      <ul aria-label="Heard">
        {heard.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
      <h2>Try joining</h2>
      <ul aria-label="Joins">
        {topics.map(([label, topic]) => (
          <li key={label}>
            <Button variant="ghost" onClick={() => void probe(label, topic)}>
              Try {label}
            </Button>{' '}
            <span data-testid={`probe-${label}`}>{probes[label] ?? ''}</span>
          </li>
        ))}
      </ul>
    </Paper>
  );
}
