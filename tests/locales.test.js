// Every language has the same keys and placeholders, and every key the UI asks for exists.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ext = path.join(__dirname, '..', 'ext');
const langs = fs.readdirSync(path.join(ext, '_locales'));
const read = l => JSON.parse(fs.readFileSync(path.join(ext, '_locales', l, 'messages.json'), 'utf8'));
const en = read('en');
const holes = s => (s.match(/\$\d/g) || []).sort().join();

for (const l of langs) {
  test(`${l}: same keys and placeholders as English`, () => {
    const m = read(l);
    assert.deepStrictEqual(Object.keys(m).sort(), Object.keys(en).sort());
    for (const k in en) assert.strictEqual(holes(m[k].message), holes(en[k].message), `${l}.${k}`);
    for (const k in m) assert.ok(m[k].message.trim(), `${l}.${k} is empty`);
  });
}

test('every key used by the page and scripts exists', () => {
  const html = fs.readFileSync(path.join(ext, 'newtab.html'), 'utf8');
  const js = fs.readdirSync(path.join(ext, 'js')).map(f => fs.readFileSync(path.join(ext, 'js', f), 'utf8')).join('\n');
  const used = new Set([
    ...[...html.matchAll(/data-i18n(?:-title|-ph|-label)?="(\w+)"/g)].map(m => m[1]),
    ...[...js.matchAll(/\bt\('(\w+)'/g)].map(m => m[1])
  ]);
  for (const k of used) assert.ok(en[k], `missing key: ${k}`);
});

test('LANGS lists exactly the bundled languages', () => {
  const src = fs.readFileSync(path.join(ext, 'js', 'i18n.js'), 'utf8');
  const listed = [...src.match(/LANGS = \{([^}]*)\}/)[1].matchAll(/(\w+):/g)].map(m => m[1]);
  assert.deepStrictEqual(listed.sort(), langs.sort());
});

test('manifest strings resolve', () => {
  const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  for (const v of [man.name, man.description]) assert.ok(en[v.replace(/^__MSG_|__$/g, '')], v);
});
