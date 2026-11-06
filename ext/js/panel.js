// Settings window, loaded on first open. Categories on the left, the chosen one on the right.
import { S, save, get, patchOf, replace, onChange } from './store.js';
import { $, at, h, icon, ICONS, toast, ask } from './ui.js';
import { t, LANGS, loadLang } from './i18n.js';
import { buildLogo, play } from './logo.js';
import * as L from './links.js';
import * as B from './bg.js';

const F = window.FLIT, P = $('#panel');
let cat = 'bg', bgTab = S.bg.mode;

export function open(c) {
  cat = c || cat; bgTab = S.bg.mode;
  if (!P.open) P.show();
  sync(); folders();
}
export const close = () => P.open && P.close();
export const toggle = c => (P.open ? close() : open(c));
P.addEventListener('close', () => location.hash && history.replaceState(null, '', location.pathname));
P.querySelector('[data-close]').onclick = close;
const pickerOpen = () => { try { return !!P.querySelector('select:open'); } catch { return false; } };
addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('#dlg[open], #ask[open]') && !pickerOpen()) close(); });   // Esc closes an open list first
document.addEventListener('pointerdown', e => { if (P.open && !at(e).closest('#panel, #gear, #toast, #menu, #dlg, #ask')) close(); });

const body = P.querySelector('.body');
body.addEventListener('scroll', () => body.classList.toggle('scrolled', body.scrollTop > 2), { passive: true });
$('#cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b && b.dataset.cat !== cat) { cat = b.dataset.cat; body.scrollTop = 0; sync(); } };
$('#bg-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { bgTab = b.dataset.tab; sync(); } };   // view only

function change(k, v) {
  save(patchOf(k, v));
  if (k === 'lang') loadLang();
  if (k === 'newTab' || k === 'addTile') L.render();
  if (k === 'credit') B.showCredit();                      // fit, dim and blur are CSS only (boot.js apply)
  sync();
}
P.querySelectorAll('.seg[data-key]').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (b) change(seg.dataset.key, isNaN(b.dataset.v) ? b.dataset.v : +b.dataset.v);
}));
P.querySelectorAll('input[data-key]').forEach(i =>
  i.addEventListener('input', () => change(i.dataset.key, i.type === 'checkbox' ? i.checked : +i.value)));
const fill = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');   // accent up to the thumb
P.querySelectorAll('.row > .seg').forEach(seg => {               // each choice group is named by its row label
  const l = seg.previousElementSibling; l.id ||= 'l-' + seg.dataset.key.replace('.', '-');
  seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', l.id);
});

/* Galleries */
const named = (b, id, key) => { b.dataset.id = id; b.dataset.i18nTitle = key; b.title = t(key); b.ariaLabel = t(key); return b; };
async function bingClick() {
  if (!(await chrome.permissions.request(B.BING))) return;   // must come first: it needs the click
  if (!(await B.getRec('bing'))) toast(t('loading'));
  if (await B.bing(true)) B.pick({ mode: 'image', image: 'bing' }, true); else toast(t('bingFail'));
}
const tile = (ico, id, key, onclick) => {
  const label = h('span', { textContent: t(key) }); label.dataset.i18n = key;
  const b = h('button', { className: 'ico', onclick }, icon(ICONS[ico]), label); b.dataset.id = id; return b;
};
const thumbs = {};
async function storedTiles() {                              // your last image and today's Bing image, as thumbnails
  for (const id of ['custom', 'bing']) {
    const b = $(`#g-image [data-id=${id}]`), rec = b && (await B.getRec(id));
    if (!b) continue;
    if (thumbs[id]) URL.revokeObjectURL(thumbs[id]);
    thumbs[id] = rec ? URL.createObjectURL(rec.blob) : null;
    b.style.backgroundImage = rec ? `url(${thumbs[id]})` : '';
    b.classList.toggle('has', !!rec);
    if (id === 'custom') b.hidden = !rec;
  }
}
B.WP.then(wp => {
  $('#g-image').replaceChildren(
    ...wp.map(w => {
      const b = h('button', { style: `background-image:url(${w.thumb})`, title: w.title || w.author, onclick: () => B.pick({ mode: 'image', image: w.id }) });
      b.dataset.id = w.id; return b;
    }),
    tile('sun', 'bing', 'bing', bingClick),
    Object.assign(tile('upload', 'custom', 'ownImage', () => B.pick({ mode: 'image', image: 'custom' })), { hidden: true }),
    tile('upload', 'upload', 'upload', () => $('#file').click()));
  storedTiles(); sync();
});
$('#g-gradient').replaceChildren(...F.G.map((g, i) => {
  const b = h('button', { style: `background:linear-gradient(135deg,${g[0]},${g[1]})`, ariaLabel: `${g[0]} – ${g[1]}`, onclick: () => B.pick({ mode: 'gradient', gradient: i }) });
  b.dataset.i = i; return b;
}));
const picker = h('input', { type: 'color', hidden: true, oninput: () => B.pick({ mode: 'color', color: picker.value }) });
$('#g-color').replaceChildren(...F.C.map(c => {
  const b = h('button', { style: `background:${c}`, ariaLabel: c, onclick: () => B.pick({ mode: 'color', color: c }) });
  b.dataset.c = c; return b;
}), named(h('button', { className: 'pick', onclick: () => { picker.value = S.bg.color; picker.click(); } }), 'pick', 'customColor'), picker);
$('#file').onchange = e => { const f = e.target.files[0]; if (f) B.setCustom(f); e.target.value = ''; };

/* Behavior */
const auto = new Option(t('langAuto'), 'auto'); auto.dataset.i18n = 'langAuto';
$('#lang').replaceChildren(auto, ...Object.entries(LANGS).map(([k, v]) => new Option(v, k)));
$('#lang').onchange = e => change('lang', e.target.value);
$('#folder').onchange = async e => {
  try { const [n] = await chrome.bookmarks.get(e.target.value); await L.useFolder(n); await L.refresh(); }
  catch { toast(t('failed')); folders(); }                  // the folder was deleted meanwhile
};
async function folders() {
  const out = [];
  const walk = (ns, path) => ns.forEach(n => {
    if (n.url) return;
    const p = path ? `${path} / ${n.title}` : n.title;
    if (n.parentId && n.parentId !== '0') out.push([n.id, p]);
    walk(n.children || [], n.parentId === '0' ? n.title : p);
  });
  walk((await chrome.bookmarks.getTree())[0].children, '');
  $('#folder').replaceChildren(...out.map(([id, p]) => new Option(p, id, false, id === L.folderId)));
}

/* Data — backup, restore, reset. Bookmarks are never deleted. */
const checked = attr => Object.fromEntries([...P.querySelectorAll(`[${attr}]`)].map(i => [i.getAttribute(attr), i.checked]));
const asDataUrl = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
async function dataInfo() {
  $('#ex-links').textContent = t('exLinks', L.nodes.length);
  const img = P.querySelector('[data-ex=image]');
  img.disabled = !(await B.getRec('custom'));
  if (img.disabled) img.checked = false;
}
$('#export').onclick = async () => {
  const ex = checked('data-ex'), out = { flit: 2, date: new Date().toISOString() };
  if (ex.settings) out.settings = S;
  if (ex.links) out.links = L.nodes.map(({ title, url }) => ({ title, url }));
  if (ex.image) { const rec = await B.getRec('custom'); if (rec) out.image = await asDataUrl(rec.blob); }
  const a = h('a', { download: `flit-backup-${out.date.slice(0, 10)}.json` });
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#import').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  let j;
  try { if (!file || file.size > 30e6) throw 0; j = JSON.parse(await file.text()); if (!j || typeof j !== 'object' || !(j.settings || j.links || j.image)) throw 0; }
  catch { return toast(t('badFile')); }
  const done = [];
  if (j.settings && typeof j.settings === 'object') { replace(j.settings); save({}); done.push(t('doneSettings')); }
  if (Array.isArray(j.links) && L.folderId) {
    const have = new Set(L.nodes.map(n => n.url));
    let n = 0;
    for (const l of j.links.slice(0, 2000)) {
      const url = typeof l?.url === 'string' && l.url.length < 4096 && L.fixUrl(l.url);
      if (!url || have.has(url)) continue;
      await chrome.bookmarks.create({ parentId: L.folderId, title: String(l.title || '').slice(0, 300) || L.host(url), url });
      have.add(url); n++;
    }
    done.push(t('doneLinks', n));
  }
  if (typeof j.image === 'string' && /^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(j.image)) {
    await B.setCustom(await (await fetch(j.image)).blob(), !j.settings);
    done.push(t('doneImage'));
  }
  toast(t('imported', done.join(', ')));
  dataInfo();
};
async function reset(rs) {
  if (rs.settings) { await chrome.storage.sync.remove('settings'); localStorage.removeItem('flit:s'); }
  if (rs.images) {
    await chrome.permissions.remove(B.BING).catch(() => {});
    await new Promise(r => { const q = indexedDB.deleteDatabase('flit'); q.onsuccess = q.onerror = q.onblocked = r; });
    if (!rs.settings && /^(custom|bing)$/.test(S.bg.image)) {      // don't leave the page pointing at a deleted image
      const s = F.merge(S, { bg: { image: F.D.bg.image } });
      localStorage.setItem('flit:s', JSON.stringify(s));
      await chrome.storage.sync.set({ settings: s });
    }
  }
  if (rs.folder) { await chrome.storage.sync.remove('folderName'); await chrome.storage.local.clear(); localStorage.removeItem('flit:links'); }
  location.replace(location.pathname);
}
const rsBox = () => { const rs = checked('data-rs'); $('#reset').disabled = !Object.values(rs).some(Boolean); return rs; };
P.querySelectorAll('[data-rs]').forEach(i => (i.onchange = rsBox));
$('#reset').onclick = async () => { const rs = rsBox(); if (await ask(t('resetAsk'), t('reset'), true)) reset(rs); };

/* About */
const logo = () => buildLogo($('#replay'), true);
logo(); document.addEventListener('flit:lang', logo);
$('#replay').onclick = () => play($('#replay'));

const VERSION = chrome.runtime.getManifest().version;
function sync() {
  if (!P.open) return;
  $('#ver').textContent = t('version', VERSION);
  const l = document.documentElement.lang;                // privacy text: the page language, else English
  const docs = [...P.querySelectorAll('.doc[data-lang]')];
  docs.forEach(d => (d.hidden = d.dataset.lang !== (docs.some(x => x.dataset.lang === l) ? l : 'en')));
  if (cat === 'data') dataInfo();
  P.querySelectorAll('[data-cat]').forEach(e => (e.tagName === 'SECTION' ? (e.hidden = e.dataset.cat !== cat) : e.classList.toggle('on', e.dataset.cat === cat)));
  P.querySelectorAll('.seg[data-key]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(get(seg.dataset.key)))));
  P.querySelectorAll('input[data-key]').forEach(i => (i.type === 'checkbox' ? (i.checked = !!get(i.dataset.key)) : (i.value = get(i.dataset.key))));
  P.querySelectorAll('input[type=range]').forEach(fill);
  const b = S.bg;
  $('#bg-tabs').querySelectorAll('button').forEach(e => e.classList.toggle('on', e.dataset.tab === bgTab));
  ['image', 'gradient', 'color'].forEach(m => ($('#g-' + m).hidden = bgTab !== m));
  ['#r-fit', '#r-blur', '#r-credit'].forEach(q => ($(q).hidden = bgTab !== 'image'));
  $('#g-image').querySelectorAll('button').forEach(e => e.classList.toggle('on', b.mode === 'image' && e.dataset.id === b.image));
  $('#g-gradient').querySelectorAll('button').forEach(e => e.classList.toggle('on', b.mode === 'gradient' && +e.dataset.i === b.gradient));
  $('#g-color').querySelectorAll('button[data-c]').forEach(e => e.classList.toggle('on', b.mode === 'color' && e.dataset.c === b.color));
  $('#g-color .pick').classList.toggle('on', b.mode === 'color' && !F.C.includes(b.color));
  $('#lang').value = S.lang;
  P.querySelectorAll('.seg button, .grid > button:not([data-id=upload])').forEach(e => e.setAttribute('aria-pressed', e.classList.contains('on')));   // the choice is heard, not only seen
  P.querySelectorAll('#cats [data-cat]').forEach(e => (e.dataset.cat === cat ? e.setAttribute('aria-current', 'true') : e.removeAttribute('aria-current')));
}
document.addEventListener('flit:bg', sync);
document.addEventListener('flit:imgs', storedTiles);
document.addEventListener('flit:lang', sync);
onChange(sync);
