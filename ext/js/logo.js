// "FLIT" whose letters open into the slogan: Fast Links, Instant Tab / Favori Linkler, İlk Tıkta.
import { t } from './i18n.js';
const COLORS = ['#ff8a5b', '#ffd166', '#3ddc97', '#7aa2ff'];
export function buildLogo(el, open) {
  el.replaceChildren(...t('slogan').split(' ').map((w, i) => {
    const s = document.createElement('span'), b = document.createElement('b'), it = document.createElement('i'), r = document.createElement('span');
    s.className = 'w'; b.style.setProperty('--c', COLORS[i % 4]);
    b.textContent = w[0] === 'İ' ? 'I' : w[0];           // Turkish İ: the dot drops in while opening
    if (w[0] === 'İ') b.className = 'dot';
    r.textContent = w.slice(1); it.append(r); s.append(b, it);
    return s;
  }));
  el.classList.toggle('open', !!open);
}
export function play(el, hold = 1400) {             // closing takes .7s, then it rests closed a moment
  el.classList.remove('open');
  setTimeout(() => el.classList.add('open'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : hold);
}
