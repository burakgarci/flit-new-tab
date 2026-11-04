// Flit New Tab — main logic. paint.js has already drawn cached links and the background.
const F = window.FLIT;
const $ = q => document.querySelector(q);
const MIME = 'application/x-flit';
const at = e => (e.target instanceof Element ? e.target : document.body);   // events on document have no .closest
const BING = { origins: ['https://www.bing.com/*'] };
let S = F.s, folderId = null, nodes = [], dict = null, objUrl = null;
const WP = fetch('wallpapers/wallpapers.json').then(r => r.json()).catch(() => []);

/* ---------- i18n ---------- */
// To add a language: create _locales/xx/messages.json and add one entry here.
const LANGS = { en: 'English', tr: 'Türkçe' };
const lang = () => {
  if (LANGS[S.lang]) return S.lang;
  const ui = chrome.i18n.getUILanguage().split('-')[0];
  return LANGS[ui] ? ui : 'en';
};
let base = {};                                              // English, used for any missing key
const loadDict = l => fetch(`_locales/${l}/messages.json`).then(r => r.json()).catch(() => ({}));
const t = (k, ...a) => {
  let m = dict?.[k]?.message ?? base[k]?.message ?? k;
  a.forEach((v, i) => (m = m.replace('$' + (i + 1), v)));
  return m;
};
async function loadLang() {
  const l = lang();
  [dict, base] = await Promise.all([loadDict(l), l === 'en' ? null : loadDict('en')]);
  base = base || dict;
  document.documentElement.lang = lang();
  document.querySelectorAll('[data-i18n]').forEach(e => (e.textContent = t(e.dataset.i18n)));
  $('#lang').options[0].textContent = t('langAuto');
  document.querySelectorAll('[data-i18n-title]').forEach(e => e.setAttribute('aria-label', (e.title = t(e.dataset.i18nTitle))));
  buildLogo($('#logo')); buildLogo($('#replay'), true);
}

/* ---------- settings ---------- */
let syncTimer;
function save(patch) {
  S = F.s = F.merge(S, patch);
  localStorage.setItem('flit:s', JSON.stringify(S));
  F.apply(S);
  clearTimeout(syncTimer);                                   // sliders fire often; sync quota is 120 writes/min
  syncTimer = setTimeout(() => chrome.storage.sync.set({ settings: S }), 400);
}
function applyAll() {
  F.apply(S); loadLang(); F.render(list()); F.bg(S); showStoredBg(); showCredit(); syncPanel();
}
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'sync' || !c.settings?.newValue) return;
  if (JSON.stringify(c.settings.newValue) === JSON.stringify(S)) return;
  S = F.s = F.merge(F.D, c.settings.newValue);
  localStorage.setItem('flit:s', JSON.stringify(S));
  applyAll();
});
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => F.apply(S));

/* ---------- bookmarks ---------- */
const isFolder = n => n && !n.url;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const fixUrl = v => {
  v = (v || '').trim();
  if (!v || /\s/.test(v)) return '';
  if (!/^[a-z][\w+.-]*:/i.test(v)) v = 'https://' + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) && !u.hostname.includes('.') ? '' : u.href; } catch { return ''; }
};
const list = () => nodes.map(({ id, index, title, url }) => ({ id, index, title, url }));

async function findFolder() {
  const { folderId: id } = await chrome.storage.local.get('folderId');
  if (id) { try { const [n] = await chrome.bookmarks.get(id); if (isFolder(n)) return n; } catch {} }
  const { folderName } = await chrome.storage.sync.get('folderName');
  for (const title of [...new Set([folderName, 'Flit', 'btab'].filter(Boolean))]) {
    const hit = (await chrome.bookmarks.search({ title })).find(isFolder);
    if (hit) return hit;
  }
  return null;
}
async function useFolder(n) {
  folderId = n.id;
  await chrome.storage.local.set({ folderId: n.id });
  await chrome.storage.sync.set({ folderName: n.title });
}
async function refresh() {
  const kids = folderId && (await chrome.bookmarks.getChildren(folderId).catch(() => null));
  if (!kids) return boot();
  nodes = kids.filter(n => n.url && !/^javascript:/i.test(n.url));
  const json = JSON.stringify(list());
  if (json !== localStorage.getItem('flit:links')) { localStorage.setItem('flit:links', json); F.render(list()); }
}
async function boot() {
  const n = await findFolder();
  if (!n) { folderId = null; nodes = []; localStorage.removeItem('flit:links'); F.render([], false); return showWelcome(); }
  await useFolder(n);
  $('#welcome').hidden = true;
  await refresh();
  if (n.title === 'btab') {
    const { legacyNote } = await chrome.storage.local.get('legacyNote');
    if (!legacyNote) {
      chrome.storage.local.set({ legacyNote: 1 });
      toast(t('legacyFound'), t('renameToFlit'), () => chrome.bookmarks.update(n.id, { title: 'Flit' }), 12000);
    }
  }
}
let later;
const soon = () => { clearTimeout(later); later = setTimeout(refresh, 60); };
const mine = (...ids) => folderId && ids.includes(folderId);
chrome.bookmarks.onCreated.addListener((id, n) => mine(n.parentId) && soon());
chrome.bookmarks.onRemoved.addListener((id, i) => (id === folderId ? boot() : mine(i.parentId) && soon()));
chrome.bookmarks.onChanged.addListener((id, c) => (id === folderId ? chrome.storage.sync.set({ folderName: c.title }) : soon()));
chrome.bookmarks.onMoved.addListener((id, m) => (id === folderId ? soon() : mine(m.parentId, m.oldParentId) && soon()));
chrome.bookmarks.onChildrenReordered.addListener(id => mine(id) && soon());
chrome.bookmarks.onImportEnded.addListener(soon);

async function add(url, title) {
  if (!folderId) return;
  await chrome.bookmarks.create({ parentId: folderId, url, title: title || host(url) });
  toast(t('added'));
}
async function del(n) {
  await chrome.bookmarks.remove(n.id);
  toast(t('deleted'), t('undo'), () => chrome.bookmarks.create({ parentId: n.parentId, index: n.index, title: n.title, url: n.url }), 6000);
}
const open = url => (S.newTab ? chrome.tabs.create({ url }) : (location.href = url));

/* ---------- welcome ---------- */
function buildLogo(el, open) {
  const words = t('slogan').split(' ');
  const colors = ['#ff8a5b', '#ffd166', '#3ddc97', '#7aa2ff'];
  el.replaceChildren(...words.map((w, i) => {
    const s = document.createElement('span'), b = document.createElement('b'), it = document.createElement('i'), r = document.createElement('span');
    s.className = 'w'; b.style.setProperty('--c', colors[i]);
    b.textContent = w[0] === 'İ' ? 'I' : w[0];
    if (w[0] === 'İ') b.className = 'dot';
    r.textContent = w.slice(1); it.append(r); s.append(b, it);
    return s;
  }));
  el.classList.toggle('open', !!open);
}
function play(el) {
  el.classList.remove('open');
  setTimeout(() => el.classList.add('open'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400);   // close (.7s) + hold
}
function showWelcome() {
  const w = $('#welcome');
  w.hidden = false;
  requestAnimationFrame(() => { w.classList.add('open'); play($('#logo')); });
}
$('#start').onclick = async () => {
  $('#start').disabled = true;
  const roots = (await chrome.bookmarks.getTree())[0].children;
  const other = roots.filter(r => r.folderType === 'other').sort((a, b) => b.syncing - a.syncing)[0]
    || roots.find(r => r.id === '2') || roots[roots.length > 1 ? 1 : 0];
  const f = await chrome.bookmarks.create({ parentId: other.id, title: 'Flit' });
  let top = [];
  try { top = await chrome.topSites.get(); } catch {}
  for (const s of top.filter(s => /^https?:/.test(s.url)).slice(0, 8))
    await chrome.bookmarks.create({ parentId: f.id, title: s.title, url: s.url });
  await useFolder(f);
  $('#welcome').hidden = true;
  await refresh();
  toast(t('created'), null, null, 10000);
};
$('#replay').onclick = () => play($('#replay'));

/* ---------- toast & menu ---------- */
let toastTimer;
function toast(msg, action, fn, ms = 3500) {
  const el = $('#toast'), b = el.querySelector('button');
  el.querySelector('span').textContent = msg;
  b.hidden = !action; b.textContent = action || '';
  b.onclick = () => { el.hidden = true; fn(); };
  el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), ms);
}
const menu = $('#menu');
function openMenu(x, y, items) {
  menu.replaceChildren(...items.map(it => {
    if (!it) return document.createElement('hr');
    const b = document.createElement('button');
    b.textContent = it[0]; if (it[2]) b.className = it[2];
    b.onclick = () => { menu.hidden = true; it[1](); };
    return b;
  }));
  menu.hidden = false;
  const r = menu.getBoundingClientRect();                  // measured after it is visible
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
document.addEventListener('contextmenu', e => {
  if (at(e).closest('#panel, dialog, input, select, #welcome')) return;
  e.preventDefault();
  const a = at(e).closest('.tile[data-id]'), n = a && nodes.find(n => n.id === a.dataset.id);
  if (n) openMenu(e.clientX, e.clientY, [
    [t('openTab'), () => chrome.tabs.create({ url: n.url, active: false })],
    [t('openWindow'), () => chrome.windows.create({ url: n.url })],
    [t('openPrivate'), () => chrome.windows.create({ url: n.url, incognito: true })],
    null,
    [t('edit'), () => editLink(n)],
    [t('copyUrl'), () => navigator.clipboard.writeText(n.url).then(() => toast(t('copied')))],
    null,
    [t('delete'), () => del(n), 'danger']
  ]);
  else if (folderId) openMenu(e.clientX, e.clientY, [[t('addLink'), () => editLink()], [t('settings'), openPanel]]);
});
document.addEventListener('click', e => {
  const el = at(e);
  if (!el.closest('#menu')) menu.hidden = true;
  if (!el.closest('#credit, #credit-pop')) $('#credit-pop').hidden = true;
  if (el.closest('#add-tile')) editLink();
});

/* ---------- edit / add dialog ---------- */
const dlg = $('#dlg'), fTitle = dlg.querySelector('[name=title]'), fUrl = dlg.querySelector('[name=url]');
function editLink(n) {
  fTitle.value = n?.title || ''; fUrl.value = n?.url || '';
  dlg.returnValue = '';
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    const url = fixUrl(fUrl.value), title = fTitle.value.trim() || host(url);
    if (!url) return;
    if (n) await chrome.bookmarks.update(n.id, { title, url }); else await add(url, title);
  };
  dlg.showModal();
  (n ? fTitle : fUrl).focus();
}

/* ---------- drag & drop, paste, keys ---------- */
const links = $('#links');
let drag = null;
const clearOver = () => document.querySelectorAll('.tile.over').forEach(e => e.classList.remove('over', 'after'));
links.addEventListener('dragstart', e => {
  const a = e.target.closest('.tile[data-id]'); if (!a) return;
  drag = nodes.find(n => n.id === a.dataset.id);
  e.dataTransfer.setData(MIME, drag.id);
  e.dataTransfer.setData('text/uri-list', drag.url);
  e.dataTransfer.effectAllowed = 'move';
  a.classList.add('dragging');
});
links.addEventListener('dragend', e => { e.target.classList?.remove('dragging'); drag = null; clearOver(); });
document.addEventListener('dragover', e => {
  const types = e.dataTransfer.types;
  if (types.includes(MIME)) {
    e.preventDefault(); clearOver();
    const a = at(e).closest('.tile[data-id]');
    if (a && drag && a.dataset.id !== drag.id) a.classList.add('over', ...(drag.index < +a.dataset.index ? ['after'] : []));
  } else if (types.includes('Files') || types.includes('text/uri-list')) {
    e.preventDefault(); document.body.classList.add('drop');
  }
});
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drop'); });
document.addEventListener('drop', async e => {
  e.preventDefault(); document.body.classList.remove('drop'); clearOver();
  const dt = e.dataTransfer;
  if (dt.types.includes(MIME)) {
    const a = at(e).closest('.tile[data-id]'), from = nodes.find(n => n.id === dt.getData(MIME));
    if (!a || !from || a.dataset.id === from.id) return;
    const to = +a.dataset.index;                              // bookmark index (sub-folders included)
    return chrome.bookmarks.move(from.id, { parentId: folderId, index: from.index < to ? to + 1 : to });
  }
  const file = [...dt.files].find(f => f.type.startsWith('image/'));
  if (file) return askBg(file);
  const url = fixUrl((dt.getData('text/uri-list') || dt.getData('text/plain')).split('\n')[0]);
  if (url) add(url, '');
});
document.addEventListener('paste', e => {
  if (at(e).closest('input, textarea, [contenteditable]')) return;
  const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
  if (file) return askBg(file);
  const url = fixUrl(e.clipboardData.getData('text'));
  if (url) add(url, '');
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') { menu.hidden = true; closePanel(); }
  const d = /^Digit([1-9])$/.exec(e.code);
  if (d && S.keys && e.altKey && !e.ctrlKey && !e.metaKey && nodes[d[1] - 1]) { e.preventDefault(); open(nodes[d[1] - 1].url); }
});

/* ---------- background (IndexedDB for custom / Bing) ---------- */
const idb = (mode, fn) => new Promise((res, rej) => {
  const o = indexedDB.open('flit', 1);
  o.onupgradeneeded = () => o.result.createObjectStore('kv');
  o.onerror = () => rej(o.error);
  o.onsuccess = () => {
    const tx = o.result.transaction('kv', mode), r = fn(tx.objectStore('kv'));
    tx.oncomplete = () => res(r.result); tx.onerror = () => rej(tx.error);
  };
});
const getRec = k => idb('readonly', s => s.get(k)).catch(() => null);
const putRec = (k, v) => idb('readwrite', s => s.put(v, k));

async function showStoredBg() {
  const b = S.bg;
  if (b.mode !== 'image' || !/^(custom|bing)$/.test(b.image)) return;
  const rec = await getRec(b.image);
  if (!rec) return;
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(rec.blob);
  F.bg(S, objUrl);
  syncPanel();
}
function askBg(file) { toast(t('setAsBg'), t('yes'), () => setCustom(file), 8000); }
async function setCustom(file) {
  let blob = file;
  try {
    const bm = await createImageBitmap(file), k = Math.min(1, 3840 / bm.width);
    if (k < 1 || file.size > 4e6) {
      const c = new OffscreenCanvas(Math.round(bm.width * k), Math.round(bm.height * k));
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      blob = await c.convertToBlob({ type: 'image/webp', quality: 0.88 });
    }
  } catch { return toast(t('badFile')); }
  await putRec('custom', { blob });
  save({ bg: { mode: 'image', image: 'custom' } });
  await showStoredBg(); showCredit();
}
async function bing(force) {
  if (!(await chrome.permissions.contains(BING))) return false;
  const rec = await getRec('bing'), day = new Date().toDateString();
  if (!force && rec?.day === day) return true;
  try {
    const mkt = lang() === 'tr' ? 'tr-TR' : 'en-US';
    const im = (await (await fetch(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${mkt}`)).json()).images[0];
    const size = screen.width * devicePixelRatio > 1920 ? '_UHD.jpg' : '_1920x1080.jpg';
    const blob = await (await fetch('https://www.bing.com' + im.urlbase + size)).blob();
    await putRec('bing', { blob, day, credit: { name: im.title || im.copyright, loc: im.copyright, page: im.copyrightlink } });
    return true;
  } catch { return false; }
}
const link = (text, href) => Object.assign(document.createElement('a'), { textContent: text, href, target: '_blank', rel: 'noopener' });
async function showCredit() {
  const el = $('#credit'), b = S.bg;
  let c = null;
  if (S.credit && b.mode === 'image') {
    if (b.image === 'bing') c = (await getRec('bing'))?.credit;
    else if (b.image !== 'custom') {
      const w = (await WP).find(w => w.id === b.image);
      if (w?.username) c = { name: w.author, user: w.username, page: w.page, loc: w.location };
    }
  }
  el.hidden = !c;
  if (!c) return;
  el.querySelector('span').textContent = c.name;
  el.classList.add('fresh'); setTimeout(() => el.classList.remove('fresh'), 4000);
  el.onclick = () => {
    const p = $('#credit-pop'), utm = '?utm_source=flit&utm_medium=referral';
    const h = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text || '' });
    const who = h('div', 'who'), ava = h('div', 'ava', c.user ? c.name.trim()[0] : 'B'), meta = h('div');
    meta.append(h('strong', '', c.name), h('span', 'user', c.user ? '@' + c.user : 'Bing'));
    who.append(ava, meta);
    const acts = h('div', 'acts');
    if (c.user) acts.append(Object.assign(link(t('profile'), `https://unsplash.com/@${c.user}${utm}`), { className: 'g' }));
    if (c.page) acts.append(Object.assign(link(t('photoPage'), c.page + (c.user ? utm : '')), { className: 'g' }));
    p.replaceChildren(who);
    if (c.loc) { const l = h('div', 'loc'); l.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>'; l.append(h('span', '', c.loc)); l.title = c.loc; p.append(l); }
    p.append(acts, h('small', '', c.user ? 'Unsplash' : 'Bing'));
    p.hidden = !p.hidden;
  };
}

/* ---------- settings panel ---------- */
const panel = $('#panel');
const get = k => k.split('.').reduce((o, p) => o?.[p], S);
const patchOf = (k, v) => { const [a, b] = k.split('.'); return b ? { [a]: { [b]: v } } : { [a]: v }; };
let bgTab = 'image';
function openPanel() { bgTab = S.bg.mode; panel.hidden = false; buildPanel(); }
$('#bg-tabs').onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) { bgTab = b.dataset.tab; syncPanel(); } };
const pick = bg => { save({ bg }); F.bg(S); showStoredBg(); showCredit(); syncPanel(); };
function closePanel() { panel.hidden = true; if (location.hash) history.replaceState(null, '', location.pathname); }
$('#gear').onclick = () => (panel.hidden ? openPanel() : closePanel());
panel.querySelector('[data-close]').onclick = closePanel;

function change(k, v) {
  save(patchOf(k, v));
  if (k === 'lang') loadLang();
  if (k === 'newTab' || k === 'addTile') F.render(list());
  if (k.startsWith('bg.') || k === 'credit') { F.bg(S); showStoredBg(); showCredit(); }
  syncPanel();
}
panel.querySelectorAll('.seg[data-key]').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (b) change(seg.dataset.key, isNaN(b.dataset.v) ? b.dataset.v : +b.dataset.v);
}));
panel.querySelectorAll('input[data-key]').forEach(i =>
  i.addEventListener('input', () => change(i.dataset.key, i.type === 'checkbox' ? i.checked : +i.value)));

const swatch = (cls, style, on) => { const b = document.createElement('button'); b.className = cls; b.style.cssText = style; b.onclick = on; return b; };
let built = false;
async function buildPanel() {
  if (!built) {
    built = true;
    const wp = await WP;
    $('#g-image').replaceChildren(
      ...wp.map(w => { const b = swatch('', `background-image:url(${w.thumb})`, () => pick({ mode: 'image', image: w.id })); b.dataset.id = w.id; b.title = w.title || w.author; return b; }),
      Object.assign(swatch('', '', () => $('#file').click()), { textContent: t('ownImage') }),
      Object.assign(swatch('', '', async () => {
        if (!(await chrome.permissions.request(BING))) return;            // must stay first: needs the click gesture
        toast(t('loading'));
        if (await bing(true)) pick({ mode: 'image', image: 'bing' }); else toast(t('bingFail'));
      }), { textContent: t('bing') })
    );
    Object.assign($('#g-image').lastChild.dataset, { id: 'bing', i18n: 'bing' });
    Object.assign($('#g-image').lastChild.previousSibling.dataset, { id: 'custom', i18n: 'ownImage' });
    $('#g-gradient').replaceChildren(...F.G.map((g, i) => {
      const b = swatch('', `background:linear-gradient(135deg,${g[0]},${g[1]})`, () => pick({ mode: 'gradient', gradient: i })); b.dataset.i = i; return b;
    }));
    const picker = Object.assign(document.createElement('input'), { type: 'color', hidden: true });
    picker.oninput = () => pick({ mode: 'color', color: picker.value });
    const custom = swatch('pick', '', () => { picker.value = S.bg.color; picker.click(); });
    $('#g-color').replaceChildren(...F.C.map(c => { const b = swatch('', `background:${c}`, () => pick({ mode: 'color', color: c })); b.dataset.c = c; return b; }), custom, picker);
    $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
  }
  const sel = $('#folder'), folders = [];
  const walk = (ns, path) => ns.forEach(n => { if (isFolder(n)) { const p = path ? `${path} / ${n.title}` : n.title; if (n.parentId && n.parentId !== '0') folders.push([n.id, p]); walk(n.children || [], n.parentId === '0' ? n.title : p); } });
  walk((await chrome.bookmarks.getTree())[0].children, '');
  sel.replaceChildren(...folders.map(([id, p]) => new Option(p, id, false, id === folderId)));
  syncPanel();
}
$('#lang').replaceChildren(new Option('', 'auto'), ...Object.entries(LANGS).map(([k, v]) => new Option(v, k)));
$('#lang').onchange = e => change('lang', e.target.value);
$('#folder').onchange = async e => { const [n] = await chrome.bookmarks.get(e.target.value); await useFolder(n); refresh(); };
$('#file').onchange = e => { const f = e.target.files[0]; if (f) setCustom(f); e.target.value = ''; };

function syncPanel() {
  if (panel.hidden) return;
  panel.querySelectorAll('.seg[data-key]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(get(seg.dataset.key)))));
  panel.querySelectorAll('input[data-key]').forEach(i => (i.type === 'checkbox' ? (i.checked = !!get(i.dataset.key)) : (i.value = get(i.dataset.key))));
  const b = S.bg;
  $('#bg-tabs').querySelectorAll('button').forEach(e => e.classList.toggle('on', e.dataset.tab === bgTab));
  ['image', 'gradient', 'color'].forEach(m => ($('#g-' + m).hidden = bgTab !== m));
  ['#r-fit', '#r-blur', '#r-credit'].forEach(q => ($(q).hidden = bgTab !== 'image'));
  $('#g-image').querySelectorAll('button').forEach(e => e.classList.toggle('on', b.mode === 'image' && e.dataset.id === b.image));
  $('#g-gradient').querySelectorAll('button').forEach(e => e.classList.toggle('on', b.mode === 'gradient' && +e.dataset.i === b.gradient));
  $('#g-color').querySelectorAll('button[data-c]').forEach(e => e.classList.toggle('on', b.mode === 'color' && e.dataset.c === b.color));
  $('#g-color .pick').classList.toggle('on', b.mode === 'color' && !F.C.includes(b.color));
  $('#lang').value = S.lang;
  const dl = $('#dl'), preset = !/^(custom|bing)$/.test(b.image);
  dl.hidden = bgTab !== 'image' || b.mode !== 'image' || (!preset && !objUrl);
  dl.href = preset ? `wallpapers/${b.image}.webp` : objUrl || '';
  dl.download = `flit-${b.image}.${preset ? 'webp' : 'jpg'}`;
}

/* ---------- reset (settings only — bookmarks are never touched) ---------- */
async function resetAll() {
  await chrome.storage.sync.remove(['settings', 'folderName']);
  await chrome.storage.local.clear();
  await chrome.permissions.remove(BING).catch(() => {});
  Object.keys(localStorage).filter(k => k.startsWith('flit:')).forEach(k => localStorage.removeItem(k));
  await new Promise(r => { const q = indexedDB.deleteDatabase('flit'); q.onsuccess = q.onerror = q.onblocked = r; });
  location.replace(location.pathname);
}
const askReset = () => toast(t('resetAsk'), t('reset'), resetAll, 8000);
$('#reset').onclick = askReset;
$('#reset2').onclick = askReset;

/* ---------- export / import ---------- */
$('#export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ flit: 2, settings: S }, null, 2)], { type: 'application/json' }));
  a.download = 'flit-settings.json'; a.click();
};
$('#import').onchange = async e => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    if (!j || typeof j.settings !== 'object') throw 0;
    S = F.merge(F.D, j.settings); save({}); applyAll(); toast(t('imported'));
  } catch { toast(t('badFile')); }
  e.target.value = '';
};

/* ---------- start ---------- */
(async () => {
  await loadLang();
  const { settings, wallpaperEnabled } = await chrome.storage.sync.get(['settings', 'wallpaperEnabled']);
  if (settings) {
    if (JSON.stringify(F.merge(F.D, settings)) !== JSON.stringify(S)) { S = F.s = F.merge(F.D, settings); localStorage.setItem('flit:s', JSON.stringify(S)); applyAll(); }
  } else {                                                    // first run, or upgrade from v1.x
    if (wallpaperEnabled === false) save({ bg: { mode: 'color' } }), F.bg(S);
    chrome.storage.sync.set({ settings: S });
  }
  ['background-image', 'background-last-update', 'using-direct-url'].forEach(k => localStorage.removeItem(k));
  await boot();
  showStoredBg(); showCredit();
  if (S.bg.mode === 'image' && S.bg.image === 'bing') bing();   // refresh in the background, shown on the next tab
  if (location.hash === '#settings') openPanel();
})();
