// Runs in <head> before first paint: apply cached settings so the page never "jumps".
(() => {
  const D = {
    theme: 'dark', density: 'normal', cols: 0, flow: 'col', align: 'top', addTile: false,
    icons: 'normal', caps: 'none', newTab: false, keys: true, lang: 'auto', credit: true,
    bg: { mode: 'image', image: 'abstract-aurora', gradient: 0, color: '#16181f', fit: 'cover', dim: 0.15, blur: 0 }
  };
  const G = [
    ['#0f2027', '#2c5364'], ['#232526', '#414345'], ['#2f0743', '#41295a'],
    ['#1e3c72', '#2a5298'], ['#3a1c71', '#d76d77'], ['#134e5e', '#71b280']
  ];
  const C = ['#16181f', '#1f2a36', '#2b2238', '#1f2b24', '#34302a', '#e9e7e2'];
  // Only known keys with valid values survive, so a broken cache, sync value or backup can't break the page.
  const one = (v, list, d) => (list.includes(v) ? v : d);
  const num = (v, lo, hi, d) => (typeof v === 'number' && v >= lo && v <= hi ? v : d);
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const clean = (s, b = s.bg || {}, x = D.bg) => ({
    theme: one(s.theme, ['dark', 'light', 'system'], D.theme), density: one(s.density, ['compact', 'normal', 'wide'], D.density),
    cols: one(s.cols, [0, 2, 3, 4, 5, 6], D.cols), flow: one(s.flow, ['col', 'row'], D.flow), align: one(s.align, ['top', 'center', 'bottom'], D.align),
    icons: one(s.icons, ['normal', 'dim', 'mono'], D.icons), caps: one(s.caps, ['none', 'lower', 'upper'], D.caps),
    addTile: bool(s.addTile, D.addTile), newTab: bool(s.newTab, D.newTab), keys: bool(s.keys, D.keys), credit: bool(s.credit, D.credit),
    lang: /^(auto|[a-z]{2,3})$/.test(s.lang) ? s.lang : D.lang,
    bg: { mode: one(b.mode, ['image', 'gradient', 'color'], x.mode), image: /^[\w-]{1,64}$/.test(b.image) ? b.image : x.image,
      gradient: one(b.gradient, G.map((_, i) => i), x.gradient), color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : x.color,
      fit: one(b.fit, ['cover', 'contain', 'center'], x.fit), dim: num(b.dim, 0, 0.7, x.dim), blur: num(b.blur, 0, 24, x.blur) }
  });
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const merge = (a, b) => clean({ ...obj(a), ...obj(b), bg: { ...obj(obj(a).bg), ...obj(obj(b).bg) } });
  let s = null;
  try { s = JSON.parse(localStorage.getItem('flit:s')); } catch {}
  s = merge(D, s);
  const h = document.documentElement;
  const apply = s => {
    const light = s.theme === 'light' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    Object.assign(h.dataset, { theme: light ? 'light' : 'dark', density: s.density, cols: s.cols, flow: s.flow, align: s.align, icons: s.icons, caps: s.caps, fit: s.bg.fit });
    h.style.setProperty('--dim', s.bg.dim);
    h.style.setProperty('--blur', s.bg.blur + 'px');
    h.style.setProperty('--cols', s.cols);
  };
  apply(s);
  window.FLIT = { D, G, C, s, merge, apply };
})();
