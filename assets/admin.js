// assets/admin.js
// This page has no backend of its own — it talks to GitHub's REST API directly
// from the browser, using a Personal Access Token you provide once (stored only
// in this browser's localStorage). Adding a Steam/itch link commits to
// data/links.json, which triggers the "Sync game metadata" GitHub Action.
// Gallery uploads commit the image file itself plus an entry in data/gallery.json.

const CATS = [
  { id: 'misc', label: 'Разное' },
  { id: 'props', label: 'Пропсы' },
  { id: 'animations', label: 'Анимации' },
  { id: 'tiles', label: 'Тайлы' },
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

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function ghRequest(path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/${path}`, {
    ...options,
    headers: {
      Authorization: `token ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  });
  return res;
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
    cfg.owner = ownerInput.value.trim();
    cfg.repo = repoInput.value.trim();
    cfg.branch = branchInput.value.trim() || 'main';
    cfg.token = tokenInput.value.trim();
    setStatus(statusEl, 'pending', 'Checking access…');
    try {
      const res = await ghRequest('');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(statusEl, 'ok', `Connected to ${cfg.owner}/${cfg.repo} (branch: ${cfg.branch}).`);
      refreshAllPanels();
    } catch (err) {
      setStatus(statusEl, 'err', `Could not reach that repo with this token: ${err.message}`);
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
function initGalleryPanel() {
  const pillsEl = document.getElementById('galCatPills');
  const fileInput = document.getElementById('galFile');
  const titleInput = document.getElementById('galTitle');
  const uploadBtn = document.getElementById('galUploadBtn');
  const statusEl = document.getElementById('galStatus');
  const gridEl = document.getElementById('galGrid');
  let selectedCat = CATS[0].id;

  pillsEl.innerHTML = CATS.map(c => `<button type="button" class="cat-pill${c.id === selectedCat ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('');
  pillsEl.querySelectorAll('.cat-pill').forEach(p => {
    p.addEventListener('click', () => {
      selectedCat = p.dataset.cat;
      pillsEl.querySelectorAll('.cat-pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
    });
  });

  async function render() {
    gridEl.innerHTML = '';
    if (!ready()) return;
    try {
      const { data } = await readJsonFile('data/gallery.json', []);
      data.forEach((item, i) => {
        const d = document.createElement('div');
        d.className = 'gallery-admin-item';
        d.innerHTML = `<img src="${item.path}" alt=""><button type="button" title="Delete">×</button>`;
        d.querySelector('button').addEventListener('click', () => removeItem(i));
        gridEl.appendChild(d);
      });
    } catch (err) {
      gridEl.innerHTML = `<p class="empty-note">Could not load gallery.json: ${err.message}</p>`;
    }
  }

  async function upload() {
    const file = fileInput.files[0];
    if (!file) { setStatus(statusEl, 'err', 'Choose an image file first.'); return; }
    setStatus(statusEl, 'pending', 'Uploading image…');
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9.\-]/g, '_');
      const path = `assets/gallery/${selectedCat}/${Date.now()}-${safe}`;
      const base64 = await fileToBase64(file);
      await ghPutFile(path, base64, `Add gallery image: ${safe}`);

      setStatus(statusEl, 'pending', 'Updating gallery.json…');
      const { data, sha } = await readJsonFile('data/gallery.json', []);
      data.push({ category: selectedCat, title: titleInput.value.trim(), path });
      await writeJsonFile('data/gallery.json', data, `Add gallery entry: ${safe}`, sha);

      setStatus(statusEl, 'ok', 'Uploaded. GitHub Pages will rebuild automatically in a minute or two.');
      fileInput.value = '';
      titleInput.value = '';
      render();
    } catch (err) {
      setStatus(statusEl, 'err', err.message);
    }
  }

  async function removeItem(index) {
    if (!confirm('Delete this gallery image? This removes the file from the repo too.')) return;
    setStatus(statusEl, 'pending', 'Removing…');
    try {
      const { data, sha } = await readJsonFile('data/gallery.json', []);
      const item = data[index];
      data.splice(index, 1);
      await writeJsonFile('data/gallery.json', data, `Remove gallery entry`, sha);
      if (item?.path) {
        const fileMeta = await ghGetFile(item.path);
        if (fileMeta) await ghDeleteFile(item.path, `Remove gallery image: ${item.path}`, fileMeta.sha);
      }
      setStatus(statusEl, 'ok', 'Removed.');
      render();
    } catch (err) {
      setStatus(statusEl, 'err', err.message);
    }
  }

  uploadBtn.addEventListener('click', upload);
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
