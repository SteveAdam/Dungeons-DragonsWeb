// Shared icon classes, for controls that are not links (tabs, menu buttons): put `host` on the control and
// `icon` on the lucide icon inside it to get the same swing as IconLink.
import type { LucideIcon } from 'lucide-react';
import styles from './Icon.module.css';

export const iconClasses = { host: styles.host, icon: styles.icon };
export type { LucideIcon };

/** Size and stroke shared by every interface icon, so they read as one set. */
export const ICON_PROPS = { size: '1.15em', strokeWidth: 1.75, 'aria-hidden': true } as const;
