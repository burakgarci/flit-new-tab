# Flit New Tab

**Fast Links, Instant Tab.** Your chosen bookmarks on every new tab — instantly, beautifully, privately.

Flit replaces Chrome's new tab page with the links from one bookmark folder. Edit them anywhere in Chrome and the page follows; nothing leaves your browser.

- **Instant** — the page paints from a local cache before any script runs. No network, no flash, no layout jump.
- **Your bookmarks** — one folder (“Flit”, under Other bookmarks) holds your links. Rename or move it; Flit keeps track. It syncs with your Chrome profile like any bookmark.
- **Quick to manage** — right-click to edit or delete (with undo), paste a URL to add it, drag to reorder, Alt+1–9 to open.
- **Backgrounds** — bundled photos and abstracts, gradients, solid colors, your own image or Bing's image of the day. Dim and blur to taste.
- **Your look** — columns or rows, density, position, light/dark/system theme, faded or gray icons, lowercase or uppercase titles.
- **English and Turkish**, more welcome.

## Install

From the Chrome Web Store, or from source:

1. Download or clone this repository.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → choose the `ext` folder.

Works in Chrome, Edge, Brave, Arc and other Chromium browsers (version 120+).

## Privacy

No accounts, no analytics, no remote code. Settings live in Chrome's storage; the only optional network request is Bing's image of the day, after you turn it on. Full policy: [PRIVACY.md](PRIVACY.md) (also in Settings › Privacy).

## Development

There is no build step: `ext/` is the extension.

```sh
npm install
npx playwright install chromium
npm test          # locale checks + an end-to-end run in Chromium
npm run test:fast # locale checks only
```

How the code is organized, and the rules it follows, are in [AGENTS.md](AGENTS.md).

### Adding a language

Copy `ext/_locales/en` to `ext/_locales/<code>`, translate the messages, and add the language to `LANGS` in `ext/js/i18n.js`. `npm test` tells you if a key is missing.

## Photos

Bundled photos are from [Unsplash](https://unsplash.com) under the Unsplash License; each one credits its photographer on the page.

## License

[MIT](LICENSE) © 2014–2026 Burak Garcı
