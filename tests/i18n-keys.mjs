// Key extraction for the i18n coverage test (run directly to list the keys).
// Keys are the US-English source strings: literal T("…") / N("…") calls in the
// engine client (native/*.ts) and the content tables' display fields (themes, achievements, lessons,
// challenges, difficulty tiers). Words in the puzzles are English dictionary
// data, not UI text.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES, ACHIEVEMENTS, LESSONS, CHALLENGES, PRACTICE_DIFFICULTIES } from '../content.js';

const ROOT = new URL('..', import.meta.url).pathname;
const unescape = (s) => s.replace(/\\(['"\\])/g, '$1');

export function sourceKeys() {
  const keys = new Set();
  const lit = String.raw`"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'`;
  const call = new RegExp(String.raw`(?<![\w.$])(?:T|N)\(\s*(?:${lit})`, 'g');
  const dir = join(ROOT, 'native');
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(call)) keys.add(unescape(m[1] ?? m[2]));
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
  return keys;
}

export const ALL = new Set([...sourceKeys(), ...contentKeys()]);

if (process.argv[1] && process.argv[1].endsWith('i18n-keys.mjs')) console.log(JSON.stringify([...ALL], null, 1));
