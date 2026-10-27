// Letter Pantry progress document: its defaults, normalisation, the two-device
// merge, and reading the browser build's cloud save and account settings.
// Pure (no engine, no DOM) so node tests check it and native/platform.ts uses
// it unchanged.
//
// The progress document is the game's save (one per player), the five keys
// the browser build mirrored into its cloud slot:
//   { progression: { completedStages: [stageId] },
//     tutorial: { completedLessons: [lessonId] },
//     stats: { targetWordsFound, roundsCompleted, completionStreak },
//     achievements: { unlocked: [id] },
//     boards: { daily: { 'daily:YYYY-MM-DD': { score, durationMs, date } } } }
// The browser build (platform.js buildCloudDoc) kept it in its cloud slot as
// { schemaVersion: 1, savedAt, progression, tutorial, stats, achievements, boards }.

export const DEFAULT_SETTINGS = { cvdPalette: false, leftHanded: false, hapticsOff: false, tutorialReplay: true };
export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
/** Every key the browser build patched into the account's settings KV (ui.js DEFAULT_SETTINGS + sh-language.js). */
export const BROWSER_KEYS = [
  'music', 'effects', 'ambience', 'gfx', 'graphics', 'reducedMotion', 'highContrast', 'largerText',
  'cvdPalette', 'leftHanded', 'hapticsOff', 'tutorialReplay', 'ui.language',
];

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const ids = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string'))] : []);
const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : 0);

function dailyBoard(raw) {
  const out = {};
  for (const [seed, e] of Object.entries(obj(raw))) {
    const r = obj(e);
    if (!Number.isFinite(Number(r.score))) continue;
    out[seed] = { score: Math.round(Number(r.score)), durationMs: count(r.durationMs), date: typeof r.date === 'string' ? r.date : seed.replace(/^daily:/, '') };
  }
  return out;
}

/** A progress document from anything (a save, the old cloud doc), with every field valid. */
export function normalize(raw) {
  const r = obj(raw);
  const st = obj(r.stats);
  return {
    progression: { completedStages: ids(obj(r.progression).completedStages) },
    tutorial: { completedLessons: ids(obj(r.tutorial).completedLessons) },
    stats: { targetWordsFound: count(st.targetWordsFound), roundsCompleted: count(st.roundsCompleted), completionStreak: count(st.completionStreak) },
    achievements: { unlocked: ids(obj(r.achievements).unlocked) },
    boards: { daily: dailyBoard(obj(r.boards).daily) },
  };
}

/** Two devices' progress (platform.js mergeCloudDocs): the union of completed stages, lessons and
 * achievements, the larger stats counters, the best daily score per seed. Symmetric. */
export function merge(a, b) {
  const x = normalize(a), y = normalize(b);
  const union = (p, q) => [...new Set([...p, ...q])];
  const daily = { ...x.boards.daily };
  for (const [seed, e] of Object.entries(y.boards.daily)) {
    if (!daily[seed] || e.score > daily[seed].score) daily[seed] = e;
  }
  return {
    progression: { completedStages: union(x.progression.completedStages, y.progression.completedStages) },
    tutorial: { completedLessons: union(x.tutorial.completedLessons, y.tutorial.completedLessons) },
    stats: {
      targetWordsFound: Math.max(x.stats.targetWordsFound, y.stats.targetWordsFound),
      roundsCompleted: Math.max(x.stats.roundsCompleted, y.stats.roundsCompleted),
      completionStreak: Math.max(x.stats.completionStreak, y.stats.completionStreak),
    },
    achievements: { unlocked: union(x.achievements.unlocked, y.achievements.unlocked) },
    boards: { daily },
  };
}

/** The game's own options from an old settings object (the account's settings KV): only valid values. */
export function pickSettings(raw) {
  const out = {};
  const r = obj(raw);
  for (const k of SETTING_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k];
  return out;
}

/** The browser build's cloud save text → its progress, or null when it is not one. */
export function readForeign(text) {
  let doc;
  try { doc = typeof text === 'string' ? JSON.parse(text) : text; } catch { return null; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  if (!['progression', 'tutorial', 'stats', 'achievements', 'boards'].some((k) => doc[k] && typeof doc[k] === 'object')) return null;
  return normalize(doc);
}
