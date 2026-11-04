// Runs at the end of <body>, still before first paint: draw cached links and background.
(() => {
  const F = window.FLIT;
  const fav = u => chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(u) + '&size=32';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  F.tile = n => {
    const a = document.createElement('a');
    a.className = 'tile g'; a.href = n.url; a.draggable = true;
    a.dataset.id = n.id; a.dataset.index = n.index;
    if (F.s.newTab) a.target = '_blank';
    const i = document.createElement('img'); i.src = fav(n.url); i.alt = ''; i.width = i.height = 16;
    const t = document.createElement('span'); t.textContent = n.title || host(n.url);
    a.append(i, t);
    return a;
  };
  F.render = (list, known = true) => {
    const nav = document.getElementById('links');
    nav.replaceChildren(...list.map(F.tile));
    if (F.s.addTile) {
      const p = document.createElement('button'); p.className = 'tile g add'; p.id = 'add-tile'; p.textContent = '+';
      nav.append(p);
    }
    document.getElementById('empty').hidden = !known || list.length > 0;
  };

  F.bg = (s, src) => {
    const bg = document.getElementById('bg'), img = document.getElementById('bg-img'), fill = document.getElementById('bg-fill');
    const b = s.bg;
    bg.style.background = b.mode === 'gradient' ? `linear-gradient(135deg, ${F.G[b.gradient]?.[0]}, ${F.G[b.gradient]?.[1]})`
      : b.mode === 'color' ? b.color : '';
    if (b.mode !== 'image') { img.removeAttribute('src'); fill.removeAttribute('src'); img.classList.remove('on'); return; }
    src = src || (/^(custom|bing)$/.test(b.image) ? '' : `wallpapers/${b.image}.webp`);
    if (!src) return;                                  // custom / bing come from IndexedDB (app.js)
    if (img.getAttribute('src') === src) return;
    img.classList.remove('on');
    img.onload = () => img.classList.add('on');
    img.src = fill.src = src;
  };

  let links = null;
  try { links = JSON.parse(localStorage.getItem('flit:links')); } catch {}
  F.cached = links || [];
  F.render(F.cached, links !== null);
  F.bg(F.s);
})();
