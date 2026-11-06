// Edge cases: cached tiles survive a settings sync, the last change survives a closed tab,
// only showable addresses become bookmarks, sliders don't reload the image, opening a tab writes nothing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const ext = path.join(__dirname, '..', 'ext');

test('edge cases', { skip: !chromium && 'playwright not installed', timeout: 60000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'flit-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const errors = [];
  const open = async init => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    if (init) await p.addInitScript(init);
    await p.goto('chrome://newtab/');
    return p;
  };
  try {
    let page = await open(() => { chrome.permissions.request = async () => false; });   // headless can't answer the most-visited prompt
    await page.click('#start');
    await page.waitForSelector('#welcome', { state: 'hidden' });
    const id = await page.evaluate(async () => (await chrome.storage.local.get('folderId')).folderId);
    assert.strictEqual(await page.evaluate(() => chrome.permissions.contains({ permissions: ['topSites'] })), false);

    // Bundled wallpapers: the 2560px copy on an ordinary screen, the thumbnail for the blurred fill
    await page.waitForFunction(() => document.getElementById('bg-img').classList.contains('on'));
    assert.match(await page.evaluate(() => document.getElementById('bg-img').currentSrc), /\/wallpapers\/2560\/abstract-aurora\.webp$/);
    assert.match(await page.getAttribute('#bg-fill', 'src'), /^wallpapers\/thumbs\//);
    await page.evaluate(async id => {
      for (const n of await chrome.bookmarks.getChildren(id)) await chrome.bookmarks.remove(n.id);
      for (const n of ['one', 'two', 'three']) await chrome.bookmarks.create({ parentId: id, title: n, url: `https://${n}.example/` });
    }, id);
    await page.waitForFunction(() => document.querySelectorAll('.tile[data-id]').length === 3);

    // Only addresses a tile can show become bookmarks; "localhost:3000" is a host
    const fixed = await page.evaluate(async () => {
      const { fixUrl } = await import('./js/links.js');
      return ['javascript:alert(1)', 'mailto:a@b.co', 'localhost:3000', 'http://localhost:3000', 'example.com', 'about:blank'].map(fixUrl);
    });
    assert.deepStrictEqual(fixed, ['', '', 'https://localhost:3000/', 'http://localhost:3000/', 'https://example.com/', 'about:blank']);
    await page.evaluate(() => {
      const dt = new DataTransfer(); dt.setData('text/plain', 'javascript:alert(1)');
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    const backup = path.join(profile, 'backup.json');
    fs.writeFileSync(backup, JSON.stringify({ flit: 2, links: [{ title: 'x', url: 'javascript:alert(1)' }] }));
    await page.click('#gear');
    await page.click('#cats [data-cat=data]');
    await page.setInputFiles('#import', backup);
    await page.waitForSelector('#toast:not([hidden])');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(id => chrome.bookmarks.getChildren(id).then(k => k.length), id), 3);

    // Sliders only change CSS: your own image is not reloaded
    await page.evaluate(async () => {
      const c = new OffscreenCanvas(64, 40); c.getContext('2d').fillRect(0, 0, 64, 40);
      await (await import('./js/bg.js')).setCustom(await c.convertToBlob());
    });
    await page.waitForFunction(() => document.getElementById('bg-img').classList.contains('on'));
    const src = await page.getAttribute('#bg-img', 'src');
    assert.ok(src.startsWith('blob:') && !(await page.getAttribute('#bg-img', 'srcset')));
    await page.click('#gear');
    await page.click('#cats [data-cat=bg]');
    for (const v of ['0.3', '0.5']) await page.fill('input[data-key="bg.dim"]', v);
    await page.waitForTimeout(200);
    assert.strictEqual(await page.getAttribute('#bg-img', 'src'), src);
    assert.strictEqual(await page.evaluate(() => document.documentElement.style.getPropertyValue('--dim')), '0.5');
    await page.keyboard.press('Escape');

    // The last change survives closing the tab right away (the sync write is debounced)
    await page.evaluate(async () => (await import('./js/store.js')).save({ caps: 'upper' }));
    await page.close({ runBeforeUnload: true });
    page = await open();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.getAttribute('html', 'data-caps'), 'upper');

    // Settings changed on another device: the cached tiles stay
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('flit:s')); s.theme = 'light';
      localStorage.setItem('flit:s', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.getAttribute('html', 'data-theme'), 'dark');
    assert.strictEqual(await page.locator('.tile[data-id]').count(), 3);

    // Keyboard: a visible ring on tiles; the menu takes focus, arrows move, Esc goes back to the tile
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement.matches('.tile') && getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    await page.keyboard.press('Shift+F10');
    assert.ok(await page.evaluate(() => document.activeElement.matches('#menu [role=menuitem]:first-child')));
    await page.keyboard.press('ArrowUp');
    assert.ok(await page.evaluate(() => document.activeElement.matches('#menu [role=menuitem]:last-child')));
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => document.querySelector('#menu').hidden && document.activeElement.matches('.tile')));

    // Screen readers hear the chosen option
    await page.click('#gear');
    await page.click('#cats [data-cat=look]');
    assert.strictEqual(await page.getAttribute('.seg[data-key=caps] [aria-pressed=true]', 'data-v'), 'upper');
    assert.ok(await page.getAttribute('.seg[data-key=caps]', 'aria-labelledby'));
    await page.keyboard.press('Escape');

    // A fixed column count gives way in a narrow window
    await page.evaluate(async () => (await import('./js/store.js')).save({ cols: 6 }));
    await page.setViewportSize({ width: 600, height: 700 });
    assert.ok(await page.evaluate(() => document.querySelector('.tile[data-id]').offsetWidth >= 150));
    await page.evaluate(async () => (await import('./js/store.js')).save({ flow: 'row' }));
    assert.ok(await page.evaluate(() => document.querySelector('.tile[data-id]').offsetWidth >= 150));
    await page.setViewportSize({ width: 1600, height: 900 });
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('links')).gridTemplateColumns.split(' ').length), 6);

    // Opening a tab writes nothing to storage
    const quiet = await open(() => {
      window.writes = [];
      for (const a of ['local', 'sync']) {
        const set = chrome.storage[a].set.bind(chrome.storage[a]);
        chrome.storage[a].set = v => (window.writes.push(a), set(v));
      }
    });
    await quiet.waitForTimeout(800);
    assert.deepStrictEqual(await quiet.evaluate(() => window.writes), []);

    assert.deepStrictEqual(errors, []);
  } finally {
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
