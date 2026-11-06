# Working on Flit New Tab

A Chrome (MV3) new tab page that shows the links of one bookmark folder. Plain HTML, CSS and ES modules — no framework, no bundler, no build step. `ext/` is exactly what ships.

## Principles

Simple purpose, simple architecture, simple design, simple code. Every change should be better for the person using it, the person reading the code, and the agent editing it — at the same time.

- **No taglines, helper text or secondary labels.** If a screen needs explaining, fix the layout. The only teaching text is the *Tips* list in About.
- **Instant first paint.** Nothing on the first frame may wait for the network, IndexedDB or a module. `boot.js` and `paint.js` render from `localStorage`; everything else catches up.
- **Bookmarks are the user's.** Flit reads and edits links in its folder, and only creates a folder on first run. Reset never touches bookmarks.
- **One material.** Every surface uses the `.g` Liquid Glass class (`.g.solid` where text must stay readable). Don't add new surface styles.
- **Ask before big changes.** Layout, flows, new settings and new permissions are the owner's call.

## Load order

| File | When | Job |
|---|---|---|
| `boot.js` | `<head>`, sync | Defaults (`D`), presets (`G` gradients, `C` colors), reads `localStorage['flit:s']`, sets `data-*` on `<html>` |
| `paint.js` | end of `<body>`, sync | Draws cached links (`flit:links`) and the background |
| `js/main.js` | module | Loads strings and settings, finds the folder, wires everything |
| `js/panel.js`, `js/welcome.js` | `import()` on demand | Settings window; first run / after reset |

`window.FLIT` is the only global: `{ D, G, C, s, merge, apply, tile, render, bg }`.

## Modules (`ext/js`)

- `store.js` — settings. `S` (live binding), `save(patch)` (local now, `storage.sync` debounced 400 ms — quota is 120 writes/min), `replace()`, `onChange()`.
- `i18n.js` — `t(key, ...args)`, `loadLang()`. Strings are fetched from `_locales` so the language can change without reloading; English fills any gap. Markup uses `data-i18n`, `data-i18n-title`, `data-i18n-ph`.
- `ui.js` — `$`, `h()`, icons, `toast()`, `menu()`, `settings()`.
- `links.js` — folder lookup (stored id → synced name → “Flit” → legacy “btab”), live updates from bookmark events, add/edit/delete with undo, drag & drop, paste, Alt+1–9.
- `bg.js` — backgrounds; your own image and Bing's live in IndexedDB (`flit`/`kv`); photo credit card.
- `logo.js` — the FLIT → slogan animation.
- `panel.js` — settings window: categories left, content right. Rows with `data-key` bind themselves.
- `welcome.js` — shown when no folder exists or `storage.local.welcomed` is unset.

## Recipes

**Add a setting**
1. Default in `D` (`boot.js`). If it changes looks, map it to a `data-*` attribute in `apply()` and style it in CSS — no JS needed at paint time.
2. A row in the right section of `newtab.html`: `.seg[data-key]` with `button[data-v]`, or `input[data-key]` (checkbox/range). It binds itself.
3. Strings in every `_locales/*/messages.json`.

**Add a language** — copy `_locales/en`, translate, add it to `LANGS` in `i18n.js`.

**Add a wallpaper** — the full image (up to 3840px wide) as `ext/wallpapers/<id>.webp`, a copy at most 2560px wide in `wallpapers/2560/` (the page picks it unless the screen needs more), a 480×270 thumbnail in `wallpapers/thumbs/`, and an entry in `wallpapers.json` (`author`/`username` for credit; `null` username hides it).

## Privacy text

The policy lives in two places: `PRIVACY.md` (the store links to it) and the Privacy section of `newtab.html` (one `.doc[data-lang]` block per language). Change both together, and update them whenever a permission or network request changes.

## Checks

```sh
npm test   # locale parity + Chromium end-to-end (needs: npx playwright install chromium)
```

Load `ext/` unpacked and open a new tab before calling it done: no console errors, no flash on reload, light and dark both readable, English and Turkish both fit.

## Don't

- Add permissions, remote code, analytics or trackers.
- Put anything slow (network, IndexedDB, big modules) before first paint.
- Commit `*.pem`, packaged builds, or anything in `assets-raw/`, `PLAN.md`, `NEXT.md` (all git-ignored).
