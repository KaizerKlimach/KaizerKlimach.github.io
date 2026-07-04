// assets/app.js
// Renders the public site from the JSON files in /data.
// games.json and jams.json are kept up to date by the GitHub Action
// (scripts/fetch-metadata.mjs); gallery.json is written by admin.html.

const CATS = [
  { id: 'misc', label: 'Misc' },
  { id: 'props', label: 'Props' },
  { id: 'animations', label: 'Animations' },
  { id: 'tiles', label: 'Tiles' },
];

async function loadJson(path, fallback) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (err) {
    console.warn('Could not load', path, err);
    return fallback;
  }
}

function buildCard(game, tag, linkLabel) {
  const card = document.createElement('div');
  card.className = 'game-card';

  const images = game.images && game.images.length ? game.images : [];
  const imgsHtml = images
    .map((src, i) => `<img src="${src}" loading="lazy" class="${i === 0 ? 'active' : ''}" alt="${game.title} screenshot ${i + 1}">`)
    .join('');
  const dotsHtml = images.length > 1
    ? `<div class="dots">${images.map((_, i) => `<button class="dot ${i === 0 ? 'active' : ''}" aria-label="Screenshot ${i + 1}"></button>`).join('')}</div>`
    : '';
  const arrowsHtml = images.length > 1
    ? `<button class="car-btn prev" aria-label="Previous screenshot">‹</button><button class="car-btn next" aria-label="Next screenshot">›</button>`
    : '';

  card.innerHTML = `
    <div class="carousel">
      <div class="carousel-track">${imgsHtml}</div>
      ${arrowsHtml}
      ${dotsHtml}
      ${images.length > 1 ? `<div class="shot-count">${images.length} SHOTS</div>` : ''}
    </div>
    <div class="card-body">
      <div class="tag">${tag}</div>
      <h3>${game.title}</h3>
      <div class="studio">${game.studio || ''}</div>
      <p>${game.desc || ''}</p>
      <a class="go" href="${game.link}" target="_blank" rel="noopener">${linkLabel} →</a>
    </div>`;

  const imgs = card.querySelectorAll('.carousel-track img');
  const dots = card.querySelectorAll('.dot');
  let idx = 0;
  function show(i) {
    idx = (i + imgs.length) % imgs.length;
    imgs.forEach((im, j) => im.classList.toggle('active', j === idx));
    dots.forEach((d, j) => d.classList.toggle('active', j === idx));
  }
  card.querySelector('.prev')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); show(idx - 1); });
  card.querySelector('.next')?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); show(idx + 1); });
  dots.forEach((d, j) => d.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); show(j); }));

  return card;
}

function renderGrid(containerId, items, tag, linkLabel, emptyText) {
  const grid = document.getElementById(containerId);
  grid.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = emptyText;
    grid.appendChild(p);
    return;
  }
  items.forEach(g => grid.appendChild(buildCard(g, tag, linkLabel)));
}

let activeGalleryCat = 'all';
let galleryData = [];

function renderGalleryTabs() {
  const wrap = document.getElementById('galleryTabs');
  wrap.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'gtab' + (activeGalleryCat === 'all' ? ' active' : '');
  all.textContent = 'All';
  all.addEventListener('click', () => { activeGalleryCat = 'all'; renderGalleryTabs(); renderGallery(); });
  wrap.appendChild(all);
  CATS.forEach(c => {
    const b = document.createElement('button');
    b.className = 'gtab' + (activeGalleryCat === c.id ? ' active' : '');
    b.textContent = c.label;
    b.addEventListener('click', () => { activeGalleryCat = c.id; renderGalleryTabs(); renderGallery(); });
    wrap.appendChild(b);
  });
}

let currentLightboxItems = [];
let currentLightboxIndex = 0;

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '';
  const cats = activeGalleryCat === 'all' ? CATS : CATS.filter(c => c.id === activeGalleryCat);
  let any = false;
  const flatItems = [];
  cats.forEach(cat => {
    const items = galleryData.filter(g => g.category === cat.id);
    if (items.length) {
      any = true;
      items.forEach(it => {
        const caption = `${cat.label}${it.title ? ' — ' + it.title : ''}`;
        const d = document.createElement('div');
        d.className = 'gallery-item';
        d.innerHTML = `<img src="${it.path}" alt="${it.title || cat.label}" loading="lazy"><div class="cap">${caption}</div>`;
        const idx = flatItems.length;
        flatItems.push({ src: it.path, caption });
        d.addEventListener('click', () => openLightbox(flatItems, idx));
        grid.appendChild(d);
      });
    }
  });
  if (!any) {
    cats.forEach(cat => {
      const d = document.createElement('div');
      d.className = 'frame-slot';
      d.textContent = `${cat.label.toUpperCase()}\nNO SCAN YET`;
      grid.appendChild(d);
    });
  }
}

/* ---------- LIGHTBOX ---------- */
const lightboxEl = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImg');
const lbCaption = document.getElementById('lbCaption');

function openLightbox(items, index) {
  currentLightboxItems = items;
  currentLightboxIndex = index;
  showLightboxItem();
  lightboxEl.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightboxEl.hidden = true;
  document.body.style.overflow = '';
}
function showLightboxItem() {
  const item = currentLightboxItems[currentLightboxIndex];
  if (!item) return;
  lbImg.src = item.src;
  lbImg.alt = item.caption;
  lbCaption.textContent = item.caption;
  const multiple = currentLightboxItems.length > 1;
  document.getElementById('lbPrev').style.display = multiple ? 'flex' : 'none';
  document.getElementById('lbNext').style.display = multiple ? 'flex' : 'none';
}
function lightboxPrev() {
  currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxItems.length) % currentLightboxItems.length;
  showLightboxItem();
}
function lightboxNext() {
  currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxItems.length;
  showLightboxItem();
}

document.getElementById('lbClose').addEventListener('click', closeLightbox);
document.getElementById('lbPrev').addEventListener('click', lightboxPrev);
document.getElementById('lbNext').addEventListener('click', lightboxNext);
lightboxEl.addEventListener('click', e => { if (e.target === lightboxEl) closeLightbox(); });
document.addEventListener('keydown', e => {
  if (lightboxEl.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lightboxPrev();
  if (e.key === 'ArrowRight') lightboxNext();
});

(async function init() {
  const [games, jams, gallery] = await Promise.all([
    loadJson('data/games.json', []),
    loadJson('data/jams.json', []),
    loadJson('data/gallery.json', []),
  ]);

  renderGrid('steamGrid', games, 'steam release', 'View on Steam', 'No Steam entries yet — add a link in the admin panel.');
  renderGrid('jamGrid', jams, 'jam entry', 'View on itch.io', 'No jam entries yet — add a link in the admin panel.');

  galleryData = gallery;
  renderGalleryTabs();
  renderGallery();
})();
