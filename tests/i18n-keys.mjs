// Key extraction for the i18n coverage test (run directly to list the keys).
// Keys are the US-English source strings: literal T('…') / N('…') calls and the
// `t:` / `at:` label attributes in the game modules, the content tables' display
// fields (themes, achievements, lessons, challenges, difficulty tiers) and the
// audio captions. Words in the puzzles are English dictionary data, not UI text.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES, ACHIEVEMENTS, LESSONS, CHALLENGES, PRACTICE_DIFFICULTIES } from '../content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['i18n.js', 'sh-language.js', 'starhermit-sdk.js', 'game-options.js', 'words.js', 'browser-guard.js', 'ui-scale.js', 'score-script.js', 'server.js', 'gfx-i18n.js', 'sh-strings.js']);
const unescape = (s) => s.replace(/\\(['"\\])/g, '$1');

export function sourceKeys() {
  const keys = new Set();
  const call = /(?<![\w.$])(?:T|N)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
  const attr = /(?<![\w.$])(?:t|at):\s*'((?:[^'\\\n]|\\.)*)'/g;
  const ternary = /(?<![\w.$])at:\s*[^,{}]*\?\s*'([^']+)'\s*:\s*[^?]*\?\s*'([^']+)'\s*:\s*'([^']+)'/g;
  const announce = /\.announce\(\s*'((?:[^'\\\n]|\\.)*)'/g;
  for (const f of readdirSync(ROOT)) {
    if (!f.endsWith('.js') || SKIP.has(f)) continue;
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const re of [call, attr, announce]) for (const m of src.matchAll(re)) keys.add(unescape(m[1] ?? m[2]));
    for (const m of src.matchAll(ternary)) { keys.add(m[1]); keys.add(m[2]); keys.add(m[3]); }
  }
  return keys;
}

export function contentKeys() {
  const keys = new Set();
  const add = (...v) => v.forEach((s) => { if (typeof s === 'string' && s) keys.add(s); });
  for (const t of THEMES) add(t.name);
  for (const a of ACHIEVEMENTS) add(a.name, a.desc);
  for (const l of LESSONS) { add(l.title); for (const st of l.steps) add(st.text); }
  for (const c of CHALLENGES) add(c.challenge);
  for (const d of PRACTICE_DIFFICULTIES) add(d);
  const audio = readFileSync(join(ROOT, 'audio.js'), 'utf8');
  for (const m of audio.matchAll(/_say\('([^']+)'\)/g)) add(m[1]);
  return keys;
}

export const ALL = new Set([...sourceKeys(), ...contentKeys()]);

if (process.argv[1] && process.argv[1].endsWith('i18n-keys.mjs')) console.log(JSON.stringify([...ALL], null, 1));
