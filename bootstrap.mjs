// Letter Pantry — entry point. Capability detection, module wiring,
// app state machine, server-time sync, progression & achievements,
// score submission, and recoverable error handling.

import * as rules from './rules.mjs';
import * as content from './content.mjs';
import { Session, loadJSON, saveJSON } from './session.mjs';
import { createRenderer } from './render.mjs';
import { UI, loadSettings } from './ui.mjs';
import { PantryAudio } from './audio.mjs';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

// ---------------------------------------------------------------------------
// App state machine: boot → title → mode-select → preparing → active ↔ paused
// → resolving → results → progression.

const app = {
  state: 'boot',
  session: null,
  renderer: null,
  audio: null,
  ui: null,
  meta: null,          // {mode, modeLabel, descriptor, lesson?, lessonTracker?}
  timeOffsetMs: 0,     // serverNow - localNow (round-trip adjusted)
  progression: null,
  tutorial: null,
  stats: null,
  achievements: null,
  roundCompletions: 0, // streak tracking
};

function setState(next, reason) {
  const prev = app.state;
  app.state = next;
  console.info(`[letter-pantry] ${prev} → ${next} (${reason})`);
}

// ---------------------------------------------------------------------------
// Persistence payloads

function loadProgression() {
  return Object.assign({ completedStages: [] }, loadJSON('progression') || {});
}
function loadTutorial() {
  return Object.assign({ completedLessons: [] }, loadJSON('tutorial') || {});
}
function loadStats() {
  return Object.assign({ targetWordsFound: 0, roundsCompleted: 0, completionStreak: 0 }, loadJSON('stats') || {});
}
function loadAchievements() {
  return Object.assign({ unlocked: [] }, loadJSON('achievements') || {});
}

// ---------------------------------------------------------------------------
// Server integration (recoverable when absent: file:// or static hosting).

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.error)) {
    const err = new Error((body && body.error) || `HTTP ${res.status}`);
    err.recoverable = true;
    throw err;
  }
  return body;
}

async function syncServerTime() {
  try {
    const t0 = Date.now();
    const { now } = await api('/api/v1/time');
    const t1 = Date.now();
    app.timeOffsetMs = now - Math.round((t0 + t1) / 2);
  } catch {
    app.timeOffsetMs = 0; // offline fallback: local UTC date
  }
}

function serverNowMs() { return Date.now() + app.timeOffsetMs; }

// ---------------------------------------------------------------------------
// Achievements — local mirror + best-effort server unlock (idempotent).

function checkAchievements(context) {
  const { outcome, descriptor, snapshot } = context;
  const newly = [];
  const unlock = (id) => {
    if (!app.achievements.unlocked.includes(id)) {
      app.achievements.unlocked.push(id);
      const def = content.ACHIEVEMENTS.find((a) => a.id === id);
      if (def) newly.push(def);
    }
  };
  if (outcome === 'completed') unlock('first_completion');
  if (app.tutorial.completedLessons.length >= content.LESSONS.length) unlock('mechanic_mastery');
  if (app.stats.completionStreak >= 3) unlock('streak_3');
  if (outcome === 'completed' && descriptor.tier === 'hard' && descriptor.id.startsWith('journey')) unlock('hard_milestone');
  if (app.stats.targetWordsFound >= 100) unlock('long_term_pantry');
  if (newly.length) {
    saveJSON('achievements', app.achievements);
    api('/api/v1/achievements', {
      method: 'POST',
      body: JSON.stringify({ ids: newly.map((a) => a.id) }),
    }).catch(() => {}); // offline: local mirror is authoritative enough
  }
  return newly;
}

// ---------------------------------------------------------------------------
// Round lifecycle

function startRound(descriptor, meta) {
  if (app.session) app.session.dispose();
  const session = new Session(descriptor);
  app.session = session;
  app.meta = meta;
  if (meta.lesson) {
    meta.lessonTracker = { stepIndex: 0, done: false };
  }
  session.onEvent((kind, data) => {
    if (kind === 'command') {
      const { command, events, state } = data;
      app.renderer.onCommandEvents(events, state);
      app.ui.updatePlay(state, session.actions());
      handleAudioEvents(events);
      handleLessonProgress(command);
      if (state.status === 'terminal') {
        setState('resolving', 'terminal:' + state.terminalReason);
        setTimeout(() => showResults(), 900);
      }
    }
  });
  app.renderer.setTheme(descriptor.theme);
  app.renderer.update(session.snapshot());
  app.ui.showPlay(session, meta);
  session.resume('round-start');
  setState('active', meta.mode + ':' + descriptor.id);
}

function handleAudioEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'select': app.audio.select(); break;
      case 'deselect': app.audio.deselect(); break;
      case 'clear': app.audio.clear(); break;
      case 'shuffle': app.audio.shuffle(); break;
      case 'hint': app.audio.hint(); break;
      case 'undo': app.audio.undo(); break;
      case 'word-invalid': app.audio.submitInvalid(); break;
      case 'word-bonus': app.audio.wordBonus(); break;
      case 'word-target': app.audio.wordComplete(); break;
      case 'terminal':
        if (ev.reason === 'completed') app.audio.roundComplete();
        else app.audio.roundFailed();
        break;
    }
  }
  const s = app.session && app.session.state;
  if (s && s.targets.length) {
    app.audio.setIntensity((s.foundTargets.length + s.foundBonus.length * 0.5) / s.targets.length);
  }
}

function handleLessonProgress(command) {
  const tracker = app.meta && app.meta.lessonTracker;
  const lesson = app.meta && app.meta.lesson;
  if (!tracker || tracker.done) return;
  const step = lesson.steps[tracker.stepIndex];
  if (step && command.type === step.require.type) {
    tracker.stepIndex++;
    if (tracker.stepIndex >= lesson.steps.length) {
      tracker.done = true;
      if (!app.tutorial.completedLessons.includes(lesson.id)) {
        app.tutorial.completedLessons.push(lesson.id);
        saveJSON('tutorial', app.tutorial);
      }
      app.ui.announce('Lesson complete!', true);
    } else {
      app.ui.announce('Good! Next step.');
    }
  }
}

async function showResults() {
  const session = app.session;
  const snap = session.snapshot();
  const outcome = snap.terminalReason;
  const descriptor = app.meta.descriptor;

  // Progression updates.
  let progressionText = '';
  if (outcome === 'completed') {
    app.stats.roundsCompleted++;
    app.stats.completionStreak++;
    app.stats.targetWordsFound += snap.foundTargets.length;
    if (app.meta.mode === 'journey' && !app.progression.completedStages.includes(descriptor.id)) {
      app.progression.completedStages.push(descriptor.id);
      progressionText = `Journey progress: ${app.progression.completedStages.length}/${content.JOURNEY.length} stages.`;
    }
    if (descriptor.index != null && descriptor.index + 1 < content.JOURNEY.length) {
      progressionText += ' Next stage unlocked.';
    }
  } else {
    app.stats.completionStreak = 0;
  }
  saveJSON('stats', app.stats);
  saveJSON('progression', app.progression);

  const newAchievements = checkAchievements({ outcome, descriptor, snapshot: snap });

  // Ranked submission for daily rounds (best-effort).
  let comparison = '';
  if (app.meta.mode === 'daily') {
    try {
      const terminal = session.envelope.terminalResult || { durationMs: snap.elapsedMs };
      await api('/api/v1/score', {
        method: 'POST',
        body: JSON.stringify({
          ruleset: rules.RULESET,
          contentVersion: content.CONTENT_VERSION,
          seed: descriptor.seed,
          assists: { hintsUsed: snap.hintsUsed, undoUsed: snap.mechanics.undo === true },
          durationMs: terminal.durationMs,
          commands: session.envelope.commands,
          score: snap.score.total,
          board: 'daily',
        }),
      });
      const board = await api('/api/v1/leaderboard?board=daily&seed=' + encodeURIComponent(descriptor.seed));
      const entries = board.entries || [];
      const rank = entries.findIndex((e) => e.score <= snap.score.total);
      comparison = entries.length
        ? `Daily board: your score ${snap.score.total} vs best ${entries[0].score} (${entries.length} entries).`
        : 'Daily board: you are the first entry today.';
      if (rank === 0) comparison = 'Top of the daily board!';
    } catch (err) {
      comparison = 'Leaderboard unavailable — score kept locally.';
    }
  }

  setState('results', outcome);
  app.ui.showResults({
    outcome,
    score: snap.score,
    progressionText,
    newAchievements,
    comparison,
    allowNext: app.meta.mode === 'journey' && outcome === 'completed' &&
      descriptor.index != null && descriptor.index + 1 < content.JOURNEY.length,
  });
}

function leaveRound(destination) {
  if (app.session) {
    app.session.saveSnapshot();
    app.session.dispose();
    app.session = null;
  }
  app.meta = null;
  setState('title', 'leave:' + destination);
  showTitle();
}

function showTitle() {
  setState('title', 'home');
  app.ui.showTitle({
    progression: app.progression,
    dailyDate: content.todayISO(serverNowMs()),
    hasSnapshot: !!loadJSON('last-snapshot'),
  });
}

// ---------------------------------------------------------------------------
// Countdown / preparing

function prepareRound(descriptor, meta) {
  setState('preparing', meta.mode);
  app.ui.showPreparing(meta.modeLabel, 3);
  setTimeout(() => startRound(descriptor, meta), 3200);
}

// ---------------------------------------------------------------------------
// UI handlers

const handlers = {
  onPlayJourney(i) {
    const d = content.JOURNEY[i];
    prepareRound(d, { mode: 'journey', modeLabel: `Journey stage ${i + 1} — ${d.tier}`, descriptor: d });
  },
  onPlayDaily() {
    const date = content.todayISO(serverNowMs());
    const d = content.deriveDaily(date);
    prepareRound(d, { mode: 'daily', modeLabel: `Daily Pantry — ${date}`, descriptor: d });
  },
  onPlayPractice(diff) {
    const d = content.derivePractice(diff, Math.floor(serverNowMs() / 60000));
    prepareRound(d, { mode: 'practice', modeLabel: `Practice — ${diff}`, descriptor: d });
  },
  onPlayChallenge(id) {
    const d = content.CHALLENGES.find((c) => c.id === id);
    prepareRound(d, { mode: 'challenge', modeLabel: `Challenge — ${d.challenge}`, descriptor: d });
  },
  onPlayLesson(id) {
    const lesson = content.LESSONS.find((l) => l.id === id);
    const d = {
      id: lesson.id, seed: 'lesson:' + lesson.id, letters: lesson.letters,
      targets: lesson.targets, bonus: lesson.bonus,
      mechanics: { moveLimit: null, undo: true, shuffle: true, hints: 3 },
      par: { timeMs: 600000, moves: 30 }, theme: 'classic',
    };
    prepareRound(d, { mode: 'learn', modeLabel: `Learn — ${lesson.title}`, descriptor: d, lesson });
  },
  onResume() {
    const session = Session.restoreSnapshot();
    if (!session) { showTitle(); return; }
    app.session = session;
    app.meta = { mode: 'resumed', modeLabel: 'Resumed round', descriptor: session.descriptor, lesson: null };
    session.onEvent((kind, data) => {
      if (kind === 'command') {
        app.renderer.onCommandEvents(data.events, data.state);
        app.ui.updatePlay(data.state, session.actions());
        handleAudioEvents(data.events);
        if (data.state.status === 'terminal') {
          setState('resolving', 'terminal');
          setTimeout(() => showResults(), 900);
        }
      }
    });
    app.renderer.setTheme(session.descriptor.theme);
    app.renderer.update(session.snapshot());
    app.ui.showPlay(session, app.meta);
    session.resume('restore');
    setState('active', 'resumed');
  },
  onLeaveRound(dest) { leaveRound(dest); },
  onRetry() {
    const { descriptor, lesson } = app.meta;
    prepareRound(descriptor, Object.assign({}, app.meta, { lesson }));
  },
  onNext() {
    const i = app.meta.descriptor.index + 1;
    handlers.onPlayJourney(i);
  },
  onCommand(cmd) { return app.session ? app.session.dispatch(cmd) : { ok: false, reason: 'no-session' }; },
  onSettingsChanged(settings) {
    app.audio.setVolume('music', settings.music);
    app.audio.setVolume('effects', settings.effects);
    app.audio.setVolume('ambience', settings.ambience);
    app.renderer.setQuality(settings.graphics);
    app.renderer.setReducedMotion(settings.reducedMotion);
  },
  onThemeChange(themeId) { app.renderer.setTheme(themeId); },
  onCameraReset() { app.renderer.resetCamera(); },
  onPaused() { setState('paused', 'user'); },
  getProgression() { return app.progression; },
  getTutorial() { return app.tutorial; },
};

// ---------------------------------------------------------------------------
// Boot

function detectWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

async function boot() {
  // Global recoverable error handler.
  window.addEventListener('error', (e) => {
    console.error(e.error || e.message);
    if (app.ui && app.state !== 'boot') {
      app.ui.showError('A recoverable error occurred. Your round state is saved.', () => {
        if (app.session) app.session.saveSnapshot();
        showTitle();
      });
    }
  });

  app.progression = loadProgression();
  app.tutorial = loadTutorial();
  app.stats = loadStats();
  app.achievements = loadAchievements();

  const settings = loadSettings();
  app.ui = new UI(uiRoot, handlers);
  app.audio = new PantryAudio({
    seed: 'session',
    caption: (text) => app.ui.announce(text),
  });
  app.audio.setVolume('music', settings.music);
  app.audio.setVolume('effects', settings.effects);
  app.audio.setVolume('ambience', settings.ambience);

  // Audio requires a user gesture; start once on first interaction.
  const startAudio = () => { app.audio.start(); };
  window.addEventListener('pointerdown', startAudio, { once: true });
  window.addEventListener('keydown', startAudio, { once: true });

  const webglOk = detectWebGL() && !!globalThis.THREE;
  app.renderer = createRenderer(canvas, {
    quality: settings.graphics,
    reducedMotion: settings.reducedMotion,
    onContextLost: () => {
      app.ui.announce('Graphics context lost — restoring…', true);
    },
    onContextRestored: () => {
      if (app.session) app.renderer.update(app.session.snapshot());
      app.ui.announce('Graphics restored.');
    },
  });
  if (!app.renderer.available) {
    app.ui.showCompatNotice(app.renderer.reason || 'webgl');
    canvas.style.display = 'none';
  }

  window.addEventListener('resize', () => app.renderer.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => app.renderer.resize(), 60));

  // Content sanity check (dev aid; cheap).
  const validation = content.validateContent();
  if (!validation.ok) console.warn('content validation issues:', validation.errors);

  await syncServerTime();
  setState('title', 'boot-complete');
  showTitle();
}

boot();
