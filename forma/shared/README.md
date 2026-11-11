# shared/

Copies of two files from the repository root, so FORMA can be moved or hosted on its own:

| File | Source | What |
|---|---|---|
| `cat.js` | `../../cat.js` | Exercise catalog `window.CAT`: 11 muscle groups, 14 kinds of equipment, 1045 exercises. |
| `progress.js` | `../../progress.js` | Progress math `window.GymProgress`: what counts as stronger, level-up, trends, records. |

Both are plain browser scripts (not ES modules); `package.json` here marks the folder as CommonJS so Node can
`require` them in tests (`../tests/setup.js`, `../tests/progress.test.cjs`).

Copied on 2026-11-10. If the root file changes, copy it again — the two must stay identical:

```bash
cp ../../cat.js cat.js && cp ../../progress.js progress.js
```

Exercise photos in `../img/ex/` are a copy of the root `img/` (Free Exercise DB; licence unknown — do not add more
without checking).
