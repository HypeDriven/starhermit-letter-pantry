// Letter Pantry — versioned content: dictionary-driven stage derivation,
// tutorial lessons, journey stages, daily generator, practice, challenges, themes.

import { WORDS, WORD_SET } from './words.mjs';
import { fnv1a, mulberry32 } from './rules.mjs';

export const CONTENT_VERSION = 'content/1';

export { WORDS, WORD_SET };

// ---------------------------------------------------------------------------
// Anagram helpers

function letterCounts(word) {
  const c = {};
  for (const ch of word) c[ch] = (c[ch] || 0) + 1;
  return c;
}

export function canForm(letters, word) {
  const have = letterCounts(letters.toLowerCase());
  for (const ch of word.toLowerCase()) {
    if (!have[ch]) return false;
    have[ch]--;
  }
  return true;
}

export function formableWords(letters, minLen = 3) {
  return WORDS.filter((w) => w.length >= minLen && w.length <= letters.length && canForm(letters, w));
}

// ---------------------------------------------------------------------------
// Themes — five pantry variants (colors/materials only).

export const THEMES = [
  { id: 'classic', name: 'Classic Pantry', bg: 0x2a1d12, shelf: 0x6b4a2c, tray: 0x8a5f36, biscuit: 0xd9a860, letter: '#4a2c12', accent: 0xffc978, key: 0xffe2b0 },
  { id: 'midnight', name: 'Midnight Shelf', bg: 0x101820, shelf: 0x2c3a4a, tray: 0x3d5468, biscuit: 0xb8c4d0, letter: '#1c2a38', accent: 0x7fd4ff, key: 0xbfe6ff },
  { id: 'orchard', name: 'Orchard Pantry', bg: 0x1c2414, shelf: 0x4a5a2c, tray: 0x647436, biscuit: 0xd8c47a, letter: '#37401c', accent: 0xc4e37f, key: 0xe8ffb0 },
  { id: 'berry', name: 'Berry Cellar', bg: 0x241420, shelf: 0x5a2c44, tray: 0x743a58, biscuit: 0xe0b8c8, letter: '#3c1c2c', accent: 0xff9fc8, key: 0xffd0e2 },
  { id: 'frost', name: 'Frost Larder', bg: 0x182022, shelf: 0x3c5258, tray: 0x4e6a70, biscuit: 0xd0dcd8, letter: '#22383c', accent: 0x9fe8e0, key: 0xd0fff8 },
];

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

// ---------------------------------------------------------------------------
// Achievements — static set, stable lowercase ids.

export const ACHIEVEMENTS = [
  { id: 'first_completion', name: 'First Batch', desc: 'Complete your first puzzle.' },
  { id: 'mechanic_mastery', name: 'Pantry Scholar', desc: 'Finish every Learn lesson.' },
  { id: 'streak_3', name: 'On a Roll', desc: 'Finish 3 rounds in a row without a resignation.' },
  { id: 'hard_milestone', name: 'Hard Crust', desc: 'Complete a hard Journey stage.' },
  { id: 'long_term_pantry', name: 'Stocked Shelves', desc: 'Find 100 target words cumulatively.' },
];

// ---------------------------------------------------------------------------
// Tutorial lessons (Learn mode). Each step requires the player to perform the
// action through the normal command API; `require` matches command type.

export const LESSONS = [
  {
    id: 'lesson-select',
    title: 'Picking Biscuits',
    letters: 'tea',
    targets: ['tea', 'eat', 'ate'],
    bonus: ['eta', 'tae'].filter((w) => WORD_SET.has(w)),
    steps: [
      { text: 'Tap a letter biscuit (or press Enter on one) to pick it up.', require: { type: 'select' } },
      { text: 'Pick two more letters to spell a word of three letters.', require: { type: 'select' } },
      { text: 'Pick the last letter, then press Submit to serve the word.', require: { type: 'submit' } },
    ],
  },
  {
    id: 'lesson-fix',
    title: 'Second Thoughts',
    letters: 'bread',
    targets: ['bread', 'read', 'dear', 'bear'],
    bonus: formableWords('bread').filter((w) => !['bread', 'read', 'dear', 'bear'].includes(w)),
    steps: [
      { text: 'Pick any letter, then tap it again to put it back.', require: { type: 'deselect' } },
      { text: 'Pick some letters, then use Clear to empty your hand.', require: { type: 'clear' } },
      { text: 'Made a mess? Use Undo to take back your last action.', require: { type: 'undo' } },
      { text: 'Use Shuffle to mix the tray and see the letters anew.', require: { type: 'shuffle' } },
    ],
  },
  {
    id: 'lesson-hunt',
    title: 'The Full Shelf',
    letters: 'steam',
    targets: ['steam', 'meat', 'team', 'seat', 'mate'],
    bonus: formableWords('steam').filter((w) => !['steam', 'meat', 'team', 'seat', 'mate'].includes(w)),
    steps: [
      { text: 'Stuck? Use Hint to peek at a letter of an unfound word.', require: { type: 'hint' } },
      { text: 'Some words are bonus words — they are not required, but they score.', require: { type: 'submit' } },
      { text: 'Find every target word to complete the stage. Good luck!', require: { type: 'submit' } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Journey — authored base words with difficulty knobs. Targets are derived
// deterministically from the dictionary, guaranteeing solvability.

// tier: 'easy' | 'medium' | 'hard'
const JOURNEY_TABLE = [
  ['tea', 'easy'], ['bread', 'easy'], ['steam', 'easy'], ['peach', 'easy'],
  ['heart', 'easy'], ['stone', 'easy'], ['grain', 'easy'], ['plate', 'easy'],
  ['pantry', 'medium'], ['pastry', 'medium'], ['singer', 'medium'], ['butter', 'medium'],
  ['staple', 'medium'], ['master', 'medium'], ['stream', 'medium'], ['remain', 'medium'],
  ['garden', 'medium'], ['market', 'medium'], ['orange', 'medium'], ['listen', 'medium'],
  ['recipe', 'medium'], ['dinner', 'medium'], ['toaster', 'medium'], ['cracker', 'medium'],
  ['oatmeal', 'hard'], ['biscuit', 'hard'], ['kitchen', 'hard'], ['caramel', 'hard'],
  ['vanilla', 'hard'], ['pretzel', 'hard'], ['noodles', 'hard'], ['harvest', 'hard'],
  ['cabinet', 'hard'], ['tastier', 'hard'], ['mustard', 'hard'], ['custard', 'hard'],
  ['storage', 'hard'], ['toasted', 'hard'], ['roasted', 'hard'], ['steamed', 'hard'],
  ['brother', 'hard'], ['country', 'hard'],
];

const TIER_PARAMS = {
  easy: { targets: 4, minLen: 3, moveLimit: null, undo: true, shuffle: true, hints: 3, parTime: 180000 },
  medium: { targets: 6, minLen: 4, moveLimit: null, undo: true, shuffle: true, hints: 2, parTime: 240000 },
  hard: { targets: 8, minLen: 4, moveLimit: 14, undo: false, shuffle: true, hints: 1, parTime: 300000 },
};

function pickTargets(base, tier, seed) {
  const p = TIER_PARAMS[tier];
  const all = formableWords(base, 3);
  const primary = all.filter((w) => w.length >= p.minLen);
  const rng = mulberry32(fnv1a('stage:' + seed + ':' + base));
  // Always include the base word itself when it is a real word.
  const pool = primary.slice();
  const chosen = [];
  if (WORD_SET.has(base) && base.length >= p.minLen) {
    chosen.push(base);
    pool.splice(pool.indexOf(base), 1);
  }
  // Shuffle pool deterministically and take the rest.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  while (chosen.length < p.targets && pool.length) chosen.push(pool.pop());
  chosen.sort((a, b) => a.length - b.length || a.localeCompare(b));
  const bonus = all.filter((w) => !chosen.includes(w)).sort();
  return { targets: chosen, bonus };
}

function shuffledLetters(base, seed) {
  const rng = mulberry32(fnv1a('arrange:' + seed + ':' + base));
  const arr = base.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (arr.join('') === base) arr.push(arr.shift());
  return arr.join('');
}

export function buildDescriptor(opts) {
  const { id, seed, base, tier } = opts;
  const p = TIER_PARAMS[tier] || TIER_PARAMS.easy;
  const { targets, bonus } = pickTargets(base, tier, seed);
  return {
    id,
    seed,
    letters: shuffledLetters(base, seed),
    base,
    tier,
    targets,
    bonus,
    mechanics: {
      moveLimit: opts.moveLimit !== undefined ? opts.moveLimit : p.moveLimit,
      undo: opts.undo !== undefined ? opts.undo : p.undo,
      shuffle: opts.shuffle !== undefined ? opts.shuffle : p.shuffle,
      hints: opts.hints !== undefined ? opts.hints : p.hints,
      timeTargetMs: opts.timeTargetMs || null,
    },
    par: { timeMs: p.parTime, moves: targets.length + 6 },
    theme: opts.theme || THEMES[fnv1a(id) % THEMES.length].id,
  };
}

export const JOURNEY = JOURNEY_TABLE.map(([base, tier], i) => {
  const d = buildDescriptor({ id: `journey-${String(i + 1).padStart(2, '0')}`, seed: `journey:${i + 1}`, base, tier });
  d.index = i;
  return d;
});

// ---------------------------------------------------------------------------
// Challenge stages — constrained goals.

export const CHALLENGES = [
  Object.assign(buildDescriptor({
    id: 'challenge-ration', seed: 'challenge:ration', base: 'pantry', tier: 'medium',
    moveLimit: 8, undo: false, hints: 0,
  }), { challenge: 'Only 8 moves. No undo, no hints.' }),
  Object.assign(buildDescriptor({
    id: 'challenge-rush', seed: 'challenge:rush', base: 'stream', tier: 'medium',
    timeTargetMs: 90000, undo: false,
  }), { challenge: 'Beat 90 seconds. No undo.' }),
  Object.assign(buildDescriptor({
    id: 'challenge-noshuffle', seed: 'challenge:noshuffle', base: 'master', tier: 'hard',
    shuffle: false, moveLimit: 12,
  }), { challenge: 'Fixed tray, 12 moves.' }),
  Object.assign(buildDescriptor({
    id: 'challenge-larder', seed: 'challenge:larder', base: 'harvest', tier: 'hard',
    moveLimit: 10, hints: 0, shuffle: false, undo: false,
  }), { challenge: 'The full lockdown: 10 moves, no tools.' }),
];

// ---------------------------------------------------------------------------
// Daily — deterministic from UTC date. Same algorithm client & server.

export function dailySeed(dateISO) {
  return 'daily:' + dateISO;
}

const DAILY_POOL = JOURNEY_TABLE.filter(([, tier]) => tier !== 'easy').map(([base]) => base);

export function deriveDaily(dateISO) {
  const seed = dailySeed(dateISO);
  const rng = mulberry32(fnv1a(seed));
  const base = DAILY_POOL[Math.floor(rng() * DAILY_POOL.length)];
  const tier = base.length >= 7 ? 'hard' : 'medium';
  return buildDescriptor({ id: 'daily-' + dateISO, seed, base, tier });
}

export function todayISO(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Practice — selectable difficulty, seeded.

export const PRACTICE_DIFFICULTIES = ['easy', 'medium', 'hard'];

export function derivePractice(difficulty, seedNum) {
  const pool = JOURNEY_TABLE.filter(([, t]) => t === difficulty).map(([b]) => b);
  const rng = mulberry32(fnv1a('practice:' + difficulty + ':' + seedNum));
  const base = pool[Math.floor(rng() * pool.length)];
  return buildDescriptor({ id: `practice-${difficulty}-${seedNum}`, seed: 'practice:' + seedNum, base, tier: difficulty });
}

// ---------------------------------------------------------------------------
// Resolve a descriptor from a seed string (used by server score validation).

export function descriptorFromSeed(seed) {
  if (typeof seed !== 'string') return null;
  if (seed.startsWith('daily:')) {
    const date = seed.slice(6);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return deriveDaily(date);
  }
  if (seed.startsWith('journey:')) {
    const n = Number(seed.slice(8));
    if (!Number.isInteger(n) || n < 1 || n > JOURNEY.length) return null;
    return JOURNEY[n - 1];
  }
  if (seed.startsWith('challenge:')) {
    return CHALLENGES.find((c) => c.seed === seed) || null;
  }
  if (seed.startsWith('practice:')) {
    const n = Number(seed.slice(9));
    if (!Number.isInteger(n) || n < 0 || n > 1e6) return null;
    for (const diff of PRACTICE_DIFFICULTIES) {
      const d = derivePractice(diff, n);
      if (d.seed === seed) return d;
    }
    // practice seeds embed difficulty through the base pick; try all
    return derivePractice('medium', n);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Offline content validator — run in tests and at boot in dev.

export function validateContent() {
  const errors = [];
  const checkStage = (d) => {
    const letters = d.letters;
    const seen = new Set();
    for (const t of d.targets) {
      if (!WORD_SET.has(t)) errors.push(`${d.id}: target "${t}" not in dictionary`);
      if (!canForm(letters, t)) errors.push(`${d.id}: target "${t}" not formable from "${letters}"`);
      if (seen.has(t)) errors.push(`${d.id}: duplicate target "${t}"`);
      seen.add(t);
    }
    if (d.targets.length === 0 || d.targets.length > 16) errors.push(`${d.id}: unbounded target count ${d.targets.length}`);
    if (d.bonus.length > 120) errors.push(`${d.id}: bonus list too large (${d.bonus.length})`);
    for (const b of d.bonus) {
      if (!canForm(letters, b)) errors.push(`${d.id}: bonus "${b}" not formable`);
      if (seen.has(b)) errors.push(`${d.id}: bonus "${b}" collides with a target`);
    }
    if (letters.length < 3 || letters.length > 8) errors.push(`${d.id}: letter count ${letters.length} out of bounds`);
    if (d.mechanics.moveLimit != null && d.mechanics.moveLimit < d.targets.length) {
      errors.push(`${d.id}: move limit ${d.mechanics.moveLimit} below target count (soft lock)`);
    }
  };
  JOURNEY.forEach(checkStage);
  CHALLENGES.forEach(checkStage);
  // Sample of generated dailies across a date range.
  for (let day = 1; day <= 28; day += 3) {
    checkStage(deriveDaily(`2026-01-${String(day).padStart(2, '0')}`));
  }
  // Lessons must reference legal words.
  for (const lesson of LESSONS) {
    for (const t of lesson.targets) {
      if (!canForm(lesson.letters, t)) errors.push(`${lesson.id}: target "${t}" not formable`);
    }
    if (!lesson.steps.length) errors.push(`${lesson.id}: no steps`);
  }
  return { ok: errors.length === 0, errors };
}
