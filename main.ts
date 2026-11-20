// Meridian Heat — entry program for make.fun gta6-01 (Node 22, stdlib only).
//
// The game lives in game/ as plain static files a desktop browser loads
// offline (game/index.html plus its ES modules, three.js vendored under
// game/vendor/, no network request at runtime). This program hands it in:
// it copies game/ and screenshots/ next to this file into the output
// directory and writes dossier.json there with the vendored make.fun
// library. Serve it locally with `node serve.ts`, then open the local URL
// it prints. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(outDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), shotsDir, { recursive: true });
}

// Caps the sealed scorer enforces: keep the dossier text bounded, at most
// four screenshots of at most 256 KiB each, and game/ inside its file and
// byte budgets so the whole output stays under the platform cap.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier written: ${join(outDir, 'dossier.json')}`);
