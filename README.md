# KaizerKlimach — portfolio

Static site for GitHub Pages. Steam and itch.io cards are generated from links only —
a GitHub Action fetches the title, studio, description and screenshots for you. Gallery
images (Misc / Props / Animations / Tiles) live as real files in this repo.

## How it fits together

```
index.html          the public site — reads data/*.json, no editing needed
admin.html           your private dashboard — add links, upload gallery images
assets/app.js        renders cards + screenshot carousels from data/
assets/admin.js      talks to the GitHub API to commit your edits
data/links.json      source of truth: your Steam & itch.io URLs (edit via admin.html)
data/games.json      auto-generated from links.json by the Action — don't hand-edit
data/jams.json       auto-generated from links.json by the Action — don't hand-edit
data/gallery.json    written by admin.html when you upload a gallery image
assets/gallery/…     your actual gallery image files, one folder per category
scripts/fetch-metadata.mjs        the script the Action runs
.github/workflows/sync-metadata.yml   the Action itself
```

## One-time setup

1. **Create the repo.** Push everything in this folder to a new GitHub repo
   (e.g. `KaizerKlimach/portfolio`). Any repo name works.

2. **Enable Pages.** Repo → Settings → Pages → Source → "Deploy from a branch" →
   branch `main`, folder `/ (root)`. Save. Your site will be at
   `https://<username>.github.io/<repo>/` after the first deploy (~1 minute).

3. **Allow the Action to push back.** Repo → Settings → Actions → General →
   "Workflow permissions" → select **Read and write permissions**. This lets
   `sync-metadata.yml` commit the generated `games.json` / `jams.json` using the
   automatic `GITHUB_TOKEN` — no extra secret needed.

4. **First sync.** Go to the Actions tab → "Sync game metadata" → Run workflow,
   to populate `data/games.json` / `data/jams.json` fresh from `data/links.json`
   (the repo already ships with the six Steam titles and five jam games seeded in,
   so this step is optional at the start).

## Using the admin panel day to day

Open `/admin.html` on the live site (or locally). You'll need a **Personal Access
Token** the first time:

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
2. Resource owner: you. Repository access: **only this repo**.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Generate, copy the token, paste it into the admin page's "Connect your repository"
   panel along with your username, the repo name, and branch (`main`).

The token stays in that browser's local storage only — it's never written to the repo.
Anyone who knows your admin page URL but doesn't have the token can't change anything;
treat the token itself like a password.

- **Adding a game or jam entry:** paste the Steam or itch.io page URL and click
  *Add link*. That commits to `data/links.json`, which triggers the Action. Give it
  a minute or two, then refresh the site — the card appears automatically with
  screenshots pulled from the store page.
- **Removing one:** click *Remove* next to it in the same panel.
- **Gallery — work samples:** copy image files into the matching local folder
  (`assets/gallery/misc/`, `props/`, `animations/`, or `tiles/`) and `git push` as
  usual — no admin form needed for the files themselves. Then open `/admin.html`
  and click **Scan repository**: it lists what's actually in those four folders on
  GitHub and rewrites `data/gallery.json` to match. Run it again any time you add,
  rename, or delete files. Titles default to the filename (dashes/underscores
  turned into spaces) — edit them in the admin page and click *Save titles*; a
  later rescan keeps your edited titles for any file whose path hasn't changed.

## Notes & limits

- This is a static site — there's no database and no real login system. The
  "admin" page is just a convenience UI for making commits through GitHub's API;
  actual security is whatever access your GitHub token grants.
- The Action re-fetches Steam/itch data weekly on its own (Monday mornings) in
  case a description or screenshot changes upstream, and also on demand whenever
  `data/links.json` changes.
- If a fetch fails for one link (site down, rate-limited, etc.) the script keeps
  the previous data for that entry instead of wiping the card.
