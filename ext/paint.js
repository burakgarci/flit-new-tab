// Runs at the end of <body>, still before first paint: draw cached links and background.
(() => {
  const F = window.FLIT;
  const fav = u => chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(u) + '&size=32';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  F.SAFE = /^(https?|file|ftp|chrome|edge|brave|vivaldi|opera|about):$/i;   // never javascript:, data:, blob:
  F.safe = u => { try { return F.SAFE.test(new URL(u).protocol); } catch { return false; } };
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
    if (F.s.addTile || (known && !list.length)) {      // an empty folder shows one faint "+"
      const p = document.createElement('button');
      p.className = list.length ? 'tile g add' : 'tile g add ghost'; p.id = 'add-tile'; p.textContent = '+';
      if (F.addLabel) p.title = p.ariaLabel = F.addLabel;
      nav.append(p);
    }
  };

  F.bg = (s, src) => {
    const bg = document.getElementById('bg'), img = document.getElementById('bg-img'), fill = document.getElementById('bg-fill');
    const b = s.bg;
    bg.style.background = b.mode === 'gradient' ? `linear-gradient(135deg, ${F.G[b.gradient]?.[0]}, ${F.G[b.gradient]?.[1]})`
      : b.mode === 'color' ? b.color : '';
    if (b.mode !== 'image') { img.removeAttribute('srcset'); img.removeAttribute('src'); fill.removeAttribute('src'); img.classList.remove('on'); return; }
    if (!src && /^(custom|bing)$/.test(b.image)) return;   // custom / bing come from IndexedDB (bg.js)
    const w = `wallpapers/${b.image}.webp`;
    if (img.getAttribute('src') === (src || w)) return;
    img.classList.remove('on');
    img.onload = () => img.classList.add('on');
    if (src) { img.removeAttribute('srcset'); fill.src = src; }
    else {                                             // a 2560px copy unless the screen needs more; the blurred fill needs no detail
      img.srcset = `wallpapers/2560/${b.image}.webp 2560w, ${w} 3840w`;
      fill.src = `wallpapers/thumbs/${b.image}.webp`;
    }
    img.src = src || w;
  };

  let links = null;
  try { links = JSON.parse(localStorage.getItem('flit:links')); } catch {}
  F.cached = Array.isArray(links) ? links.filter(n => n && F.safe(n.url)) : [];
  F.render(F.cached, Array.isArray(links));
  F.bg(F.s);
})();
