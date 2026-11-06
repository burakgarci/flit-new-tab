// Background: bundled wallpapers, gradients, colors; your own image and Bing are kept in IndexedDB.
import { S, save } from './store.js';
import { $, at, h, icon, ICONS, toast, ask } from './ui.js';
import { t, lang } from './i18n.js';

const F = window.FLIT;
export const BING = { origins: ['https://www.bing.com/*'] };
export const WP = fetch('wallpapers/wallpapers.json').then(r => r.json()).catch(() => []);
export let objUrl = null;

let dbP = null;                                           // one connection per page, let go when a reset deletes the database
const db = () => dbP ||= new Promise((res, rej) => {
  const o = indexedDB.open('flit', 1);
  o.onupgradeneeded = () => o.result.createObjectStore('kv');
  o.onsuccess = () => { const d = o.result; d.onversionchange = () => { d.close(); dbP = null; }; res(d); };
  o.onerror = () => { dbP = null; rej(o.error); };
});
const idb = async (mode, fn) => {
  const tx = (await db()).transaction('kv', mode), r = fn(tx.objectStore('kv'));
  return new Promise((res, rej) => { tx.oncomplete = () => res(r.result); tx.onerror = () => rej(tx.error); });
};
export const getRec = k => idb('readonly', s => s.get(k)).catch(() => null);
export const putRec = (k, v) => idb('readwrite', s => s.put(v, k));
const stored = () => S.bg.mode === 'image' && /^(custom|bing)$/.test(S.bg.image);
const changed = () => document.dispatchEvent(new Event('flit:bg'));
const imgs = () => document.dispatchEvent(new Event('flit:imgs'));   // your image or Bing's was replaced

let objKey = null;
export async function showStored(fresh) {                 // fresh: the stored image itself changed
  if (!stored()) return;
  if (!fresh && objUrl && objKey === S.bg.image) return F.bg(S, objUrl);
  const rec = await getRec(S.bg.image);
  if (!rec) return;
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(rec.blob); objKey = S.bg.image;
  F.bg(S, objUrl);
  changed();
}
export async function show(fresh) {
  if (!stored() && objUrl) { URL.revokeObjectURL(objUrl); objUrl = objKey = null; }
  F.bg(S); await showStored(fresh); showCredit(); changed();
}
export const pick = (bg, fresh) => { save({ bg }); show(fresh); };

export const askBg = async file => { if (await ask(t('setAsBg'), t('use'))) setCustom(file); };
export async function setCustom(file, use = true) {
  let blob = file;
  try {
    const bm = await createImageBitmap(file), k = Math.min(1, 3840 / Math.max(bm.width, bm.height));
    if (k < 1 || file.size > 4e6) {                       // keep IndexedDB small: at most 4K on the long side, webp
      const c = new OffscreenCanvas(Math.round(bm.width * k), Math.round(bm.height * k));
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      blob = await c.convertToBlob({ type: 'image/webp', quality: 0.88 });
    }
    bm.close();
  } catch { return toast(t('badFile')); }
  try { await putRec('custom', { blob }); } catch { return toast(t('failed')); }
  imgs();
  if (use) save({ bg: { mode: 'image', image: 'custom' } });
  show(true);
}
const ANON = () => ({ credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });   // nothing about the user goes with it
const FAIL = 'flit:bingFail';
export async function bing(user) {                        // once a day; the new image shows on the next tab
  if (!(await chrome.permissions.contains(BING))) return false;
  const rec = await getRec('bing'), day = new Date().toDateString();
  if (rec?.day === day) return true;
  if (!user && Date.now() - (+localStorage.getItem(FAIL) || 0) < 36e5) return false;   // offline: retry in an hour, not on every tab
  try {
    const mkt = lang() === 'tr' ? 'tr-TR' : 'en-US';
    const im = (await (await fetch(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${mkt}`, ANON())).json()).images[0];
    const size = screen.width * devicePixelRatio > 1920 ? '_UHD.jpg' : '_1920x1080.jpg';
    const src = new URL(im.urlbase + size, 'https://www.bing.com');
    if (src.origin !== 'https://www.bing.com') throw 0;
    const blob = await (await fetch(src, ANON())).blob();
    if (!blob.type.startsWith('image/')) throw 0;
    const page = /^https:\/\//.test(im.copyrightlink) ? im.copyrightlink : '';
    await putRec('bing', { blob, day, credit: { name: String(im.title || im.copyright || 'Bing'), loc: String(im.copyright || ''), page } });
    localStorage.removeItem(FAIL); imgs();
    return true;
  } catch { localStorage.setItem(FAIL, Date.now()); return false; }
}

/* Photo credit: a quiet name in the corner; click for the card */
const pop = $('#credit-pop'), btn = $('#credit');
async function creditOf() {
  const b = S.bg;
  if (!S.credit || b.mode !== 'image' || b.image === 'custom') return null;
  if (b.image === 'bing') {
    const c = (await getRec('bing'))?.credit;
    return c && { ...c, by: 'Bing', thumb: () => objUrl, file: () => objUrl, name_: 'flit-bing.jpg' };
  }
  const w = (await WP).find(w => w.id === b.image);
  return w?.username && { name: w.author, user: w.username, page: w.page, loc: w.location, by: 'Unsplash',
    thumb: () => w.thumb, file: () => `wallpapers/${w.id}.webp`, name_: `flit-${w.id}.webp` };
}
export async function showCredit() {
  const c = await creditOf();
  btn.hidden = !c; pop.hidden = true;
  if (!c) return;
  btn.querySelector('span').textContent = c.name;
  btn.classList.add('fresh'); setTimeout(() => btn.classList.remove('fresh'), 4000);
  btn.onclick = () => { if (pop.hidden) card(c); pop.hidden = !pop.hidden; };
}
function card(c) {
  const utm = '?utm_source=flit&utm_medium=referral';
  const act = (ico, label, href, file) => {
    const a = h('a', { href, rel: 'noopener' }, icon(ICONS[ico]), h('span', { textContent: label }));
    if (file) a.download = file; else a.target = '_blank';
    return a;
  };
  pop.replaceChildren(
    h('img', { className: 'shot', src: c.thumb() || '', alt: '' }),
    h('div', { className: 'meta' }, h('strong', { textContent: c.name }), h('span', { textContent: c.user ? `@${c.user} · ${c.by}` : c.by })),
    c.loc && h('div', { className: 'loc', title: c.loc }, icon(ICONS.pin), h('span', { textContent: c.loc })),
    h('div', { className: 'acts' },
      c.user && act('person', t('profile'), `https://unsplash.com/@${c.user}${utm}`),
      c.page && act('open', t('photoPage'), c.page + (c.user ? utm : '')),
      c.file() && act('down', t('download'), c.file(), c.name_))
  );
}
document.addEventListener('click', e => { if (!at(e).closest('#credit, #credit-pop')) pop.hidden = true; });
