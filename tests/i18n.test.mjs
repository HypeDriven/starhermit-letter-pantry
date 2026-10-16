// Every player-facing string exists in all nine locales (node --test).
// Keys are the US-English source strings (see tests/i18n-keys.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, LOCALES, T, setLocale } from '../i18n.js';
import { GFX_STRINGS } from '../gfx-i18n.js';
import { shStrings } from '../sh-strings.js';
import { ALL } from './i18n-keys.mjs';

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('the key set is non-trivial', () => {
  assert.ok(ALL.size > 150, `only ${ALL.size} keys found`);
});

for (const locale of LOCALES.filter((l) => l !== 'en-US' && l !== 'en-GB')) {
  test(`${locale}: every key is translated with the same placeholders`, () => {
    const dict = DICTS[locale];
    const missing = [...ALL].filter((k) => !Object.prototype.hasOwnProperty.call(dict, k));
    assert.deepEqual(missing, [], `${missing.length} missing in ${locale}`);
    const bad = [...ALL].filter((k) => placeholders(dict[k]) !== placeholders(k));
    assert.deepEqual(bad, [], `placeholder mismatch in ${locale}`);
  });
}

test('no locale carries keys that no longer exist', () => {
  for (const locale of LOCALES) {
    const stray = Object.keys(DICTS[locale]).filter((k) => !ALL.has(k));
    assert.deepEqual(stray, [], locale);
  }
});

test('Graphics and StarHermit strings exist in all nine locales', () => {
  for (const locale of LOCALES) {
    assert.ok(GFX_STRINGS[locale]?.graphics, locale);
    assert.ok(shStrings([locale]).signIn, locale);
  }
});

test('T falls back to the key and fills placeholders; regional variants inherit', () => {
  setLocale('de-DE');
  assert.equal(T('Not a real key {x}', { x: 1 }), 'Not a real key 1');
  assert.equal(T('Moves: {used}', { used: 3 }), 'Züge: 3');
  setLocale('fr-CA');
  assert.equal(T('Score:'), 'Pointage :');
  assert.equal(T('Shuffle'), 'Mélanger');
  setLocale('es-ES');
  assert.equal(T('Settings'), 'Ajustes');
  assert.equal(T('Shuffle'), 'Mezclar');
  setLocale('en-GB');
  assert.equal(T('Color-vision-safe palette'), 'Colour-vision-safe palette');
  setLocale('en-US');
  assert.equal(T('Shuffle'), 'Shuffle');
});
