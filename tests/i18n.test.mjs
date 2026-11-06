// Every player-facing string exists in all nine locales (node --test).
// Keys are the US-English source strings (see tests/i18n-keys.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL } from './i18n-keys.mjs';

const DICTS = JSON.parse(readFileSync(new URL('../assets/strings.json', import.meta.url), 'utf8'));
const LOCALES = Object.keys(DICTS);
const PARENT = { 'en-GB': 'en-US' };
const T = (l, k) => { for (let c = l; c; c = PARENT[c]) if (Object.hasOwn(DICTS[c], k)) return DICTS[c][k]; return k; };
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('the key set is non-trivial and finds the engine client\'s strings', () => {
  assert.ok(ALL.size > 150, `only ${ALL.size} keys found`);
  for (const k of ['Type letters', 'Stage {n}: {word}, {tier}, locked', 'Pantry stocked!', 'Journey stage {n} — {tier}', 'Tray shuffled.']) assert.ok(ALL.has(k), k);
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

test('regional variants read their own or the shared text', () => {
  assert.equal(T('de-DE', 'Moves: {used}'), 'Züge: {used}');
  assert.equal(T('fr-CA', 'Score:'), 'Pointage :');
  assert.equal(T('fr-CA', 'Shuffle'), 'Mélanger');
  assert.equal(T('es-ES', 'Settings'), 'Ajustes');
  assert.equal(T('es-ES', 'Shuffle'), 'Mezclar');
  assert.equal(T('en-GB', 'Color-vision-safe palette'), 'Colour-vision-safe palette');
  assert.equal(T('en-US', 'Shuffle'), 'Shuffle');
});
