import { derive, type SkillKey } from '@dnd-manager/rules-engine';
import { brannoc } from '../sample';

type CharacterSheetProps = {
  potionActive?: boolean;
  onRoll: (title: string, dc: number, bonus: number, advantage?: boolean, disadvantage?: boolean) => void;
};

export function CharacterSheet({ potionActive = false, onRoll }: CharacterSheetProps) {
  const character = derive({
    ...brannoc,
    activeEffects: potionActive ? ['potion-of-heroism'] : [],
  });

  const effectLabel = potionActive ? 'Potion of Heroism is active' : 'Potion of Heroism is inactive';

  return (
    <main className="sheet-shell">
      <header className="sheet-header">
        <div>
          <p className="eyebrow">Dungeon Master Manager</p>
          <h1>{character.name}</h1>
        </div>
        <div className="title-badges">
          <span>{character.className}</span>
          <span>Level {character.level}</span>
        </div>
      </header>

      <section className="stats-grid">
        <div className="vital-card">
          <label>HP</label>
          <strong>{character.hp}</strong>
        </div>
        <div className="vital-card">
          <label>AC</label>
          <strong>{character.armorClass}</strong>
        </div>
        <div className="vital-card">
          <label>Initiative</label>
          <strong>{character.initiative >= 0 ? `+${character.initiative}` : character.initiative}</strong>
        </div>
        <div className="vital-card">
          <label>Proficiency</label>
          <strong>+{character.proficiencyBonus}</strong>
        </div>
      </section>

      <section className="ability-grid">
        {Object.entries(character.abilityModifiers).map(([key, value]) => (
          <div key={key} className="ability-box">
            <span className="ability-name">{key.toUpperCase()}</span>
            <strong>{String(brannoc.abilities[key as keyof typeof brannoc.abilities])}</strong>
            <small>{value >= 0 ? `+${value}` : value}</small>
          </div>
        ))}
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Saving Throws</h2>
          <ul className="text-list">
            <li>Strength +{character.abilityModifiers.str + character.proficiencyBonus}</li>
            <li>Dexterity +{character.abilityModifiers.dex + character.proficiencyBonus}</li>
            <li>Constitution +{character.abilityModifiers.con + character.proficiencyBonus}</li>
            <li>Intelligence +{character.abilityModifiers.int + character.proficiencyBonus}</li>
            <li>Wisdom +{character.abilityModifiers.wis + character.proficiencyBonus}</li>
            <li>Charisma +{character.abilityModifiers.cha + character.proficiencyBonus}</li>
          </ul>
        </article>

        <article className="panel">
          <h2>Skills</h2>
          <ul className="text-list">
            {Object.entries(character.skills).map(([key, value]) => (
              <li key={key}>
                <button
                  type="button"
                  className="skill-button"
                  onClick={() => onRoll(`${(key as SkillKey).replace(/([A-Z])/g, ' $1')}`, 15, value)}
                >
                  {key === 'animalHandling' ? 'Animal Handling' : key.replace(/([A-Z])/g, ' $1')}
                </button>
                <span>{value >= 0 ? `+${value}` : value}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>Attacks</h2>
          {character.attacks.map(attack => (
            <button
              key={attack.label}
              type="button"
              className="attack-row"
              onClick={() => onRoll(attack.label, 15, attack.bonus)}
            >
              <span>{attack.label}</span>
              <strong>{attack.bonus >= 0 ? `+${attack.bonus}` : attack.bonus}</strong>
              <em>{attack.damage}</em>
            </button>
          ))}
        </article>

        <article className="panel">
          <h2>Effects</h2>
          <p className="effect-status">{effectLabel}</p>
          <ul className="text-list">
            <li>Armor class {character.armorClass}</li>
            <li>Passive perception {character.passivePerception}</li>
            <li>Background: {character.background}</li>
          </ul>
        </article>
      </section>
    </main>
  );
}

export default CharacterSheet;
