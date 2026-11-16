// P4-4: a handout, read in full. Text is plain text with its line breaks (React escapes it: it is never HTML). An image
// can be zoomed and then scrolled inside the card.
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import type { Handout } from '../../data/handouts';
import { friendlyMessage } from '../../data/errors';
import { useHandoutImageUrl } from '../../hooks/useHandouts';
import type { HandoutImageStore } from '../../lib/storage';
import { Button, ICON_PROPS, iconClasses } from '../ui';
import { HandoutDialog } from './HandoutDialog';
import styles from './Handouts.module.css';

const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;

export function HandoutImage({
  path,
  alt,
  store,
  className,
}: {
  path: string;
  alt: string;
  store?: HandoutImageStore;
  className?: string;
}) {
  const url = useHandoutImageUrl(path, store);
  if (url.isError) return <p role="alert">{friendlyMessage(url.error)}</p>;
  if (!url.data) return <p className={styles.muted}>Unrolling the image…</p>;
  return <img src={url.data} alt={alt} className={className} />;
}

export function HandoutBody({ handout, store }: { handout: Handout; store?: HandoutImageStore }) {
  const [zoom, setZoom] = useState(0);
  if (handout.kind === 'text') return <p className={styles.text}>{handout.body}</p>;
  return (
    <>
      <div className={styles.zoomBar} role="group" aria-label="Zoom">
        <Button
          variant="ghost"
          className={iconClasses.host}
          disabled={zoom === 0}
          onClick={() => setZoom(z => Math.max(0, z - 1))}
        >
          <ZoomOut {...ICON_PROPS} className={iconClasses.icon} />
          Zoom out
        </Button>
        <span aria-live="polite">{`${Math.round(ZOOM_STEPS[zoom] * 100)}%`}</span>
        <Button
          variant="ghost"
          className={iconClasses.host}
          disabled={zoom === ZOOM_STEPS.length - 1}
          onClick={() => setZoom(z => Math.min(ZOOM_STEPS.length - 1, z + 1))}
        >
          <ZoomIn {...ICON_PROPS} className={iconClasses.icon} />
          Zoom in
        </Button>
      </div>
      <div className={styles.stage} style={{ '--zoom': ZOOM_STEPS[zoom] } as CSSProperties}>
        {handout.imagePath && <HandoutImage path={handout.imagePath} alt={handout.title} store={store} />}
      </div>
      {handout.body && <p className={styles.caption}>{handout.body}</p>}
    </>
  );
}

export function HandoutViewer({
  handout,
  onClose,
  store,
}: {
  handout: Handout;
  onClose: () => void;
  store?: HandoutImageStore;
}) {
  return (
    <HandoutDialog title={handout.title} kicker="Handout" onClose={onClose} wide={handout.kind === 'image'}>
      <HandoutBody handout={handout} store={store} />
      <div className={styles.actions}>
        <Button data-autofocus onClick={onClose}>
          Done
        </Button>
      </div>
    </HandoutDialog>
  );
}
