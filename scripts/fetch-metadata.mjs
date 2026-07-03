// scripts/fetch-metadata.mjs
// Reads data/links.json (Steam + itch.io URLs), fetches fresh metadata for each
// (title, studio, description, screenshots) and writes data/games.json / data/jams.json.
// Runs inside GitHub Actions — no CORS issues here since it's server-side Node, not a browser.
//
// If a fetch fails for a given link, the previous entry for that same link is kept
// (so a transient network hiccup never wipes a card). Removing a URL from links.json
// simply drops it from the generated file on the next run.

import fs from 'node:fs/promises';

const LINKS_PATH = 'data/links.json';
const GAMES_PATH = 'data/games.json';
const JAMS_PATH = 'data/jams.json';

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function extractAppId(url) {
  const m = url.match(/\/app\/(\d+)/);
  return m ? m[1] : null;
}

async function fetchSteam(url) {
  const appid = extractAppId(url);
  if (!appid) throw new Error('Could not find an app id in: ' + url);

  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english`);
  if (!res.ok) throw new Error(`Steam API HTTP ${res.status}`);
  const json = await res.json();
  const entry = json[appid];
  if (!entry || !entry.success) throw new Error('Steam appdetails did not return data for ' + url);
  const data = entry.data;

  const studioParts = [];
  if (data.developers?.length) studioParts.push(data.developers.join(', '));
  if (data.publishers?.length && data.publishers.join(',') !== (data.developers || []).join(',')) {
    studioParts.push(data.publishers.join(', '));
  }

  const images = [
    data.header_image,
    ...(data.screenshots || []).slice(0, 4).map(s => s.path_full),
  ].filter(Boolean);

  return {
    title: data.name,
    studio: studioParts.join(' / ') || 'Unknown studio',
    desc: data.short_description || '',
    link: url,
    images,
  };
}

async function fetchItch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; portfolio-bot/1.0)' } });
  if (!res.ok) throw new Error(`itch.io HTTP ${res.status}`);
  const html = await res.text();

  let title = url;
  let studio = 'itch.io';
  const titleTag = html.match(/<title>([^<]+)<\/title>/i);
  if (titleTag) {
    const raw = titleTag[1].trim();
    const byMatch = raw.match(/^(.*?)\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].trim();
      studio = byMatch[2].trim();
    } else {
      title = raw;
    }
  }

  const descMatch =
    html.match(/<meta name="description" content="([^"]*)"/i) ||
    html.match(/<meta property="og:description" content="([^"]*)"/i);
  const desc = descMatch ? descMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'") : '';

  const found = [...html.matchAll(/https:\/\/img\.itch\.zone\/[A-Za-z0-9+/=%]+\/(?:original|\d+x\d+[^"'\s]*)\/[A-Za-z0-9%.]+\.(?:png|jpe?g|gif)/gi)]
    .map(m => m[0]);
  const seen = new Set();
  const images = [];
  for (const src of found) {
    const key = src.split('/').slice(0, 4).join('/'); // dedupe by the base64 hash segment
    if (!seen.has(key)) {
      seen.add(key);
      images.push(src);
    }
    if (images.length >= 5) break;
  }

  return { title, studio, desc, link: url, images };
}

async function syncKind(links, existing, fetcher, label) {
  const byLink = new Map(existing.map(e => [e.link, e]));
  const result = [];
  for (const url of links) {
    try {
      const entry = await fetcher(url);
      if (entry.images.length === 0 && byLink.has(url)) {
        console.warn(`[${label}] no images found for ${url}, keeping previous entry`);
        result.push(byLink.get(url));
      } else {
        result.push(entry);
        console.log(`[${label}] OK — ${entry.title}`);
      }
    } catch (err) {
      console.warn(`[${label}] FAILED for ${url}: ${err.message}`);
      if (byLink.has(url)) {
        console.warn(`[${label}] keeping previous entry for ${url}`);
        result.push(byLink.get(url));
      }
    }
  }
  return result;
}

const links = await readJson(LINKS_PATH, { steam: [], itch: [] });
const existingGames = await readJson(GAMES_PATH, []);
const existingJams = await readJson(JAMS_PATH, []);

const games = await syncKind(links.steam || [], existingGames, fetchSteam, 'steam');
const jams = await syncKind(links.itch || [], existingJams, fetchItch, 'itch');

await fs.writeFile(GAMES_PATH, JSON.stringify(games, null, 2) + '\n');
await fs.writeFile(JAMS_PATH, JSON.stringify(jams, null, 2) + '\n');

console.log(`Wrote ${games.length} Steam entries and ${jams.length} itch.io entries.`);
