import styles from './MapTools.module.css';

/** A compass rose in the corner of the map, turned so its N points where the DM says north is. */
export function Compass({ northDegrees }: { northDegrees: number }) {
  return (
    <div
      className={styles.compass}
      role="img"
      aria-label={`Compass: north is ${northDegrees} degrees clockwise from the top`}
    >
      <svg viewBox="-50 -50 100 100" style={{ transform: `rotate(${northDegrees}deg)` }} aria-hidden="true">
        <circle r="44" className={styles.compassRing} />
        <circle r="38" className={styles.compassRingInner} />
        {/* the four long points; north is filled red */}
        <path d="M0 -40 L7 0 L0 7 L-7 0 Z" className={styles.compassNorth} />
        <path d="M0 40 L7 0 L0 -7 L-7 0 Z" className={styles.compassPoint} />
        <path d="M40 0 L0 7 L-7 0 L0 -7 Z" className={styles.compassPoint} />
        <path d="M-40 0 L0 7 L7 0 L0 -7 Z" className={styles.compassPoint} />
        {/* the four short points */}
        <path
          d="M24 -24 L4 0 L0 -4 Z M24 24 L0 4 L4 0 Z M-24 24 L-4 0 L0 4 Z M-24 -24 L0 -4 L-4 0 Z"
          className={styles.compassMinor}
        />
        <text y="-24" className={styles.compassN}>
          N
        </text>
      </svg>
    </div>
  );
}
