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

One change from the PDF text: in `attribution.txt` the licence URL was broken over two lines in the PDF
(`4.0/ legalcode`); the space is removed.
