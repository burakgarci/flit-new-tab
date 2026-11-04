// Settings window, loaded on first open. Categories on the left, the chosen one on the right.
import { S, save, get, patchOf, replace, onChange } from './store.js';
import { $, at, h, icon, ICONS, toast } from './ui.js';
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
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#dlg').open) close(); });
document.addEventListener('pointerdown', e => { if (P.open && !at(e).closest('#panel, #gear, #toast, #menu, #dlg')) close(); });

$('#cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; sync(); } };
$('#bg-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) { bgTab = b.dataset.tab; sync(); } };   // view only

function change(k, v) {
  save(patchOf(k, v));
  if (k === 'lang') loadLang();
  if (k === 'newTab' || k === 'addTile') L.render();
  if (k.startsWith('bg.') || k === 'credit') B.show();
  sync();
}
P.querySelectorAll('.seg[data-key]').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button[data-v]');
  if (b) change(seg.dataset.key, isNaN(b.dataset.v) ? b.dataset.v : +b.dataset.v);
}));
P.querySelectorAll('input[data-key]').forEach(i =>
  i.addEventListener('input', () => change(i.dataset.key, i.type === 'checkbox' ? i.checked : +i.value)));

/* Galleries */
const named = (b, id, key) => { b.dataset.id = id; b.dataset.i18nTitle = key; b.title = t(key); b.ariaLabel = t(key); return b; };
async function bingClick() {
  if (!(await chrome.permissions.request(B.BING))) return;   // must come first: it needs the click
  toast(t('loading'));
  if (await B.bing(true)) B.pick({ mode: 'image', image: 'bing' }); else toast(t('bingFail'));
}
B.WP.then(wp => {
  $('#g-image').replaceChildren(
    ...wp.map(w => {
      const b = h('button', { style: `background-image:url(${w.thumb})`, title: w.title || w.author, onclick: () => B.pick({ mode: 'image', image: w.id }) });
      b.dataset.id = w.id; return b;
    }),
    named(h('button', { className: 'ico', onclick: () => $('#file').click() }, icon(ICONS.upload)), 'custom', 'ownImage'),
    named(h('button', { className: 'ico', onclick: bingClick }, icon(ICONS.sun)), 'bing', 'bing'));
  sync();
});
$('#g-gradient').replaceChildren(...F.G.map((g, i) => {
  const b = h('button', { style: `background:linear-gradient(135deg,${g[0]},${g[1]})`, onclick: () => B.pick({ mode: 'gradient', gradient: i }) });
  b.dataset.i = i; return b;
}));
const picker = h('input', { type: 'color', hidden: true, oninput: () => B.pick({ mode: 'color', color: picker.value }) });
$('#g-color').replaceChildren(...F.C.map(c => {
  const b = h('button', { style: `background:${c}`, onclick: () => B.pick({ mode: 'color', color: c }) });
  b.dataset.c = c; return b;
}), h('button', { className: 'pick', onclick: () => { picker.value = S.bg.color; picker.click(); } }), picker);
$('#file').onchange = e => { const f = e.target.files[0]; if (f) B.setCustom(f); e.target.value = ''; };

/* Behavior */
const auto = new Option(t('langAuto'), 'auto'); auto.dataset.i18n = 'langAuto';
$('#lang').replaceChildren(auto, ...Object.entries(LANGS).map(([k, v]) => new Option(v, k)));
$('#lang').onchange = e => change('lang', e.target.value);
$('#folder').onchange = async e => { const [n] = await chrome.bookmarks.get(e.target.value); await L.useFolder(n); L.refresh(); };
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

/* Data — reset never touches bookmarks */
$('#export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ flit: 2, settings: S }, null, 2)], { type: 'application/json' }));
  a.download = 'flit-settings.json'; a.click();
};
$('#import').onchange = async e => {
  try {
    const j = JSON.parse(await e.target.files[0].text());
    if (!j || typeof j.settings !== 'object') throw 0;
    replace(j.settings); save({}); toast(t('imported'));
  } catch { toast(t('badFile')); }
  e.target.value = '';
};
async function resetAll() {
  await chrome.storage.sync.remove(['settings', 'folderName']);
  await chrome.storage.local.clear();
  await chrome.permissions.remove(B.BING).catch(() => {});
  Object.keys(localStorage).filter(k => k.startsWith('flit:')).forEach(k => localStorage.removeItem(k));
  await new Promise(r => { const q = indexedDB.deleteDatabase('flit'); q.onsuccess = q.onerror = q.onblocked = r; });
  location.replace(location.pathname);
}
$('#reset').onclick = () => toast(t('resetAsk'), t('reset'), resetAll, 8000);

/* About */
$('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
const logo = () => buildLogo($('#replay'), true);
logo(); document.addEventListener('flit:lang', logo);
$('#replay').onclick = () => play($('#replay'));

function sync() {
  if (!P.open) return;
  P.querySelectorAll('[data-cat]').forEach(e => (e.tagName === 'SECTION' ? (e.hidden = e.dataset.cat !== cat) : e.classList.toggle('on', e.dataset.cat === cat)));
  P.querySelectorAll('.seg[data-key]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(get(seg.dataset.key)))));
  P.querySelectorAll('input[data-key]').forEach(i => (i.type === 'checkbox' ? (i.checked = !!get(i.dataset.key)) : (i.value = get(i.dataset.key))));
  const b = S.bg;
  $('#bg-tabs').querySelectorAll('button').forEach(e => e.classList.toggle('on', e.dataset.tab === bgTab));
  ['image', 'gradient', 'color'].forEach(m => ($('#g-' + m).hidden = bgTab !== m));
  ['#r-fit', '#r-blur', '#r-credit'].forEach(q => ($(q).hidden = bgTab !== 'image'));
  $('#g-image').querySelectorAll('button').forEach(e => e.classList.toggle('on', b.mode === 'image' && e.dataset.id === b.image));
  $('#g-gradient').querySelectorAll('button').forEach(e => e.classList.toggle('on', b.mode === 'gradient' && +e.dataset.i === b.gradient));
  $('#g-color').querySelectorAll('button[data-c]').forEach(e => e.classList.toggle('on', b.mode === 'color' && e.dataset.c === b.color));
  $('#g-color .pick').classList.toggle('on', b.mode === 'color' && !F.C.includes(b.color));
  $('#lang').value = S.lang;
}
document.addEventListener('flit:bg', sync);
onChange(sync);
