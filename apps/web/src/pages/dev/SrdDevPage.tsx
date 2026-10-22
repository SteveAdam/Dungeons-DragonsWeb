// /dev/srd (development builds only): every SRD weapon and armour record in packages/srd-data, with its source
// tag, laid out like the SRD's own tables so each row can be checked against the SRD by eye.
import { SRD_ARMOR, SRD_CURRENCY, SRD_WEAPONS, type SrdArmor, type SrdWeapon } from '@dnd-manager/srd-data';
import { useId } from 'react';
import { Paper, Tag } from '../../components/ui';
import styles from './SrdDevPage.module.css';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const price = ({ amount, coin }: SrdWeapon['cost']) => `${amount.toLocaleString('en')} ${coin.toUpperCase()}`;
const weight = (lb: number | null) => (lb === null ? '--' : `${lb === 0.25 ? '1/4' : lb} lb.`);

const WEAPON_GROUPS = [
  ['simple', 'melee'],
  ['simple', 'ranged'],
  ['martial', 'melee'],
  ['martial', 'ranged'],
] as const;
const ARMOR_GROUPS: SrdArmor['category'][] = ['light', 'medium', 'heavy', 'shield'];

export default function SrdDevPage() {
  const id = useId();
  return (
    <main className={styles.page}>
      <Paper as="section" texture="flat" aria-labelledby={`${id}-weapons`} className={styles.card}>
        <h1 id={`${id}-weapons`} className={styles.title}>
          SRD weapons ({SRD_WEAPONS.length})
        </h1>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Damage</th>
                <th scope="col">Properties</th>
                <th scope="col">Mastery</th>
                <th scope="col">Weight</th>
                <th scope="col">Cost</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            {WEAPON_GROUPS.map(([category, kind]) => (
              <tbody key={`${category}-${kind}`}>
                <tr>
                  <th scope="rowgroup" colSpan={7} className={styles.group}>
                    {`${capital(category)} ${capital(kind)} Weapons`}
                  </th>
                </tr>
                {SRD_WEAPONS.filter(w => w.category === category && w.kind === kind).map(w => (
                  <tr key={w.id}>
                    <th scope="row">{w.name}</th>
                    <td>{`${w.damage.dice} ${capital(w.damage.type)}`}</td>
                    <td>{w.propertiesText}</td>
                    <td>{capital(w.mastery)}</td>
                    <td>{weight(w.weightLb)}</td>
                    <td>{price(w.cost)}</td>
                    <td>
                      <Tag>{w.source}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Paper>

      <Paper as="section" texture="flat" aria-labelledby={`${id}-armor`} className={styles.card}>
        <h2 id={`${id}-armor`} className={styles.title}>
          SRD armour ({SRD_ARMOR.length})
        </h2>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Armour</th>
                <th scope="col">Armour class</th>
                <th scope="col">Strength</th>
                <th scope="col">Stealth</th>
                <th scope="col">Weight</th>
                <th scope="col">Cost</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            {ARMOR_GROUPS.map(category => {
              const rows = SRD_ARMOR.filter(a => a.category === category);
              return (
                <tbody key={category}>
                  <tr>
                    <th scope="rowgroup" colSpan={7} className={styles.group}>
                      {`${category === 'shield' ? 'Shield' : `${capital(category)} Armor`} (${rows[0]?.donDoff})`}
                    </th>
                  </tr>
                  {rows.map(a => (
                    <tr key={a.id}>
                      <th scope="row">{a.name}</th>
                      <td>{a.acText}</td>
                      <td>{a.strength === null ? '--' : `Str ${a.strength}`}</td>
                      <td>{a.stealthDisadvantage ? 'Disadvantage' : '--'}</td>
                      <td>{weight(a.weightLb)}</td>
                      <td>{price(a.cost)}</td>
                      <td>
                        <Tag>{a.source}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </Paper>

      <Paper as="section" texture="flat" aria-labelledby={`${id}-coins`} className={styles.card}>
        <h2 id={`${id}-coins`} className={styles.title}>
          SRD coins
        </h2>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Coin</th>
                <th scope="col">Value in GP</th>
                <th scope="col">In copper</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {SRD_CURRENCY.coins.map(c => (
                <tr key={c.id}>
                  <th scope="row">{`${c.name} (${c.abbreviation})`}</th>
                  <td>{c.valueInGpText}</td>
                  <td>{c.valueInCp.toLocaleString('en')}</td>
                  <td>
                    <Tag>{c.source}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>{`Fifty coins weigh a pound (${SRD_CURRENCY.coinsPerPound} per pound).`}</p>
      </Paper>
    </main>
  );
}
