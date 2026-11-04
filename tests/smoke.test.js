// Loads the extension in Chromium and walks the main path: welcome → links → settings → reset.
// Needs: npm install && npx playwright install chromium
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {}
const ext = path.join(__dirname, '..', 'ext');

test('new tab works end to end', { skip: !chromium && 'playwright not installed', timeout: 60000 }, async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'flit-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const errors = [];
  try {
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto('chrome://newtab/');

    // First run: welcome, then a "Flit" folder is created
    await page.waitForSelector('#welcome:not([hidden]) #start');
    await page.click('#start');
    await page.waitForSelector('#welcome', { state: 'hidden' });
    const folderId = await page.evaluate(async () => (await chrome.storage.local.get('folderId')).folderId);
    assert.ok(folderId);

    // Broken settings fall back to defaults instead of breaking the page
    const fixed = await page.evaluate(() => FLIT.merge(FLIT.D, { theme: 'x', cols: '9', bg: { dim: 'a', color: 'red;}', image: '../x' }, lang: '<b>' }));
    assert.deepStrictEqual(fixed, await page.evaluate(() => FLIT.D));

    // Unsafe addresses never become tiles
    await page.evaluate(async id => {
      await chrome.bookmarks.create({ parentId: id, title: 'js', url: 'javascript:alert(1)' });
      await chrome.bookmarks.create({ parentId: id, title: 'data', url: 'data:text/html,hi' });
    }, folderId);
    await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('.tile[href^="javascript:"], .tile[href^="data:"]').count(), 0);

    // Bookmarks added anywhere show up as tiles
    await page.evaluate(async id => {
      for (const n of await chrome.bookmarks.getChildren(id)) await chrome.bookmarks.remove(n.id);
    }, folderId);
    await page.waitForSelector('#add-tile.ghost');                  // empty folder: one faint "+"
    await page.evaluate(async id => {
      for (const n of ['one', 'two', 'three']) await chrome.bookmarks.create({ parentId: id, title: n, url: `https://${n}.example` });
    }, folderId);
    await page.waitForFunction(() => document.querySelectorAll('.tile[data-id]').length === 3);

    // Settings: opens centered, a change applies at once and survives a reload
    await page.click('#gear');
    await page.waitForSelector('#panel[open]');
    await page.click('#cats [data-cat=look]');
    await page.click('.seg[data-key=caps] [data-v=upper]');
    assert.strictEqual(await page.getAttribute('html', 'data-caps'), 'upper');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => document.querySelector('#panel').open), false);
    await page.waitForTimeout(600);                                    // sync write is debounced
    await page.reload();
    assert.strictEqual(await page.getAttribute('html', 'data-caps'), 'upper');
    await page.waitForFunction(() => document.querySelectorAll('.tile[data-id]').length === 3);

    // Backup holds what was ticked: settings and links by default
    await page.click('#gear');
    await page.click('#cats [data-cat=data]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
    const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    assert.strictEqual(backup.settings.caps, 'upper');
    assert.strictEqual(backup.links.length, 3);
    assert.ok(!('image' in backup));
    await page.keyboard.press('Escape');

    // Reset settings + folder choice: defaults come back, bookmarks stay, welcome offers to continue
    await page.click('#gear');
    await page.click('#cats [data-cat=data]');
    await page.check('[data-rs=folder]');
    await page.click('#reset');
    await page.click('#ask [value=ok]');
    await page.waitForSelector('#welcome:not([hidden]) #start');
    assert.strictEqual(await page.getAttribute('html', 'data-caps'), 'none');
    assert.strictEqual(await page.evaluate(id => chrome.bookmarks.getChildren(id).then(k => k.length), folderId), 3);
    await page.click('#start');
    await page.waitForSelector('#welcome', { state: 'hidden' });
    assert.strictEqual(await page.locator('.tile[data-id]').count(), 3);

    assert.deepStrictEqual(errors, []);
  } finally {
    await ctx.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
