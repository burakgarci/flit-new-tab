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
  const merge = (a, b) => ({ ...a, ...b, bg: { ...a.bg, ...(b && b.bg) } });
  let s = null;
  try { s = JSON.parse(localStorage.getItem('flit:s')); } catch {}
  s = merge(D, s);
  const h = document.documentElement;
  const apply = s => {
    const light = s.theme === 'light' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    Object.assign(h.dataset, { theme: light ? 'light' : 'dark', density: s.density, cols: s.cols, flow: s.flow, align: s.align, icons: s.icons, caps: s.caps, fit: s.bg.fit });
    h.style.setProperty('--dim', s.bg.dim);
    h.style.setProperty('--blur', s.bg.blur + 'px');
  };
  apply(s);
  window.FLIT = { D, G, C, s, merge, apply };
})();
