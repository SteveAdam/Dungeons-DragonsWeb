# SRD 5.2.1 source text

These files are the SRD 5.2.1's own text (class pages extracted with `-enc UTF-8 -eol unix`, once as flow text and once with `-raw`), copied from the official PDF (Wizards of the Coast, CC-BY-4.0) with
`pdftotext -raw`, so each JSON record in `../data` can be traced back to, and checked against, the line it came from.
`pnpm -C packages/srd-data convert` turns them into the JSON; `pnpm -C packages/srd-data build` checks the JSON still
matches.

| File              | SRD 5.2.1                                           |
| ----------------- | --------------------------------------------------- |
| `attribution.txt` | Legal Information: the attribution statement        |
| `weapons.txt`     | Equipment, page 91: the Weapons table               |
| `armor.txt`       | Equipment, page 92: the Armor table                 |
| `coins.txt`       | Equipment, page 89: Coins and the Coin Values table |
| `classes/barbarian.flow.txt`, `.raw.txt` | Classes, pages 28 to 30: Barbarian and the Path of the Berserker |
| `classes/bard.flow.txt`, `.raw.txt` | Classes, pages 31 to 35: Bard, its spell list and the College of Lore |
| `classes/cleric.flow.txt`, `.raw.txt` | Classes, pages 36 to 40: Cleric, its spell list and the Life Domain |
| `classes/druid.flow.txt`, `.raw.txt` | Classes, pages 41 to 46: Druid, its spell list and the Circle of the Land |
| `classes/fighter.flow.txt`, `.raw.txt` | Classes, pages 47 to 49: Fighter and the Champion |
| `classes/monk.flow.txt`, `.raw.txt` | Classes, pages 49 to 52: Monk and the Warrior of the Open Hand |
| `classes/paladin.flow.txt`, `.raw.txt` | Classes, pages 53 to 57: Paladin, its spell list and the Oath of Devotion |
| `classes/ranger.flow.txt`, `.raw.txt` | Classes, pages 57 to 61: Ranger, its spell list and the Hunter |
| `classes/rogue.flow.txt`, `.raw.txt` | Classes, pages 61 to 64: Rogue and the Thief |
| `classes/sorcerer.flow.txt`, `.raw.txt` | Classes, pages 64 to 70: Sorcerer, Metamagic options, spell list and Draconic Sorcery |
| `classes/warlock.flow.txt`, `.raw.txt` | Classes, pages 70 to 76: Warlock, Eldritch Invocation options, spell list and the Fiend Patron |
| `classes/wizard.flow.txt`, `.raw.txt` | Classes, pages 77 to 82: Wizard, its spell list and the Evoker |
| `species.raw.txt`, `.flow.txt`, `.layout.txt` | Character Origins, pages 83 to 86: the nine species (raw for the traits, flow for where paragraphs end, layout for where table cells split) |
| `feats.raw.txt`, `.flow.txt` | Feats, page 87: the Origin feats the backgrounds give (the backgrounds themselves are on page 83, in `species.raw.txt`) |
| `spells.raw.txt`, `.flow.txt` | Spells, pages 107 to 175: every spell description, Acid Arrow to Zone of Truth (raw for the entries, flow for paragraph ends and for which line-end hyphens are real) |

One change from the PDF text: in `attribution.txt` the licence URL was broken over two lines in the PDF
(`4.0/ legalcode`); the space is removed.
