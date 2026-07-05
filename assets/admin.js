// assets/admin.js
// This page has no backend of its own — it talks to GitHub's REST API directly
// from the browser, using a Personal Access Token you provide once (stored only
// in this browser's localStorage). Adding a Steam/itch link commits to
// data/links.json, which triggers the "Sync game metadata" GitHub Action.
// Gallery uploads commit the image file itself plus an entry in data/gallery.json.

const CATS = [
  { id: 'misc', label: 'Misc' },
  { id: 'props', label: 'Props' },
  { id: 'animations', label: 'Animations' },
  { id: 'tiles', label: 'Tiles' },
];

const cfg = {
  get owner() { return localStorage.getItem('kk_gh_owner') || ''; },
  set owner(v) { localStorage.setItem('kk_gh_owner', v); },
  get repo() { return localStorage.getItem('kk_gh_repo') || ''; },
  set repo(v) { localStorage.setItem('kk_gh_repo', v); },
  get branch() { return localStorage.getItem('kk_gh_branch') || 'main'; },
  set branch(v) { localStorage.setItem('kk_gh_branch', v); },
  get token() { return localStorage.getItem('kk_gh_token') || ''; },
  set token(v) { localStorage.setItem('kk_gh_token', v); },
};

function ready() {
  return !!(cfg.owner && cfg.repo && cfg.token);
}

// Accepts "KaizerKlimach/KaizerKlimach.github.io", a full github.com URL, or
// plain "owner" / "repo" values pasted separately, and normalizes them.
function sanitizeOwnerRepo(ownerRaw, repoRaw) {
  let owner = (ownerRaw || '').trim();
  let repo = (repoRaw || '').trim();

  // Someone pasted a full URL into either field.
  const urlLike = /github\.com\/([^\/\s]+)\/([^\/\s]+)/i;
  const fromOwner = owner.match(urlLike);
  const fromRepo = repo.match(urlLike);
  if (fromRepo) { owner = fromRepo[1]; repo = fromRepo[2]; }
  else if (fromOwner) { owner = fromOwner[1]; repo = fromOwner[2]; }

  // Strip protocol/domain fragments, leading @ or slashes, trailing slashes, and a stray ".git".
  const clean = s => s
    .replace(/^https?:\/\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^@/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '');

  return { owner: clean(owner), repo: clean(repo) };
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function ghRequest(path, options = {}) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path ? '/' + path : ''}`;
  try {
    return await fetch(url, {
      ...options,
      headers: {
        Authorization: `token ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    // fetch() throws a bare "Failed to fetch" TypeError for anything from a
    // typo'd repo name to an offline connection — surface the actual URL so
    // it's obvious what was attempted.
    throw new Error(`Network request to ${url} failed before getting a response (${err.message}). Check the owner/repo spelling and your connection.`);
  }
}

async function ghGetFile(path) {
  const res = await ghRequest(`contents/${path}?ref=${encodeURIComponent(cfg.branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function ghPutFile(path, contentBase64, message, sha) {
  const body = { message, content: contentBase64, branch: cfg.branch };
  if (sha) body.sha = sha;
  const res = await ghRequest(`contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub PUT ${path} failed: ${res.status} ${err.message || ''}`);
  }
  return res.json();
}



async function ghDeleteFile(path, message, sha) {
  const res = await ghRequest(`contents/${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: cfg.branch }),
  });
  if (!res.ok) throw new Error(`GitHub DELETE ${path} failed: ${res.status}`);
}

async function readJsonFile(path, fallback) {
  const file = await ghGetFile(path);
  if (!file) return { data: fallback, sha: undefined };
  return { data: JSON.parse(base64ToUtf8(file.content)), sha: file.sha };
}

async function writeJsonFile(path, data, message, sha) {
  return ghPutFile(path, utf8ToBase64(JSON.stringify(data, null, 2) + '\n'), message, sha);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- status helpers ---------------- */
function setStatus(el, kind, text) {
  el.className = `status show ${kind}`;
  el.textContent = text;
}
function clearStatus(el) {
  el.className = 'status';
  el.textContent = '';
}

/* ================= SETUP PANEL ================= */
function initSetup() {
  const ownerInput = document.getElementById('cfgOwner');
  const repoInput = document.getElementById('cfgRepo');
  const branchInput = document.getElementById('cfgBranch');
  const tokenInput = document.getElementById('cfgToken');
  const statusEl = document.getElementById('setupStatus');

  ownerInput.value = cfg.owner;
  repoInput.value = cfg.repo;
  branchInput.value = cfg.branch;
  tokenInput.value = cfg.token;

  document.getElementById('saveSetup').addEventListener('click', async () => {
    const { owner, repo } = sanitizeOwnerRepo(ownerInput.value, repoInput.value);
    cfg.owner = owner;
    cfg.repo = repo;
    cfg.branch = branchInput.value.trim() || 'main';
    cfg.token = tokenInput.value.trim();
    ownerInput.value = owner;
    repoInput.value = repo;

    if (!cfg.owner || !cfg.repo || !cfg.token) {
      setStatus(statusEl, 'err', 'Fill in owner, repository name and token first.');
      return;
    }

    setStatus(statusEl, 'pending', `Checking access to ${cfg.owner}/${cfg.repo}…`);
    try {
      const res = await ghRequest('');
      if (res.status === 404) throw new Error(`repo not found — double check "${cfg.owner}/${cfg.repo}" is spelled exactly like the GitHub URL`);
      if (res.status === 401) throw new Error('token was rejected — it may be expired, wrong, or missing "Contents: Read and write" permission');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(statusEl, 'ok', `Connected to ${cfg.owner}/${cfg.repo} (branch: ${cfg.branch}).`);
      refreshAllPanels();
    } catch (err) {
      setStatus(statusEl, 'err', `Could not reach that repo: ${err.message}`);
    }
  });

  if (ready()) initSetup._checked = true;
}

/* ================= LINKS PANEL (Steam / itch) ================= */
function initLinksPanel() {
  const listEl = document.getElementById('linksList');
  const statusEl = document.getElementById('linksStatus');
  const urlInput = document.getElementById('newLinkUrl');
  const addBtn = document.getElementById('addLinkBtn');

  function detectKind(url) {
    if (/store\.steampowered\.com\/app\//i.test(url)) return 'steam';
    if (/\.itch\.io\//i.test(url)) return 'itch';
    return null;
  }

  async function render() {
    listEl.innerHTML = '<p class="empty-note">Loading…</p>';
    if (!ready()) { listEl.innerHTML = '<p class="empty-note">Connect a repository above first.</p>'; return; }
    try {
      const { data } = await readJsonFile('data/links.json', { steam: [], itch: [] });
      listEl.innerHTML = '';
      const all = [...(data.steam || []).map(u => ({ u, kind: 'steam' })), ...(data.itch || []).map(u => ({ u, kind: 'itch' }))];
      if (!all.length) { listEl.innerHTML = '<p class="empty-note">No links yet.</p>'; return; }
      all.forEach(({ u, kind }) => {
        const row = document.createElement('div');
        row.className = 'link-row';
        row.innerHTML = `<span>[${kind}] ${u}</span><button class="btn small danger" type="button">Remove</button>`;
        row.querySelector('button').addEventListener('click', () => removeLink(u, kind));
        listEl.appendChild(row);
      });
    } catch (err) {
      listEl.innerHTML = `<p class="empty-note">Could not load links.json: ${err.message}</p>`;
    }
  }

  async function addLink() {
    const url = urlInput.value.trim();
    if (!url) return;
    const kind = detectKind(url);
    if (!kind) {
      setStatus(statusEl, 'err', 'That does not look like a Steam store or itch.io game URL.');
      return;
    }
    setStatus(statusEl, 'pending', 'Committing to data/links.json…');
    try {
      const { data, sha } = await readJsonFile('data/links.json', { steam: [], itch: [] });
      data.steam = data.steam || [];
      data.itch = data.itch || [];
      const bucket = kind === 'steam' ? data.steam : data.itch;
      if (bucket.includes(url)) {
        setStatus(statusEl, 'err', 'That link is already in the list.');
        return;
      }
      bucket.push(url);
      await writeJsonFile('data/links.json', data, `Add ${kind} link via admin panel`, sha);
      setStatus(statusEl, 'ok', 'Added. The "Sync game metadata" Action will fetch details and publish within a minute or two.');
      urlInput.value = '';
      render();
    } catch (err) {
      setStatus(statusEl, 'err', err.message);
    }
  }

  async function removeLink(url, kind) {
    if (!confirm(`Remove this ${kind} link?\n${url}`)) return;
    setStatus(statusEl, 'pending', 'Removing…');
    try {
      const { data, sha } = await readJsonFile('data/links.json', { steam: [], itch: [] });
      const bucket = kind === 'steam' ? data.steam : data.itch;
      const idx = bucket.indexOf(url);
      if (idx !== -1) bucket.splice(idx, 1);
      await writeJsonFile('data/links.json', data, `Remove ${kind} link via admin panel`, sha);
      setStatus(statusEl, 'ok', 'Removed. It will disappear from the site on the next sync.');
      render();
    } catch (err) {
      setStatus(statusEl, 'err', err.message);
    }
  }

  addBtn.addEventListener('click', addLink);
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addLink(); });

  initLinksPanel.render = render;
}

/* ================= GALLERY PANEL ================= */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

function humanizeFilename(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

function initGalleryPanel() {
  const scanBtn = document.getElementById('galScanBtn');
  const statusEl = document.getElementById('galStatus');
  const gridEl = document.getElementById('galGrid');
  const saveBtn = document.getElementById('galSaveTitlesBtn');

  async function render() {
    gridEl.innerHTML = '';
    saveBtn.style.display = 'none';
    if (!ready()) return;
    try {
      const { data } = await readJsonFile('data/gallery.json', []);
      renderResults(data);
    } catch (err) {
      gridEl.innerHTML = `<p class="empty-note">Could not load gallery.json: ${err.message}</p>`;
    }
  }

  function renderResults(items) {
    gridEl.innerHTML = '';
    if (!items.length) {
      gridEl.innerHTML = '<p class="empty-note">Nothing found yet. Push some images into assets/gallery/&lt;category&gt;/ and click Scan.</p>';
      saveBtn.style.display = 'none';
      return;
    }
    items.forEach((item, i) => {
      const catLabel = (CATS.find(c => c.id === item.category) || {}).label || item.category;
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <img src="${item.path}" alt="">
        <div class="info">
          <input data-title-idx="${i}" value="${(item.title || '').replace(/"/g, '&quot;')}" style="width:100%; background:var(--bg-void); border:1px solid var(--border-pixel); color:var(--fg-main); padding:5px 7px; font-size:.78rem; margin-bottom:3px;">
          <div class="s">${catLabel} · ${item.path}</div>
        </div>`;
      gridEl.appendChild(row);
    });
    saveBtn.style.display = 'inline-flex';
    saveBtn.dataset.count = items.length;
  }

  async function scan() {
    setStatus(statusEl, 'pending', 'Scanning assets/gallery/ folders…');
    try {
      const { data: existing } = await readJsonFile('data/gallery.json', []);
      const titleByPath = new Map(existing.map(it => [it.path, it.title]));

      const results = [];
      for (const cat of CATS) {
        const listRes = await ghRequest(`contents/assets/gallery/${cat.id}?ref=${encodeURIComponent(cfg.branch)}`);
        if (listRes.status === 404) continue;
        if (!listRes.ok) throw new Error(`Could not list assets/gallery/${cat.id}: HTTP ${listRes.status}`);
        const files = await listRes.json();
        files
          .filter(f => f.type === 'file' && IMAGE_EXT.test(f.name))
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach(f => {
            results.push({
              category: cat.id,
              path: f.path,
              title: titleByPath.has(f.path) ? titleByPath.get(f.path) : humanizeFilename(f.name),
            });
          });
      }

      const { sha } = await readJsonFile('data/gallery.json', []);
      await writeJsonFile('data/gallery.json', results, 'Rescan gallery folders via admin panel', sha);
      setStatus(statusEl, 'ok', `Found ${results.length} image(s). Site will update in a minute or two.`);
      renderResults(results);
    } catch (err) {
      setStatus(statusEl, 'err', err.message);
    }
  }

  async function saveTitles() {
    setStatus(statusEl, 'pending', 'Saving titles…');
    try {
      const { data, sha } = await readJsonFile('data/gallery.json', []);
      gridEl.querySelectorAll('[data-title-idx]').forEach(input => {
        const i = parseInt(input.dataset.titleIdx, 10);
        if (data[i]) data[i].title = input.value.trim();
      });
      await writeJsonFile('data/gallery.json', data, 'Update gallery titles via admin panel', sha);
      setStatus(statusEl, 'ok', 'Titles saved.');
    } catch (err) {
      setStatus(statusEl, 'err', err.message);
    }
  }

  scanBtn.addEventListener('click', scan);
  saveBtn.addEventListener('click', saveTitles);
  initGalleryPanel.render = render;
}

function refreshAllPanels() {
  initLinksPanel.render?.();
  initGalleryPanel.render?.();
}

initSetup();
initLinksPanel();
initGalleryPanel();
if (ready()) refreshAllPanels();
