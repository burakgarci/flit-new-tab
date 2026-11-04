// Background: bundled wallpapers, gradients, colors; your own image and Bing are kept in IndexedDB.
import { S, save } from './store.js';
import { $, at, h, icon, ICONS, toast, ask } from './ui.js';
import { t, lang } from './i18n.js';

const F = window.FLIT;
export const BING = { origins: ['https://www.bing.com/*'] };
export const WP = fetch('wallpapers/wallpapers.json').then(r => r.json()).catch(() => []);
export let objUrl = null;

const idb = (mode, fn) => new Promise((res, rej) => {
  const o = indexedDB.open('flit', 1);
  o.onupgradeneeded = () => o.result.createObjectStore('kv');
  o.onerror = () => rej(o.error);
  o.onsuccess = () => {
    const tx = o.result.transaction('kv', mode), r = fn(tx.objectStore('kv'));
    tx.oncomplete = () => res(r.result); tx.onerror = () => rej(tx.error);
  };
});
export const getRec = k => idb('readonly', s => s.get(k)).catch(() => null);
export const putRec = (k, v) => idb('readwrite', s => s.put(v, k));
const stored = () => S.bg.mode === 'image' && /^(custom|bing)$/.test(S.bg.image);
const changed = () => document.dispatchEvent(new Event('flit:bg'));

export async function showStored() {
  if (!stored()) return;
  const rec = await getRec(S.bg.image);
  if (!rec) return;
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(rec.blob);
  F.bg(S, objUrl);
  changed();
}
export async function show() {
  if (!stored() && objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
  F.bg(S); await showStored(); showCredit(); changed();
}
export const pick = bg => { save({ bg }); show(); };

export const askBg = async file => { if (await ask(t('setAsBg'), t('use'))) setCustom(file); };
export async function setCustom(file, use = true) {
  let blob = file;
  try {
    const bm = await createImageBitmap(file), k = Math.min(1, 3840 / bm.width);
    if (k < 1 || file.size > 4e6) {                       // keep IndexedDB small: at most 4K, webp
      const c = new OffscreenCanvas(Math.round(bm.width * k), Math.round(bm.height * k));
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      blob = await c.convertToBlob({ type: 'image/webp', quality: 0.88 });
    }
  } catch { return toast(t('badFile')); }
  await putRec('custom', { blob });
  if (use) pick({ mode: 'image', image: 'custom' }); else show();
}
const ANON = { credentials: 'omit', referrerPolicy: 'no-referrer' };   // nothing about the user goes with the request
export async function bing(force) {                       // once a day; the new image shows on the next tab
  if (!(await chrome.permissions.contains(BING))) return false;
  const rec = await getRec('bing'), day = new Date().toDateString();
  if (!force && rec?.day === day) return true;
  try {
    const mkt = lang() === 'tr' ? 'tr-TR' : 'en-US';
    const im = (await (await fetch(`https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${mkt}`, ANON)).json()).images[0];
    const size = screen.width * devicePixelRatio > 1920 ? '_UHD.jpg' : '_1920x1080.jpg';
    const src = new URL(im.urlbase + size, 'https://www.bing.com');
    if (src.origin !== 'https://www.bing.com') return false;
    const blob = await (await fetch(src, ANON)).blob();
    if (!blob.type.startsWith('image/')) return false;
    const page = /^https:\/\//.test(im.copyrightlink) ? im.copyrightlink : '';
    await putRec('bing', { blob, day, credit: { name: String(im.title || im.copyright || 'Bing'), loc: String(im.copyright || ''), page } });
    return true;
  } catch { return false; }
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
