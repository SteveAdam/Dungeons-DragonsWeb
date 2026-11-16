// P4-4: the DM's ping controls on the map: mute one player's pings for the session (12 hours, or until unmuted). Whether
// players may ping at all is a table rule on the campaign page. The database refuses a muted player's pings.
import { Bell, BellOff, Radio } from 'lucide-react';
import { Button, ICON_PROPS, iconClasses } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { PingMute } from '../../data/pings';
import toolStyles from './MapTools.module.css';

export interface PingMenuProps {
  players: readonly { userId: string; displayName: string }[];
  mutes: readonly PingMute[];
  pingsEnabled: boolean;
  busy: boolean;
  error: unknown;
  onMute: (userId: string, muted: boolean) => void;
}

export function PingMenu({ players, mutes, pingsEnabled, busy, error, onMute }: PingMenuProps) {
  return (
    <details className={toolStyles.layers}>
      <summary className={iconClasses.host}>
        <Radio {...ICON_PROPS} className={iconClasses.icon} />
        Pings
      </summary>
      <div className={toolStyles.layersBody} role="group" aria-label="Player pings">
        {!pingsEnabled && <p className={toolStyles.menuNote}>Player pings are off for this campaign (a table rule).</p>}
        {players.length === 0 ? (
          <p className={toolStyles.menuNote}>No players have joined yet.</p>
        ) : (
          <ul className={toolStyles.menuList}>
            {players.map(p => {
              const muted = mutes.some(m => m.userId === p.userId);
              return (
                <li key={p.userId}>
                  <span>{muted ? `${p.displayName} (muted)` : p.displayName}</span>
                  <Button
                    variant="ghost"
                    className={iconClasses.host}
                    disabled={busy}
                    aria-label={muted ? `Let ${p.displayName} ping again` : `Mute ${p.displayName}'s pings`}
                    onClick={() => onMute(p.userId, !muted)}
                  >
                    {muted ? (
                      <Bell {...ICON_PROPS} className={iconClasses.icon} />
                    ) : (
                      <BellOff {...ICON_PROPS} className={iconClasses.icon} />
                    )}
                    {muted ? 'Unmute' : 'Mute'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <p className={toolStyles.menuNote}>A mute lasts this session: 12 hours, or until you lift it.</p>
        {!!error && (
          <p role="alert" className={toolStyles.menuNote}>
            {friendlyMessage(error)}
          </p>
        )}
      </div>
    </details>
  );
}
