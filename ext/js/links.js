// Bookmarks: the folder is tracked by id; tiles follow every change made anywhere in Chrome.
import { S } from './store.js';
import { $, at, toast, menu, ask, settings, run } from './ui.js';
import { t } from './i18n.js';
import { askBg } from './bg.js';

const F = window.FLIT, MIME = 'application/x-flit';
export let folderId = null, nodes = [];
let lost = () => {};
export const onLost = fn => (lost = fn);              // folder deleted and no other found

const isFolder = n => n && !n.url;
export const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
export const fixUrl = v => {                            // only addresses a tile can show; "localhost:3000" is a host, not a scheme
  v = (v || '').trim();
  if (!v || /\s/.test(v)) return '';
  if (!/^[a-z][\w+.-]*:(?!\d)/i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v), host = u.hostname;
    if (!F.SAFE.test(u.protocol)) return '';
    return /^https?:$/.test(u.protocol) && !/[.[]/.test(host) && host !== 'localhost' ? '' : u.href;
  } catch { return ''; }
};
export const list = () => nodes.map(({ id, index, title, url }) => ({ id, index, title, url }));
export const render = () => folderId && F.render(list(), true);   // before boot() the cached tiles stay

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
export async function useFolder(n) {                    // write only on change: sync allows 120 writes a minute
  folderId = n.id;
  const [{ folderId: id }, { folderName }] = await Promise.all([chrome.storage.local.get('folderId'), chrome.storage.sync.get('folderName')]);
  if (id !== n.id) await chrome.storage.local.set({ folderId: n.id });
  if (folderName !== n.title) await chrome.storage.sync.set({ folderName: n.title });
}
export async function refresh() {
  const kids = folderId && (await chrome.bookmarks.getChildren(folderId).catch(() => null));
  if (!kids) { if (!(await boot())) lost(); return; }
  nodes = kids.filter(n => n.url && F.safe(n.url));
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
export async function create(seed) {                    // "Other bookmarks" › Flit, filled with top sites if allowed
  const have = await findFolder();                      // a retry, or another tab got there first
  if (have) { await useFolder(have); return refresh(); }
  const roots = (await chrome.bookmarks.getTree())[0].children;
  const other = roots.filter(r => r.folderType === 'other').sort((a, b) => b.syncing - a.syncing)[0]
    || roots.find(r => r.id === '2') || roots[roots.length > 1 ? 1 : 0];
  const f = await chrome.bookmarks.create({ parentId: other.id, title: 'Flit' });
  let top = [];
  if (seed) {                                           // read once, then the access is given back
    try { top = await chrome.topSites.get(); } catch {}
    chrome.permissions.remove({ permissions: ['topSites'] }).catch(() => {});
  }
  for (const s of top.filter(s => fixUrl(s.url)).slice(0, 8))
    await chrome.bookmarks.create({ parentId: f.id, title: String(s.title || '').slice(0, 300), url: fixUrl(s.url) }).catch(() => {});
  await useFolder(f);
  await refresh();
}
export async function legacy(n) {                       // v1 users: their "btab" folder keeps working
  if (n?.title !== 'btab' || (await chrome.storage.local.get('legacyNote')).legacyNote) return;
  chrome.storage.local.set({ legacyNote: 1 });
  toast(t('legacyFound'), t('renameToFlit'), () => chrome.bookmarks.update(n.id, { title: 'Flit' }), 12000);
}

let later;
const soon = () => { clearTimeout(later); later = setTimeout(() => refresh().catch(() => {}), 60); };
const mine = (...ids) => folderId && ids.includes(folderId);
chrome.bookmarks.onCreated.addListener((id, n) => mine(n.parentId) && soon());
chrome.bookmarks.onRemoved.addListener(id => (id === folderId ? boot().then(n => n || lost()).catch(() => {}) : folderId && soon()));   // a removed parent takes ours too
chrome.bookmarks.onChanged.addListener((id, c) => (id === folderId ? chrome.storage.sync.set({ folderName: c.title }) : soon()));
chrome.bookmarks.onMoved.addListener((id, m) => (id === folderId ? soon() : mine(m.parentId, m.oldParentId) && soon()));
chrome.bookmarks.onChildrenReordered.addListener(id => mine(id) && soon());
chrome.bookmarks.onImportEnded.addListener(soon);

export async function add(url, title) {
  if (!folderId) return;
  try { await chrome.bookmarks.create({ parentId: folderId, url, title: title || host(url) }); toast(t('added')); }
  catch { toast(t('failed')); }
}
async function del(n) {
  await chrome.bookmarks.remove(n.id);
  toast(t('deleted'), t('undo'), () => chrome.bookmarks.create({ parentId: n.parentId, index: n.index, title: n.title, url: n.url }), 6000);
}
const web = u => /^https?:/i.test(u);
const open = url => (S.newTab ? chrome.tabs.create({ url }) : web(url) ? (location.href = url) : chrome.tabs.update({ url }));

/* Add / edit dialog */
const dlg = $('#dlg'), fTitle = dlg.querySelector('[name=title]'), fUrl = dlg.querySelector('[name=url]');
export function edit(n) {
  fTitle.value = n?.title || ''; fUrl.value = n?.url || '';
  dlg.returnValue = '';
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'ok') return;
    const url = fixUrl(fUrl.value), title = fTitle.value.trim() || host(url);
    if (!url) return toast(t('badUrl'));
    if (!n) return add(url, title);
    await chrome.bookmarks.update(n.id, { title, url }).catch(() => toast(t('failed')));
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
document.addEventListener('click', e => {
  if (at(e).closest('#add-tile')) return edit();
  const a = at(e).closest('.tile[href]');                 // chrome://, file:// … can't be opened by a plain link from this page
  if (a && !web(a.href) && e.button === 0) { e.preventDefault(); run(() => open(a.href)); }
});

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
  if (d && S.keys && e.altKey && !e.ctrlKey && !e.metaKey && nodes[d[1] - 1]) { e.preventDefault(); const { url } = nodes[d[1] - 1]; run(() => open(url)); }
});
