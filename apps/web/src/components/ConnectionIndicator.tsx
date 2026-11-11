import { RefreshCw, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import type { ConnectionState } from '../lib/realtime';
import styles from './LiveHeader.module.css';
import { ICON_PROPS } from './ui';

const STATES: Record<ConnectionState, { icon: LucideIcon; text: string }> = {
  connected: { icon: Wifi, text: 'Connected' },
  reconnecting: { icon: RefreshCw, text: 'Reconnecting…' },
  offline: { icon: WifiOff, text: 'Offline' },
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const { icon: Icon, text } = STATES[state];
  return (
    <p role="status" className={styles.connection} data-state={state}>
      <Icon {...ICON_PROPS} />
      {text}
    </p>
  );
}
