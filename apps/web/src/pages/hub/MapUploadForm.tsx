import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input, Paper, Toggle } from '../../components/ui';
import { friendlyMessage } from '../../data/errors';
import type { CampaignMap } from '../../data/maps';
import { useUploadMap } from '../../hooks/useMapView';
import {
  downscaleImage,
  downscaleOffer,
  readImageDimensions,
  validateMapImageFile,
  type DownscaleOffer,
} from '../../lib/storage';
import styles from './hub.module.css';

interface Props {
  campaignId: string;
  onUploaded: (map: CampaignMap) => void;
  onCancel: () => void;
}

/** Name + image. Checks the file in the browser first and offers to shrink very wide images. */
export function MapUploadForm({ campaignId, onUploaded, onCancel }: Props) {
  const ids = useId();
  const upload = useUploadMap(campaignId);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [visible, setVisible] = useState(false);
  const [offer, setOffer] = useState<DownscaleOffer | null>(null);
  const [checking, setChecking] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setFile(null);
    setOffer(null);
    setFileError(null);
    upload.reset();
    if (!chosen) return;
    setChecking(true);
    try {
      const type = validateMapImageFile(chosen);
      const size = await readImageDimensions(chosen);
      setFile(chosen);
      setOffer(downscaleOffer(type, size));
      if (!name.trim()) setName(chosen.name.replace(/\.[^.]+$/, '').slice(0, 120));
    } catch (error) {
      setFileError(friendlyMessage(error));
    } finally {
      setChecking(false);
    }
  }

  async function shrink() {
    if (!file || !offer) return;
    setChecking(true);
    try {
      setFile(await downscaleImage(file, offer.to));
      setOffer(null);
    } catch (error) {
      setFileError(friendlyMessage(error));
    } finally {
      setChecking(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || offer) return;
    upload.mutate({ name, file, visibleToPlayers: visible }, { onSuccess: map => onUploaded(map) });
  }

  const busy = checking || upload.isPending;
  return (
    <Paper as="form" texture="flat" aria-labelledby={`${ids}-title`} onSubmit={onSubmit} className={styles.uploadForm}>
      <h3 id={`${ids}-title`} className={styles.uploadTitle}>
        Add a map
      </h3>
      <label htmlFor={`${ids}-file`}>Map image (PNG, JPG, WebP or SVG, up to 25 MB)</label>
      <input
        id={`${ids}-file`}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={onFileChange}
        className={styles.fileInput}
      />
      {fileError && (
        <p role="alert" className={styles.alert}>
          {fileError}
        </p>
      )}
      {offer && (
        <div role="group" aria-label="Image size" className={styles.offer}>
          <p className={styles.offerText}>{offer.message}</p>
          <div className={styles.offerButtons}>
            <Button onClick={shrink} disabled={busy}>{`Shrink to ${offer.to.width} × ${offer.to.height}`}</Button>
            <Button variant="ghost" onClick={() => setOffer(null)} disabled={busy}>
              Keep full size
            </Button>
          </div>
        </div>
      )}
      <label htmlFor={`${ids}-name`}>Map name</label>
      <Input
        id={`${ids}-name`}
        value={name}
        maxLength={120}
        required
        autoComplete="off"
        onChange={e => setName(e.target.value)}
      />
      <Toggle checked={visible} onChange={setVisible} label="Visible to players" />
      <div className={styles.offerButtons}>
        <Button type="submit" disabled={!file || !!offer || busy}>
          {upload.isPending ? 'Uploading…' : checking ? 'Reading the image…' : 'Upload map'}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={upload.isPending}>
          Cancel
        </Button>
      </div>
      {upload.isError && (
        <p role="alert" className={styles.alert}>
          {friendlyMessage(upload.error)}
        </p>
      )}
    </Paper>
  );
}
