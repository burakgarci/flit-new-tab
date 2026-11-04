// Entry point. boot.js and paint.js have already drawn the cached page; this brings it up to date.
import { S, init, onChange } from './store.js';
import { loadLang, t } from './i18n.js';
import { $, settings } from './ui.js';
import * as L from './links.js';
import * as B from './bg.js';

const F = window.FLIT;
const welcome = n => import('./welcome.js').then(m => m.show(n));
L.onLost(() => welcome(null));
onChange(() => { loadLang(); L.render(); B.show(); });       // settings changed in another tab, device or by import
document.addEventListener('flit:lang', () => {
  F.addLabel = t('addLink');
  document.querySelectorAll('#add-tile').forEach(b => (b.title = b.ariaLabel = F.addLabel));
});
$('#gear').onclick = () => settings(null, true);

await Promise.all([loadLang(), init()]);
const n = await L.boot();
if (!n || !(await chrome.storage.local.get('welcomed')).welcomed) welcome(n); else L.legacy(n);
B.showStored(); B.showCredit();
if (S.bg.mode === 'image' && S.bg.image === 'bing') B.bing();
if (location.hash === '#settings') settings();
