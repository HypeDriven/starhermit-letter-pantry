// The progress document (progress.js): normalising, the two-device merge, and
// reading the browser build's cloud save and account settings — the logic
// behind native/platform.ts's signed-in paths, which a guest run cannot reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, merge, readForeign, pickSettings, DEFAULT_SETTINGS, BROWSER_KEYS } from '../progress.js';

const OLD_CLOUD = JSON.stringify({
  schemaVersion: 1, savedAt: 1760000000000,
  progression: { completedStages: ['journey-01', 'journey-02'] },
  tutorial: { completedLessons: ['lesson-select'] },
  stats: { targetWordsFound: 17, roundsCompleted: 4, completionStreak: 2 },
  achievements: { unlocked: ['first_completion'] },
  boards: { daily: { 'daily:2026-10-20': { score: 2310, durationMs: 81234, date: '2026-10-20' } } },
});

test('normalize fills defaults and drops junk', () => {
  const n = normalize({ progression: { completedStages: ['a', 3, 'a'] }, stats: { targetWordsFound: -4, roundsCompleted: '7' }, boards: { daily: { x: { score: 'n' } } } });
  assert.deepEqual(n.progression.completedStages, ['a']);
  assert.deepEqual(n.stats, { targetWordsFound: 0, roundsCompleted: 7, completionStreak: 0 });
  assert.deepEqual(n.boards.daily, {});
  assert.deepEqual(n.tutorial.completedLessons, []);
  assert.deepEqual(normalize(null).achievements.unlocked, []);
});

test('the browser build\'s cloud save reads as progress (foreign save migration)', () => {
  const p = readForeign(OLD_CLOUD);
  assert.deepEqual(p.progression.completedStages, ['journey-01', 'journey-02']);
  assert.equal(p.stats.targetWordsFound, 17);
  assert.equal(p.boards.daily['daily:2026-10-20'].score, 2310);
  assert.equal(readForeign('not json'), null);
  assert.equal(readForeign('{"hello":1}'), null);
  assert.equal(readForeign(null), null);
});

test('merge keeps everything either device earned (platform.js mergeCloudDocs), symmetrically', () => {
  const a = readForeign(OLD_CLOUD);
  const b = normalize({
    progression: { completedStages: ['journey-03'] }, tutorial: { completedLessons: ['lesson-fix'] },
    stats: { targetWordsFound: 9, roundsCompleted: 6, completionStreak: 0 }, achievements: { unlocked: ['streak_3'] },
    boards: { daily: { 'daily:2026-10-20': { score: 1800, durationMs: 1, date: '2026-10-20' }, 'daily:2026-10-21': { score: 900, durationMs: 2, date: '2026-10-21' } } },
  });
  const m = merge(a, b);
  assert.deepEqual([...m.progression.completedStages].sort(), ['journey-01', 'journey-02', 'journey-03']);
  assert.deepEqual([...m.tutorial.completedLessons].sort(), ['lesson-fix', 'lesson-select']);
  assert.deepEqual(m.stats, { targetWordsFound: 17, roundsCompleted: 6, completionStreak: 2 });
  assert.deepEqual([...m.achievements.unlocked].sort(), ['first_completion', 'streak_3']);
  assert.equal(m.boards.daily['daily:2026-10-20'].score, 2310);
  assert.equal(m.boards.daily['daily:2026-10-21'].score, 900);
  const n = merge(b, a);
  assert.deepEqual(JSON.stringify(normalize(n).stats), JSON.stringify(m.stats));
  assert.deepEqual(Object.keys(n.boards.daily).sort(), Object.keys(m.boards.daily).sort());
});

test('the browser build\'s account settings: only the game\'s own options carry over', () => {
  assert.deepEqual(pickSettings({ music: 0.2, leftHanded: true, cvdPalette: 'yes', hapticsOff: false, gfx: { preset: 'low' } }), { leftHanded: true, hapticsOff: false });
  for (const k of Object.keys(DEFAULT_SETTINGS)) assert.ok(BROWSER_KEYS.includes(k), k);
  assert.ok(BROWSER_KEYS.includes('ui.language'));
});
