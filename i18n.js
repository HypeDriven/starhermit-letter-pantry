// Letter Pantry localization core (pure: node tests and the engine client
// share it).
//
// Every player-facing string is authored in US English and looked up by that
// English text: T('Play') → the current locale's translation (en-US is the key
// itself). Placeholders use {name}. N('…') marks a string for extraction
// without translating it (the caller translates at display time). The locale
// is the runtime's interface language (native/i18n.ts sets it).

import EN_GB from './locales/en-GB.js';
import { ES_419, ES_ES } from './locales/es.js';
import DE_DE from './locales/de.js';
import { FR_FR, FR_CA } from './locales/fr.js';
import PT_BR from './locales/pt.js';
import IT_IT from './locales/it.js';

export const LOCALES = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];

/** Locale → { English key: translation }. en-US is the identity; en-GB only lists spelling changes. */
export const DICTS = {
  'en-US': {},
  'en-GB': EN_GB,
  'es-419': ES_419,
  'es-ES': { ...ES_419, ...ES_ES },
  'de-DE': DE_DE,
  'fr-FR': FR_FR,
  'fr-CA': { ...FR_FR, ...FR_CA },
  'pt-BR': PT_BR,
  'it-IT': IT_IT,
};

let lang = 'en-US';
let dict = DICTS[lang];

export function fmt(s, vars) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
}

/** Translate an English source string (unknown strings, e.g. player names, pass through). */
export function T(key, vars) {
  if (key == null) return '';
  const s = String(key);
  const out = Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s;
  return vars ? fmt(out, vars) : out;
}

/** Mark a string for extraction; translated later with T(). */
export const N = (key) => key;

export function getLang() { return lang; }

/** The shipped locale nearest a BCP 47 tag (en-GB, es-ES and fr-CA by region; es-MX → es-419). */
export function pickLocale(tag) {
  const s = String(tag || 'en-US');
  const exact = LOCALES.find((l) => l.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  const [l = '', region = ''] = s.toLowerCase().split('-');
  if (l === 'en') return ['gb', 'uk', 'ie', 'au', 'nz', 'za', 'in'].includes(region) ? 'en-GB' : 'en-US';
  if (l === 'es') return region === 'es' ? 'es-ES' : 'es-419';
  if (l === 'fr') return region === 'ca' ? 'fr-CA' : 'fr-FR';
  return { de: 'de-DE', pt: 'pt-BR', it: 'it-IT' }[l] || 'en-US';
}

export function setLocale(next) {
  lang = DICTS[next] ? next : pickLocale(next);
  dict = DICTS[lang];
  return lang;
}
