// First run (and after a reset): the logo opens, then either "Get started" or "Continue" with the folder we found.
import { $, toast } from './ui.js';
import { t } from './i18n.js';
import { buildLogo, play } from './logo.js';
import * as L from './links.js';

const W = $('#welcome'), text = W.querySelector('p'), go = $('#start');
let found = null;

function words() {
  buildLogo($('#logo'), W.classList.contains('open'));
  text.textContent = t('welcomeText') + ' ' + (found ? t('foundFolder', found.title, L.nodes.length) : t('welcomeNew'));
  go.textContent = t(found ? 'continue' : 'start');
}
document.addEventListener('flit:lang', words);

export function show(n) {
  found = n;
  words();
  if (!W.hidden) return;
  W.hidden = false;
  requestAnimationFrame(() => { W.classList.add('open'); play($('#logo')); });
}
go.onclick = async () => {
  go.disabled = true;
  try {
    if (!found) await L.create();
    await chrome.storage.local.set({ welcomed: 1 });
  } catch { return toast(t('failed')); }
  finally { go.disabled = false; }
  W.hidden = true; W.classList.remove('open');
  if (found) L.legacy(found); else toast(t('created'), null, null, 10000);
};
