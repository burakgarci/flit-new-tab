// Settings: defaults and first-paint copy live in boot.js; chrome.storage.sync is the source of truth.
const F = window.FLIT;
export let S = F.s;
const subs = new Set();
export const onChange = fn => subs.add(fn);           // called when settings arrive from elsewhere (sync, import, another tab)
export const get = k => k.split('.').reduce((o, p) => o?.[p], S);
export const patchOf = (k, v) => { const [a, b] = k.split('.'); return b ? { [a]: { [b]: v } } : { [a]: v }; };

const keep = () => { F.s = S; localStorage.setItem('flit:s', JSON.stringify(S)); F.apply(S); };
let syncTimer;
export function save(patch) {
  S = F.merge(S, patch); keep();
  clearTimeout(syncTimer);                              // sliders fire often; sync allows 120 writes/min
  syncTimer = setTimeout(() => chrome.storage.sync.set({ settings: S }), 400);
}
export function replace(next) {
  S = F.merge(F.D, next); keep();
  subs.forEach(fn => fn());
}
const same = s => JSON.stringify(F.merge(F.D, s)) === JSON.stringify(S);

export async function init() {
  const { settings, wallpaperEnabled } = await chrome.storage.sync.get(['settings', 'wallpaperEnabled']);
  if (settings) { if (!same(settings)) replace(settings); }
  else {                                                 // first run, or upgrade from v1.x
    if (wallpaperEnabled === false) { save({ bg: { mode: 'color' } }); subs.forEach(fn => fn()); }
    chrome.storage.sync.set({ settings: S });
  }
  ['background-image', 'background-last-update', 'using-direct-url'].forEach(k => localStorage.removeItem(k));
}
chrome.storage.onChanged.addListener((c, area) => {
  const v = area === 'sync' && c.settings?.newValue;
  if (v && !same(v)) replace(v);
});
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => F.apply(S));
