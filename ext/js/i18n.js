// Strings come from _locales/*/messages.json. To add a language: add the folder and one entry in LANGS.
import { S } from './store.js';
export const LANGS = { en: 'English', tr: 'Türkçe' };
export const lang = () => {
  if (LANGS[S.lang]) return S.lang;
  const ui = chrome.i18n.getUILanguage().split('-')[0];
  return LANGS[ui] ? ui : 'en';
};
let dict = {}, base = {};                                // base = English, used for any missing key
const load = l => fetch(`_locales/${l}/messages.json`).then(r => r.json()).catch(() => ({}));
export const t = (k, ...a) => {
  let m = dict[k]?.message ?? base[k]?.message ?? k;
  a.forEach((v, i) => (m = m.replace('$' + (i + 1), v)));
  return m;
};
export function translate(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(e => (e.textContent = t(e.dataset.i18n)));
  root.querySelectorAll('[data-i18n-title]').forEach(e => e.setAttribute('aria-label', (e.title = t(e.dataset.i18nTitle))));
  root.querySelectorAll('[data-i18n-ph]').forEach(e => (e.placeholder = t(e.dataset.i18nPh)));
}
export async function loadLang() {
  const l = lang();
  [dict, base] = await Promise.all([load(l), l === 'en' ? null : load('en')]);
  base ||= dict;
  document.documentElement.lang = l;
  translate();
  document.dispatchEvent(new Event('flit:lang'));
}
