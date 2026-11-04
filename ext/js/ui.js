// Small DOM helpers shared by every module.
export const $ = q => document.querySelector(q);
export const at = e => (e.target instanceof Element ? e.target : document.body);   // document-level events have no .closest
export const h = (tag, props = {}, ...kids) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids.filter(k => k || k === 0));         // falsy children are skipped
  return el;
};
export const icon = d => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = d; return s; };
export const ICONS = {
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  down: '<path d="M12 4v12M6 10l6 6 6-6M5 20h14"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M5 20h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
};

// Settings live in a lazily loaded module: nothing of it is parsed until the first open.
export const settings = (cat, toggle) => import('./panel.js').then(m => (toggle ? m.toggle(cat) : m.open(cat)));

let toastTimer;
export function toast(msg, action, fn, ms = 4500) {
  const el = $('#toast'), b = el.querySelector('button');
  el.querySelector('span').textContent = msg;
  b.hidden = !action; b.textContent = action || '';
  b.onclick = () => { el.hidden = true; fn(); };
  el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), ms);
}

const menuEl = () => $('#menu');
export function menu(x, y, items) {           // items: [label, fn, className?] or null for a divider
  const m = menuEl();
  m.replaceChildren(...items.map(it => it ? h('button', { textContent: it[0], className: it[2] || '', onclick: () => { m.hidden = true; it[1](); } }) : h('hr')));
  m.hidden = false;
  const r = m.getBoundingClientRect();         // measured after it is visible
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
document.addEventListener('click', e => { if (!at(e).closest('#menu')) menuEl().hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') menuEl().hidden = true; });
