// scripts/scan-gallery.mjs
// Runs inside GitHub Actions on every push that touches assets/gallery/**.
// Reads the four category folders straight off disk (this runs on a checked-out
// copy of the repo, so no GitHub API calls needed) and rewrites data/gallery.json
// to match exactly what's there. Custom titles are preserved for any file whose
// path hasn't changed; new files get a title derived from their filename.

import fs from 'node:fs/promises';
import path from 'node:path';

const CATS = ['misc', 'props', 'animations', 'tiles'];
const GALLERY_ROOT = 'assets/gallery';
const OUTPUT_PATH = 'data/gallery.json';
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

function humanize(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

const existing = await readJson(OUTPUT_PATH, []);
const titleByPath = new Map(existing.map(it => [it.path, it.title]));

const results = [];
for (const cat of CATS) {
  const dir = path.join(GALLERY_ROOT, cat);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    continue; // folder doesn't exist (yet) — skip it
  }
  const names = entries
    .filter(e => e.isFile() && IMAGE_EXT.test(e.name))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));

  for (const name of names) {
    const relPath = `${GALLERY_ROOT}/${cat}/${name}`;
    results.push({
      category: cat,
      path: relPath,
      title: titleByPath.has(relPath) ? titleByPath.get(relPath) : humanize(name),
    });
  }
}

await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2) + '\n');
console.log(`Wrote ${results.length} gallery entries from ${CATS.length} category folders.`);
