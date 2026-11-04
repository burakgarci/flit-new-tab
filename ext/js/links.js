// Bookmarks: the folder is tracked by id; tiles follow every change made anywhere in Chrome.
import { S } from './store.js';
import { $, at, toast, menu, ask, settings } from './ui.js';
import { t } from './i18n.js';
import { askBg } from './bg.js';

const F = window.FLIT, MIME = 'application/x-flit';
export let folderId = null, nodes = [];
let lost = () => {};
export const onLost = fn => (lost = fn);              // folder deleted and no other found

const isFolder = n => n && !n.url;
export const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
export const fixUrl = v => {
  v = (v || '').trim();
  if (!v || /\s/.test(v)) return '';
  if (!/^[a-z][\w+.-]*:/i.test(v)) v = 'https://' + v;
  try { const u = new URL(v); return /^https?:$/.test(u.protocol) && !u.hostname.includes('.') ? '' : u.href; } catch { return ''; }
};
export const list = () => nodes.map(({ id, index, title, url }) => ({ id, index, title, url }));
export const render = () => F.render(list(), !!folderId);

async function findFolder() {
  const { folderId: id } = await chrome.storage.local.get('folderId');
  if (id) { try { const [n] = await chrome.bookmarks.get(id); if (isFolder(n)) return n; } catch {} }
  const { folderName } = await chrome.storage.sync.get('folderName');   // another device, or a reinstall
  for (const title of [...new Set([folderName, 'Flit', 'btab'].filter(Boolean))]) {
    const hit = (await chrome.bookmarks.search({ title })).find(isFolder);
    if (hit) return hit;
  }
  return null;
}
export async function useFolder(n) {
  folderId = n.id;
  await chrome.storage.local.set({ folderId: n.id });
  await chrome.storage.sync.set({ folderName: n.title });
}
export async function refresh() {
  const kids = folderId && (await chrome.bookmarks.getChildren(folderId).catch(() => null));
  if (!kids) { if (!(await boot())) lost(); return; }
  nodes = kids.filter(n => n.url && !/^javascript:/i.test(n.url));
  const json = JSON.stringify(list());
  if (json !== localStorage.getItem('flit:links')) { localStorage.setItem('flit:links', json); render(); }
}
export async function boot() {                          // returns the folder, or null
  const n = await findFolder();
  if (!n) { folderId = null; nodes = []; localStorage.removeItem('flit:links'); F.render([], false); return null; }
  await useFolder(n);
  await refresh();
  return n;
}
export async function create() {                        // "Other bookmarks" › Flit, filled with top sites
  const roots = (await chrome.bookmarks.getTree())[0].children;
  const other = roots.filter(r => r.folderType === 'other').sort((a, b) => b.syncing - a.syncing)[0]
    || roots.find(r => r.id === '2') || roots[roots.length > 1 ? 1 : 0];
  const f = await chrome.bookmarks.create({ parentId: other.id, title: 'Flit' });
  let top = [];
  try { top = await chrome.topSites.get(); } catch {}
  for (const s of top.filter(s => /^https?:/.test(s.url)).slice(0, 8))
    await chrome.bookmarks.create({ parentId: f.id, title: s.title, url: s.url });
  await useFolder(f);
  await refresh();
}
export async function legacy(n) {                       // v1 users: their "btab" folder keeps working
  if (n?.title !== 'btab' || (await chrome.storage.local.get('legacyNote')).legacyNote) return;
  chrome.storage.local.set({ legacyNote: 1 });
  toast(t('legacyFound'), t('renameToFlit'), () => chrome.bookmarks.update(n.id, { title: 'Flit' }), 12000);
}

let later;
const soon = () => { clearTimeout(later); later = setTimeout(refresh, 60); };
const mine = (...ids) => folderId && ids.includes(folderId);
chrome.bookmarks.onCreated.addListener((id, n) => mine(n.parentId) && soon());
chrome.bookmarks.onRemoved.addListener((id, i) => (id === folderId ? boot().then(n => n || lost()) : mine(i.parentId) && soon()));
chrome.bookmarks.onChanged.addListener((id, c) => (id === folderId ? chrome.storage.sync.set({ folderName: c.title }) : soon()));
chrome.bookmarks.onMoved.addListener((id, m) => (id === folderId ? soon() : mine(m.parentId, m.oldParentId) && soon()));
chrome.bookmarks.onChildrenReordered.addListener(id => mine(id) && soon());
chrome.bookmarks.onImportEnded.addListener(soon);

export async function add(url, title) {
  if (!folderId) return;
  await chrome.bookmarks.create({ parentId: folderId, url, title: title || host(url) });
  toast(t('added'));
}
async function del(n) {
  await chrome.bookmarks.remove(n.id);
  toast(t('deleted'), t('undo'), () => chrome.bookmarks.create({ parentId: n.parentId, index: n.index, title: n.title, url: n.url }), 6000);
}
const open = url => (S.newTab ? chrome.tabs.create({ url }) : (location.href = url));

/* Add / edit dialog */
const dlg = $('#dlg'), fTitle = dlg.querySelector('[name=title]'), fUrl = dlg.querySelector('[name=url]');
export function edit(n) {
  fTitle.value = n?.title || ''; fUrl.value = n?.url || '';
  dlg.returnValue = '';
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    const url = fixUrl(fUrl.value), title = fTitle.value.trim() || host(url);
    if (!url) return toast(t('badUrl'));
    if (n) await chrome.bookmarks.update(n.id, { title, url }); else await add(url, title);
  };
  dlg.showModal();
  (n ? fTitle : fUrl).focus();
}

/* Right-click menu */
document.addEventListener('contextmenu', e => {
  if (at(e).closest('#panel, dialog, input, select, #welcome, #credit-pop')) return;
  e.preventDefault();
  const a = at(e).closest('.tile[data-id]'), n = a && nodes.find(n => n.id === a.dataset.id);
  if (n) menu(e.clientX, e.clientY, [
    [t('openTab'), () => chrome.tabs.create({ url: n.url, active: false })],
    [t('openWindow'), () => chrome.windows.create({ url: n.url })],
    [t('openPrivate'), () => chrome.windows.create({ url: n.url, incognito: true })],
    null,
    [t('edit'), () => edit(n)],
    [t('copyUrl'), () => navigator.clipboard.writeText(n.url).then(() => toast(t('copied')))],
    null,
    [t('delete'), () => del(n), 'danger']
  ]);
  else if (folderId) menu(e.clientX, e.clientY, [
    [t('addLink'), () => edit()],
    nodes.length > 1 && [t('openAll', nodes.length), async () => { if (await ask(t('openAllAsk', nodes.length), t('open'))) nodes.forEach(n => chrome.tabs.create({ url: n.url, active: false })); }],
    [t('manage'), () => chrome.tabs.create({ url: 'chrome://bookmarks/?id=' + folderId })],
    null,
    [t('changeBg'), () => settings('bg')],
    [t('settings'), () => settings()]
  ].filter(x => x !== false));
});
document.addEventListener('click', e => { if (at(e).closest('#add-tile')) edit(); });

/* Drag to reorder; drop a link to add it, an image to use it as background */
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
document.addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('drop'); clearOver();
  const dt = e.dataTransfer;
  if (dt.types.includes(MIME)) {
    const a = at(e).closest('.tile[data-id]'), from = nodes.find(n => n.id === dt.getData(MIME));
    if (!a || !from || a.dataset.id === from.id) return;
    const to = +a.dataset.index;                         // bookmark index (sub-folders included)
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
  const d = /^Digit([1-9])$/.exec(e.code);              // e.code: works on every keyboard layout
  if (d && S.keys && e.altKey && !e.ctrlKey && !e.metaKey && nodes[d[1] - 1]) { e.preventDefault(); open(nodes[d[1] - 1].url); }
});
