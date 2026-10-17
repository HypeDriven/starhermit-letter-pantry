// Letter Pantry — semantic HTML interface layer. The canvas is never the only
// UI: every game action has a DOM control, full keyboard operation, ARIA live
// announcements, and persisted accessibility settings.

import { loadJSON, saveJSON } from './session.js';
import { PRESETS, CATEGORIES, presetTier, choosePreset } from './gfx.js';
import { pickLocale, gfxT } from './gfx-i18n.js';
import { shStrings } from './sh-strings.js';
import { T, N, getLang } from './i18n.js';
import { ACHIEVEMENTS, JOURNEY, CHALLENGES, LESSONS, PRACTICE_DIFFICULTIES, THEMES, CONTENT_VERSION } from './content.js';

export const DEFAULT_SETTINGS = {
  music: 0.6, effects: 0.8, ambience: 0.5,
  gfx: {}, reducedMotion: false, highContrast: false,
  largerText: false, cvdPalette: false, leftHanded: false,
  hapticsOff: false, tutorialReplay: true,
};

export function loadSettings() {
  const s = Object.assign({}, DEFAULT_SETTINGS, loadJSON('settings') || {});
  // Legacy three-tier `graphics` setting → graphics preset (medium means Auto).
  if ('graphics' in s) {
    if (!s.gfx || !Object.keys(s.gfx).length) s.gfx = s.graphics === 'low' || s.graphics === 'high' ? { preset: s.graphics } : {};
    delete s.graphics;
  }
  if (!s.gfx || typeof s.gfx !== 'object') s.gfx = {};
  return s;
}
export function saveSettings(s) { saveJSON('settings', s); }

// Opening a panel must show its top: clear any scroll left by focus or reuse.
function resetScroll(root) {
  for (const n of [root, ...root.querySelectorAll('*')]) if (n.scrollTop) n.scrollTop = 0;
}

// Localized text: `t` (an English key, or a thunk) with optional `tv` vars sets
// textContent; `at`/`atv` set aria-label. Such nodes are remembered and
// re-rendered in place by relabelAll() when the game language changes, so open
// screens and dialogs (and the shared sections mounted in Settings) survive.
const LOC = new Set();
const resolveVars = (vars) => vars && Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'function' ? v() : v]));
const locText = (key, vars) => (typeof key === 'function' ? key() : T(key, resolveVars(vars)));
function applyLoc(node) {
  const l = node.__loc;
  if (l.t != null) node.textContent = locText(l.t, l.tv);
  if (l.at != null) node.setAttribute('aria-label', locText(l.at, l.atv));
}
export function relabelAll() {
  for (const node of LOC) {
    if (!node.isConnected) { LOC.delete(node); continue; }
    applyLoc(node);
  }
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  if (attrs.t != null || attrs.at != null) {
    node.__loc = { t: attrs.t, tv: attrs.tv, at: attrs.at, atv: attrs.atv };
    LOC.add(node);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === 't' || k === 'tv' || k === 'at' || k === 'atv') continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  // Children may be nested arrays (e.g. `list.map(...)`); appending an array
  // directly would stringify it, so flatten before appending.
  const appendChild = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) { c.forEach(appendChild); return; }
    node.append(c);
  };
  children.forEach(appendChild);
  if (node.__loc) applyLoc(node);
  return node;
}

// Keyboard actions → default KeyboardEvent.code values. Mirrors the control.*
// lines in starhermit.txt; the player's StarHermit bindings replace them.
export const DEFAULT_BINDINGS = {
  next: ['ArrowRight', 'ArrowDown'], prev: ['ArrowLeft', 'ArrowUp'],
  submit: ['Enter'], unpick: ['Backspace'], clear: ['Escape'],
  pause: ['KeyP'], undo: ['KeyU'], hint: ['KeyH'], camera: ['KeyR'],
};

export function keyLabel(code) {
  if (!code) return '—';
  const named = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Space: 'Space' };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code;
}

// gfx.js describe() builds the cost summary from English parts; translate them here.
const SUMMARY_PARTS = [N('no shadows'), N('full ambient occlusion'), N('ambient occlusion'), N('bloom'), N('reflections'), N('no anti-aliasing')];
function localizeSummary(summary) {
  return String(summary || '').split(' · ').map((part) => {
    const m = /^(\d+)² shadows$/.exec(part);
    if (m) return T(N('{n}² shadows'), { n: m[1] });
    return SUMMARY_PARTS.includes(part) ? T(part) : part;
  }).join(' · ');
}

const DIFFICULTY_LABEL = { easy: N('Easy'), medium: N('Medium'), hard: N('Hard') };

/**
 * Round title in the current language. meta.modeKey = [key, vars] (vars may hold
 * content keys under `tier`/`challenge`/`lesson`, translated here); older
 * snapshots only carry the English meta.modeLabel.
 */
export function modeLabel(meta) {
  if (!meta) return '';
  if (!meta.modeKey) return meta.modeLabel || '';
  const [key, vars = {}] = meta.modeKey;
  const v = { ...vars };
  for (const k of ['tier', 'challenge', 'lesson', 'difficulty']) if (v[k] != null) v[k] = T(v[k]);
  return T(key, v);
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class UI {
  // handlers: onPlayJourney(i), onPlayDaily(), onPlayPractice(diff),
  // onPlayChallenge(id), onPlayLesson(id), onResume(), onLeaveRound(),
  // onRetry(), onNext(), onCommand(cmd), onSettingsChanged(settings),
  // onCameraReset()
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.settings = loadSettings();
    this.session = null;
    this.screen = null;
    this.overlay = null;
    this.timerId = null;
    this.playerStatus = ''; // platform profile name + cloud sync status
    this.account = { canSignIn: false, canInvite: false }; // StarHermit title buttons

    this.setBindings(DEFAULT_BINDINGS);
    this.applySettingsClasses();

    root.innerHTML = '';
    this.livePolite = el('div', { class: 'lp-sr-only', role: 'status', 'aria-live': 'polite', id: 'lp-live' });
    this.liveAssert = el('div', { class: 'lp-sr-only', role: 'alert', 'aria-live': 'assertive', id: 'lp-alert' });
    this.screenRoot = el('div', { class: 'lp-screen-root', id: 'lp-screen' });
    this.toastEl = el('p', { class: 'lp-toast', role: 'status', 'aria-live': 'polite', hidden: '' });
    root.append(this.screenRoot, this.livePolite, this.liveAssert, this.toastEl);
    document.addEventListener('keydown', (e) => this._onKey(e));
  }

  /** StarHermit account strings in the current game language. */
  get shT() { return shStrings([getLang()]); }

  /** Announce an English key (translated) or already-localized text. */
  announce(msg, assertive = false, vars) {
    const text = T(msg, vars);
    const region = assertive ? this.liveAssert : this.livePolite;
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = text; });
  }

  /**
   * The game language changed: re-render every remembered label in place, then
   * the parts computed from game state (play HUD, slots, lesson box).
   */
  relocalize() {
    relabelAll();
    const o = document.getElementById('lp-overlay');
    if (o) { const h = o.querySelector('h2'); if (h) o.setAttribute('aria-label', h.textContent); }
    if (this.screen === 'play' && this.session) this.updatePlay(this.session.snapshot(), this.session.actions());
    if (this.toastEl && !this.toastEl.hidden && this._toastKey) this.toastEl.textContent = T(this._toastKey);
  }

  // Platform profile name + sync status, shown on the title screen and in the
  // play HUD; empty string means offline/local (no slot is rendered).
  setPlayerStatus(text) {
    this.playerStatus = text || '';
    for (const id of ['lp-player-status', 'lp-sync-status']) {
      const node = document.getElementById(id);
      if (node) node.textContent = this.playerStatus;
    }
  }

  // Effective key bindings ({action: codes[]}); routed by event.code.
  setBindings(bindings) {
    this.bindings = bindings;
    this.codeToAction = new Map();
    for (const [action, codes] of Object.entries(bindings)) for (const c of codes) this.codeToAction.set(c, action);
  }
  _keys(action) { return (this.bindings[action] || []).map(keyLabel).join('/'); }

  // Sign-in / invite visibility for the title screen; re-renders it if shown.
  setAccount(account) {
    this.account = Object.assign({}, this.account, account);
    if (this.screen === 'title' && this._titleData) this.showTitle(this._titleData);
  }

  toast(msg) {
    this._toastKey = msg;
    this.toastEl.textContent = T(msg);
    this.toastEl.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, 3200);
    this.announce(msg);
  }

  applySettingsClasses() {
    const b = document.body;
    b.classList.toggle('lp-high-contrast', !!this.settings.highContrast);
    b.classList.toggle('lp-larger-text', !!this.settings.largerText);
    b.classList.toggle('lp-cvd-palette', !!this.settings.cvdPalette);
    b.classList.toggle('lp-reduced-motion', !!this.settings.reducedMotion);
    b.classList.toggle('lp-left-handed', !!this.settings.leftHanded);
  }

  updateSetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.h.onSettingsSaved && this.h.onSettingsSaved(this.settings);
    this.applySettingsClasses();
    this.h.onSettingsChanged && this.h.onSettingsChanged(this.settings);
  }

  // -------------------------------------------------------------------------
  _setScreen(name, node) {
    this.screen = name;
    this.screenRoot.innerHTML = '';
    this.screenRoot.append(node);
    const focusable = node.querySelector('[data-autofocus]') || node.querySelector('button');
    // preventScroll: a Done button at the bottom must not scroll the heading away.
    if (focusable) focusable.focus({ preventScroll: true });
    resetScroll(node);
    this._stopTimer();
  }

  _startTimer() {
    this._stopTimer();
    this.timerId = setInterval(() => this._tickHud(), 500);
  }
  _stopTimer() { if (this.timerId) { clearInterval(this.timerId); this.timerId = null; } }

  _onKey(e) {
    if (this.screen !== 'play' || !this.session) return;
    // Never hijack browser/OS chords (Ctrl+R reload, Cmd+P print, …).
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const act = this.codeToAction.get(e.code);
    if (this.overlay) {
      if (act === 'clear') { e.preventDefault(); this.closeOverlay(); }
      return;
    }
    const cmd = (c) => { e.preventDefault(); this.command(c); };
    switch (act) {
      case 'pause': cmd(null); this.showPause(); break;
      case 'undo': cmd({ type: 'undo' }); break;
      case 'hint': cmd({ type: 'hint' }); break;
      case 'camera': e.preventDefault(); this.h.onCameraReset && this.h.onCameraReset(); this.announce(N('Camera reset.')); break;
      case 'unpick': {
        const sel = this.session.state.selected;
        if (sel.length) cmd({ type: 'deselect', index: sel[sel.length - 1] });
        break;
      }
      case 'clear': cmd({ type: 'clear' }); break;
      case 'submit': {
        // If focus is not on a button, Enter submits the current word.
        if (!/BUTTON/.test(document.activeElement && document.activeElement.tagName)) cmd({ type: 'submit' });
        break;
      }
    }
  }

  command(cmd) {
    if (!cmd || !this.session) return;
    const res = this.h.onCommand(cmd);
    if (res && !res.ok && res.reason !== 'duplicate') {
      const messages = {
        'already-selected': N('That biscuit is already in your hand.'),
        'not-selected': N('That biscuit is not selected.'),
        'empty-selection': N('Pick some letters first.'),
        'too-short': N('Words need at least 3 letters.'),
        'already-found': N('You already found that word.'),
        'not-allowed': N('That tool is not available in this stage.'),
        'undo-unavailable': N('Undo is not allowed here.'),
        'nothing-to-undo': N('Nothing to undo.'),
        'no-hints': N('No hints left.'),
        'paused': N('Round is paused.'),
        'terminal': N('The round is over.'),
      };
      this.announce(messages[res.reason] || N('That action is not available.'), true);
    }
  }

  // -------------------------------------------------------------------------
  // Screens

  showTitle(data) {
    this._titleData = data;
    const { progression, dailyDate, hasSnapshot } = data;
    const done = progression.completedStages.length;
    const node = el('main', { class: 'lp-title lp-panel', role: 'main' },
      el('h1', { class: 'lp-logo', text: 'Letter Pantry' }),
      el('p', { class: 'lp-tagline', t: 'Spell every word hiding in the biscuit tray.' }),
      el('nav', { class: 'lp-title-nav', at: 'Main menu' },
        el('button', { class: 'lp-btn lp-btn-primary lp-btn-big', 'data-autofocus': '', onclick: () => this.showModeSelect(), t: 'Play' }),
        hasSnapshot ? el('button', { class: 'lp-btn', onclick: () => this.h.onResume(), t: 'Resume saved round' }) : null,
        el('button', { class: 'lp-btn', onclick: () => this.h.onPlayDaily(), t: 'Daily Pantry — {date}', tv: { date: dailyDate } }),
        el('button', { class: 'lp-btn', onclick: () => this.showJourney(), t: 'Journey ({done}/{total})', tv: { done, total: JOURNEY.length } }),
        el('button', { class: 'lp-btn', onclick: () => this.showHelp(), t: 'How to play' }),
        el('button', { class: 'lp-btn', onclick: () => this.showSettings(), t: 'Settings' }),
      ),
      this.playerStatus ? el('p', { class: 'lp-player-status', id: 'lp-player-status', text: this.playerStatus }) : null,
      (this.account.canSignIn || this.account.canInvite) ? el('div', { class: 'lp-account' },
        this.account.canSignIn ? el('button', { class: 'lp-btn', id: 'lp-signin', onclick: () => this.h.onSignIn && this.h.onSignIn(), t: () => this.shT.signIn }) : null,
        this.account.canInvite ? el('button', { class: 'lp-btn', id: 'lp-invite', onclick: () => this.h.onInvite && this.h.onInvite(), t: () => this.shT.invite }) : null,
      ) : null,
      el('p', { class: 'lp-version', t: 'Content {v}', tv: { v: CONTENT_VERSION } }),
    );
    this._setScreen('title', node);
  }

  showModeSelect() {
    const modeCard = (title, desc, meta, onGo, primary) => el('article', { class: 'lp-mode-card' },
      el('h3', { t: title }),
      el('p', { t: desc }),
      el('p', { class: 'lp-mode-meta', t: meta }),
      el('button', { class: 'lp-btn' + (primary ? ' lp-btn-primary' : ''), onclick: onGo, t: 'Start' }),
    );
    const node = el('main', { class: 'lp-panel lp-modes', role: 'main' },
      el('h2', { t: 'Choose a mode' }),
      el('div', { class: 'lp-mode-grid' },
        modeCard(N('Journey'), N('Authored stages that teach and test you, one mechanic at a time.'), N('42 stages · solo · unranked'), () => this.showJourney(), true),
        modeCard(N('Daily Pantry'), N('One shared puzzle per UTC day. Same tray for everyone.'), N('1 round · ranked · ~3 min'), () => this.h.onPlayDaily()),
        modeCard(N('Practice'), N('Relaxed round at your chosen difficulty. Undo allowed.'), N('unranked · restartable'), () => this.showPractice()),
        modeCard(N('Challenge'), N('Constrained rounds: move limits, speed targets, restricted tools.'), N('4 trials · unranked'), () => this.showChallenges()),
        modeCard(N('Learn'), N('Interactive lessons. Each step asks you to perform the action yourself.'), N('3 lessons · unranked'), () => this.showLearn()),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.h.onLeaveRound('to-title'), t: 'Back' }),
    );
    this._setScreen('modes', node);
  }

  showJourney() {
    const prog = this.h.getProgression();
    const list = el('ol', { class: 'lp-stage-list', at: 'Journey stages' });
    JOURNEY.forEach((stage, i) => {
      const unlocked = i === 0 || prog.completedStages.includes(JOURNEY[i - 1].id);
      const doneStage = prog.completedStages.includes(stage.id);
      const li = el('li', {},
        el('button', {
          class: 'lp-btn lp-stage' + (doneStage ? ' lp-stage-done' : ''),
          disabled: unlocked ? null : '',
          at: doneStage ? 'Stage {n}: {word}, {tier}, completed' : unlocked ? 'Stage {n}: {word}, {tier}' : 'Stage {n}: {word}, {tier}, locked',
          atv: { n: i + 1, word: stage.base, tier: () => T(stage.tier) },
          onclick: () => unlocked && this.h.onPlayJourney(i),
        }, `${i + 1}. ${stage.base.toUpperCase()} ${doneStage ? '✓' : ''} `, el('span', { class: 'lp-stage-tier', t: stage.tier })),
      );
      list.append(li);
    });
    const node = el('main', { class: 'lp-panel lp-journey', role: 'main' },
      el('h2', { t: 'Journey' }),
      el('p', { t: '{done} of {total} stages complete.', tv: { done: prog.completedStages.length, total: JOURNEY.length } }),
      el('div', { class: 'lp-stage-scroll' }, list),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect(), t: 'Back' }),
    );
    this._setScreen('journey', node);
  }

  showPractice() {
    const node = el('main', { class: 'lp-panel', role: 'main' },
      el('h2', { t: 'Practice' }),
      el('p', { t: 'Pick a difficulty. Practice never affects ranked boards.' }),
      el('div', { class: 'lp-row' },
        PRACTICE_DIFFICULTIES.map((d) =>
          el('button', { class: 'lp-btn lp-btn-big', onclick: () => this.h.onPlayPractice(d), t: DIFFICULTY_LABEL[d] })),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect(), t: 'Back' }),
    );
    this._setScreen('practice', node);
  }

  showChallenges() {
    const node = el('main', { class: 'lp-panel', role: 'main' },
      el('h2', { t: 'Challenges' }),
      el('ul', { class: 'lp-challenge-list' },
        CHALLENGES.map((c) => el('li', {},
          el('button', { class: 'lp-btn lp-challenge', onclick: () => this.h.onPlayChallenge(c.id) },
            el('strong', { text: c.base.toUpperCase() }), ' — ', el('span', { t: c.challenge }))))),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect(), t: 'Back' }),
    );
    this._setScreen('challenges', node);
  }

  showLearn() {
    const tut = this.h.getTutorial();
    const node = el('main', { class: 'lp-panel', role: 'main' },
      el('h2', { t: 'Learn' }),
      el('ul', { class: 'lp-challenge-list' },
        LESSONS.map((l) => el('li', {},
          el('button', { class: 'lp-btn lp-challenge', onclick: () => this.h.onPlayLesson(l.id) },
            el('span', { t: l.title }), tut.completedLessons.includes(l.id) ? ' ✓' : '')))),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect(), t: 'Back' }),
    );
    this._setScreen('learn', node);
  }

  // -------------------------------------------------------------------------
  // Play HUD

  showPlay(session, meta) {
    this.session = session;
    this.meta = meta; // {modeLabel, lesson?}
    const s = session.snapshot();

    const objective = el('section', { class: 'lp-rail lp-rail-left', at: 'Objective and word slots' },
      el('h2', { class: 'lp-hud-heading', t: () => modeLabel(meta) }),
      el('p', { class: 'lp-objective', id: 'lp-objective' }),
      el('div', { class: 'lp-slots', id: 'lp-slots', role: 'list', at: 'Target words' }),
      el('p', { class: 'lp-bonus-count', id: 'lp-bonus' }),
      meta.lesson ? el('div', { class: 'lp-lesson-box', id: 'lp-lesson-box' },
        el('h3', { t: meta.lesson.title }),
        el('p', { id: 'lp-lesson-text' })) : null,
    );

    const actions = el('section', { class: 'lp-rail lp-rail-right', at: 'Actions and status' },
      el('div', { class: 'lp-status' },
        el('p', { class: 'lp-score' }, el('span', { t: 'Score:' }), ' ', el('strong', { id: 'lp-score', text: '0' })),
        el('p', { class: 'lp-moves', id: 'lp-moves' }),
        el('p', { class: 'lp-time', id: 'lp-time' }),
        this.playerStatus ? el('p', { class: 'lp-player-status', id: 'lp-sync-status', text: this.playerStatus }) : null,
      ),
      el('div', { class: 'lp-actions', role: 'group', at: 'Round actions' },
        this._actionBtn(N('Submit'), 'submit', () => this.command({ type: 'submit' }), 'lp-btn-primary'),
        this._actionBtn(N('Clear'), 'clear', () => this.command({ type: 'clear' })),
        this._actionBtn(N('Shuffle'), 'shuffle', () => this.command({ type: 'shuffle' })),
        this._actionBtn(N('Undo'), 'undo', () => this.command({ type: 'undo' })),
        this._actionBtn(N('Hint'), 'hint', () => this.command({ type: 'hint' })),
        el('button', { class: 'lp-btn', id: 'lp-act-pause', onclick: () => this.showPause(), t: 'Pause ({key})', tv: { key: 'P' } }),
      ),
    );

    const tray = el('section', { class: 'lp-tray', at: 'Letter tray' },
      el('div', { class: 'lp-current', id: 'lp-current', at: 'Current word' }),
      el('div', { class: 'lp-letters', id: 'lp-letters', role: 'group', at: 'Letters' }),
    );

    const boardModel = el('div', { class: 'lp-sr-only', id: 'lp-board-model', at: 'Board state summary' });

    const node = el('main', { class: 'lp-play', role: 'main' },
      objective, tray, actions, boardModel);

    this._setScreen('play', node);
    this._buildLetterButtons(s);
    this.updatePlay(s, session.actions());
    this._startTimer();
    this.announce('{mode}. Find {n} words. Letters: {letters}.', false, { mode: modeLabel(meta), n: s.targets.length, letters: s.letters.join(', ') });
    if (meta.lesson) this._updateLesson();
  }

  _actionBtn(label, id, onclick, extra = '') {
    return el('button', { class: `lp-btn ${extra}`, id: `lp-act-${id}`, onclick, t: label });
  }

  _buildLetterButtons(snapshot) {
    const wrap = document.getElementById('lp-letters');
    wrap.innerHTML = '';
    snapshot.letters.forEach((letter, i) => {
      const btn = el('button', {
        class: 'lp-letter', 'data-index': i, 'aria-pressed': 'false',
        at: 'Letter {letter}', atv: { letter: letter.toUpperCase() },
        onclick: () => this._toggleLetter(i),
      }, letter.toUpperCase());
      // Arrow-key navigation among letters.
      btn.addEventListener('keydown', (e) => {
        const letters = [...wrap.querySelectorAll('.lp-letter')];
        const idx = letters.indexOf(btn);
        const act = this.codeToAction.get(e.code);
        if (act === 'next') { e.preventDefault(); letters[(idx + 1) % letters.length].focus(); }
        if (act === 'prev') { e.preventDefault(); letters[(idx - 1 + letters.length) % letters.length].focus(); }
      });
      wrap.append(btn);
    });
  }

  _toggleLetter(i) {
    const sel = this.session.state.selected;
    this.command(sel.includes(i) ? { type: 'deselect', index: i } : { type: 'select', index: i });
  }

  updatePlay(snapshot, actions) {
    if (this.screen !== 'play') return;
    const actionTypes = new Set(actions.map((a) => a.type + (a.index != null ? ':' + a.index : '')));
    const has = (t) => actions.some((a) => a.type === t);

    // Letters.
    const wrap = document.getElementById('lp-letters');
    if (wrap) {
      if (wrap.children.length !== snapshot.letters.length) this._buildLetterButtons(snapshot);
      [...wrap.children].forEach((btn, i) => {
        if (btn.textContent.toLowerCase() !== snapshot.letters[i]) {
          btn.textContent = snapshot.letters[i].toUpperCase();
          btn.__loc.atv = { letter: snapshot.letters[i].toUpperCase() };
          btn.setAttribute('aria-label', T('Letter {letter}', btn.__loc.atv));
        }
        const sel = snapshot.selected.includes(i);
        btn.setAttribute('aria-pressed', sel ? 'true' : 'false');
        btn.classList.toggle('lp-letter-sel', sel);
        const order = snapshot.selected.indexOf(i);
        btn.style.setProperty('--order', sel ? order : '');
      });
    }
    const word = snapshot.selected.map((i) => snapshot.letters[i].toUpperCase()).join('');
    const cur = document.getElementById('lp-current');
    if (cur) cur.textContent = word || '·';

    // Word slots.
    const slots = document.getElementById('lp-slots');
    if (slots) {
      slots.innerHTML = '';
      const sorted = snapshot.targets.slice().sort((a, b) => a.length - b.length || a.localeCompare(b));
      for (const t of sorted) {
        const found = snapshot.foundTargets.includes(t);
        const reveals = (snapshot.hintReveals && snapshot.hintReveals[t]) || [];
        const label = found ? t.toUpperCase()
          : t.split('').map((ch, p) => reveals.includes(p) ? ch.toUpperCase() : '_').join(' ');
        const li = el('div', {
          class: 'lp-slot' + (found ? ' lp-slot-found' : ''), role: 'listitem',
          'aria-label': found ? T('Found: {word}', { word: t }) : T('Unfound word, {n} letters', { n: t.length }),
        }, label);
        slots.append(li);
      }
    }
    const bonus = document.getElementById('lp-bonus');
    if (bonus) bonus.textContent = T('Bonus words found: {n}', { n: snapshot.foundBonus.length });

    // Status.
    const score = document.getElementById('lp-score');
    if (score) score.textContent = String(snapshot.score.total);
    this._tickHud(snapshot);

    // Action availability.
    const setEnabled = (id, ok) => { const b = document.getElementById('lp-act-' + id); if (b) b.disabled = !ok; };
    setEnabled('submit', has('submit'));
    setEnabled('clear', has('clear'));
    setEnabled('shuffle', has('shuffle'));
    setEnabled('undo', has('undo'));
    setEnabled('hint', has('hint'));

    // Concise textual board model.
    const model = document.getElementById('lp-board-model');
    if (model) {
      model.textContent = T('Tray letters: {letters}. Selected: {word}. Found {found} of {total} target words. Score {score}.', {
        letters: snapshot.letters.map((l) => l.toUpperCase()).join(' '), word: word || T('none'),
        found: snapshot.foundTargets.length, total: snapshot.targets.length, score: snapshot.score.total,
      });
    }
    if (this.meta && this.meta.lesson) this._updateLesson();
  }

  _tickHud(snapshot) {
    if (!this.session) return;
    const snap = snapshot || this.session.snapshot();
    const timeEl = document.getElementById('lp-time');
    if (timeEl) timeEl.textContent = T('Time: {time} (par {par})', { time: fmtTime(this.session.elapsedMs()), par: fmtTime(snap.par.timeMs) });
    const movesEl = document.getElementById('lp-moves');
    if (movesEl) {
      movesEl.textContent = snap.mechanics.moveLimit != null
        ? T('Moves: {used}/{limit}', { used: snap.movesUsed, limit: snap.mechanics.moveLimit })
        : T('Moves: {used}', { used: snap.movesUsed });
    }
    const obj = document.getElementById('lp-objective');
    if (obj) obj.textContent = T('Find all {n} target words ({found} found).', { n: snap.targets.length, found: snap.foundTargets.length });
  }

  _updateLesson() {
    const lesson = this.meta.lesson;
    const tracker = this.meta.lessonTracker;
    const text = document.getElementById('lp-lesson-text');
    if (!text || !tracker) return;
    if (tracker.done) {
      text.textContent = T('Lesson complete! Finish the round or leave when ready.');
    } else {
      const step = lesson.steps[tracker.stepIndex];
      text.textContent = T('Step {n}/{count}: {text}', { n: tracker.stepIndex + 1, count: lesson.steps.length, text: T(step.text) });
    }
  }

  // -------------------------------------------------------------------------
  // Overlays

  _openOverlay(name, node) {
    const returnFocus = this.overlayReturnFocus ||
      (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
    this.closeOverlay();
    this.overlay = name;
    this.overlayReturnFocus = returnFocus;
    const heading = node.querySelector('h2');
    const wrap = el('div', {
      class: 'lp-overlay', role: 'dialog', 'aria-modal': 'true', id: 'lp-overlay',
      'aria-label': heading ? heading.textContent : name,
    }, node);
    this.root.append(wrap);
    const focusable = node.querySelector('[data-autofocus]') || node.querySelector('button');
    // preventScroll: a Done button at the bottom must not scroll the heading away.
    if (focusable) focusable.focus({ preventScroll: true });
    resetScroll(wrap);
  }

  closeOverlay() {
    const o = document.getElementById('lp-overlay');
    if (o) o.remove();
    this.overlay = null;
    const back = this.overlayReturnFocus;
    this.overlayReturnFocus = null;
    if (back && back.isConnected) back.focus();
  }

  showPause() {
    if (this.screen !== 'play') return;
    this.session.pause('user');
    this.h.onPaused && this.h.onPaused();
    const node = el('div', { class: 'lp-panel lp-pause' },
      el('h2', { t: 'Paused' }),
      el('button', { class: 'lp-btn lp-btn-primary lp-btn-big', 'data-autofocus': '', onclick: () => { this.closeOverlay(); this.session.resume('user'); }, t: 'Resume' }),
      el('div', { class: 'lp-pause-grid' },
        el('button', { class: 'lp-btn', onclick: () => this.showSettings(true), t: 'Audio & graphics' }),
        el('button', { class: 'lp-btn', onclick: () => this.showSettings(true), t: 'Accessibility' }),
        el('button', { class: 'lp-btn', onclick: () => this.showHelp(true), t: 'Help' }),
        el('button', { class: 'lp-btn lp-btn-danger', onclick: () => { this.closeOverlay(); this.h.onLeaveRound('pause'); }, t: 'Leave round' }),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => { this.closeOverlay(); this.session.resume('user'); }, t: 'Back to game' }),
    );
    this._openOverlay('pause', node);
    this.announce(N('Paused.'));
  }

  /** Results-screen leaderboard line: key in lbPosting/lbRank/lbPosted/lbNotPosted, or null to hide. */
  setLeaderboardLine(key, rank) {
    const line = typeof document !== 'undefined' ? document.getElementById('results-lb') : null;
    if (!line) return;
    line.hidden = !key;
    line.__loc = { t: () => (key ? String(this.shT[key] || '').replace('{rank}', String(rank)) : '') };
    LOC.add(line);
    applyLoc(line);
  }

  showResults(result) {
    this._stopTimer();
    const { outcome, score, progressionText, newAchievements, sessionMeta, allowNext } = result;
    const headline = outcome === 'completed' ? N('Pantry stocked!') : outcome === 'out-of-moves' ? N('Out of moves') : N('Round resigned');
    const rows = [
      [N('Target words'), score.target], [N('Bonus words'), score.bonus], [N('Length bonus'), score.length],
      [N('Streak bonus'), score.streak], [N('Invalid penalty'), score.penalty], [N('Time bonus'), score.time],
    ];
    // progressionText / comparison arrive as [[key, vars], …] so they re-render in the new language.
    const lines = (parts) => () => parts.map(([k, v]) => T(k, resolveVars(v))).join(' ');
    const node = el('main', { class: 'lp-panel lp-results', role: 'main' },
      el('h2', { t: headline, 'data-autofocus': '', tabindex: '-1' }),
      outcome === 'completed' ? el('img', {
        class: 'lp-results-art', src: './assets/results-tray.webp', alt: '',
        role: 'presentation', decoding: 'async', loading: 'lazy',
        onerror: (e) => { e.target.remove(); },
      }) : null,
      el('table', { class: 'lp-score-table' },
        el('caption', { t: 'Score breakdown' }),
        el('tbody', {},
          rows.map(([label, v]) => el('tr', {}, el('th', { scope: 'row', t: label }), el('td', { text: String(v) }))),
          el('tr', { class: 'lp-total' }, el('th', { scope: 'row', t: 'Total' }), el('td', { text: String(score.total) })))),
      progressionText && progressionText.length ? el('p', { class: 'lp-progress-note', t: lines(progressionText) }) : null,
      newAchievements && newAchievements.length
        ? el('div', { class: 'lp-achievements' },
            el('h3', { t: 'Achievements unlocked' }),
            el('ul', {}, newAchievements.map((a) => el('li', { t: () => `🏆 ${T(a.name)} — ${T(a.desc)}` }))))
        : null,
      result.comparison && result.comparison.length ? el('p', { class: 'lp-progress-note', t: lines(result.comparison) }) : null,
      el('p', { class: 'lp-progress-note', id: 'results-lb', role: 'status', hidden: '' }),
      el('div', { class: 'lp-row' },
        el('button', { class: 'lp-btn lp-btn-primary', onclick: () => this.h.onRetry(), t: 'Retry' }),
        allowNext ? el('button', { class: 'lp-btn', onclick: () => this.h.onNext(), t: 'Next stage' }) : null,
        el('button', { class: 'lp-btn', onclick: () => this.h.onLeaveRound('results'), t: 'Back to title' }),
      ),
    );
    this._setScreen('results', node);
    this.announce('{headline}. Total score {score}.', true, { headline: T(headline), score: score.total });
  }

  showHelp(inOverlay = false) {
    const card = (title, text, vars) => el('article', { class: 'lp-help-card' }, el('h3', { t: title }), el('p', { t: text, tv: vars }));
    const node = el('div', { class: 'lp-panel lp-help' },
      el('h2', { t: 'How to play' }),
      el('div', { class: 'lp-help-grid' },
        card(N('Goal'), N('Rearrange the letter biscuits to find every target word. Bonus words score extra.')),
        card(N('Select'), N('Tap or focus a letter and press Enter to pick it. Letters form a word in pick order.')),
        card(N('Submit'), N('With 3+ letters picked, press Submit. Invalid words cost 25 points and break your streak.')),
        card(N('Tools'), N('Shuffle mixes the tray. Undo takes back an action where allowed. Hint reveals a letter of an unfound word.')),
        card(N('Keyboard'), N('{prev} {next} move between letters · Enter picks a focused letter · {submit} submits · {unpick} unpicks · {clear} clears · {pause} pause · {undo} undo · {hint} hint · {camera} camera reset.'), {
          prev: this._keys('prev'), next: this._keys('next'), submit: this._keys('submit'), unpick: this._keys('unpick'),
          clear: this._keys('clear'), pause: this._keys('pause'), undo: this._keys('undo'), hint: this._keys('hint'), camera: this._keys('camera'),
        }),
        card(N('Scoring'), N('Target word 100 + 25 per letter past 3. Bonus word 50 + 10 per letter past 3. Streaks add 15 each. Beat par time for a bonus.')),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => inOverlay ? this.showPause() : this.h.onLeaveRound('to-title'), t: 'Back' }),
    );
    if (inOverlay) this._openOverlay('help', node);
    else this._setScreen('help', node);
  }

  showSettings(inOverlay = false) {
    const s = this.settings;
    const slider = (label, key) => el('label', { class: 'lp-setting' },
      el('span', { t: label }),
      el('input', {
        type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]),
        at: label,
        oninput: (e) => this.updateSetting(key, Number(e.target.value)),
      }));
    const toggle = (label, key) => el('label', { class: 'lp-setting' },
      el('span', { t: label }),
      el('input', {
        type: 'checkbox', at: label,
        onchange: (e) => this.updateSetting(key, e.target.checked),
        ...(s[key] ? { checked: '' } : {}),
      }));
    const node = el('div', { class: 'lp-panel lp-settings' },
      el('h2', { t: 'Settings' }),
      el('fieldset', {}, el('legend', { t: 'Audio' }),
        slider(N('Music volume'), 'music'), slider(N('Effects volume'), 'effects'), slider(N('Ambience volume'), 'ambience')),
      this._graphicsSection(toggle),
      el('fieldset', {}, el('legend', { t: 'Accessibility' }),
        toggle(N('Larger text'), 'largerText'), toggle(N('Color-vision-safe palette'), 'cvdPalette'),
        toggle(N('Left-handed controls'), 'leftHanded'), toggle(N('Haptics off'), 'hapticsOff'),
        toggle(N('Replay tutorial prompts'), 'tutorialReplay')),
      el('fieldset', {}, el('legend', { t: 'Themes' }),
        el('div', { class: 'lp-row' }, THEMES.map((t) =>
          el('button', { class: 'lp-btn', onclick: () => { this.h.onThemeChange && this.h.onThemeChange(t.id); this.announce('Theme: {name}', false, { name: T(t.name) }); }, t: t.name })))),
      el('button', { class: 'lp-btn lp-back', onclick: () => inOverlay ? this.showPause() : this.h.onLeaveRound('to-title'), t: 'Back' }),
    );
    if (inOverlay) this._openOverlay('settings', node);
    else this._setScreen('settings', node);
  }

  // Graphics section: quality preset, render scale, per-effect overrides,
  // adaptive resolution, frame-rate readout and a GPU/cost summary. Strings
  // come from gfx-i18n.js in the browser's locale.
  _graphicsSection(toggle) {
    // Strings follow the game language; `lt(k, v)` is the re-renderable form.
    const t = (k, v) => gfxT(pickLocale(getLang()), k, v);
    const lt = (k, v) => () => t(k, typeof v === 'function' ? v() : v);
    const tier = (x) => t('t_' + x);
    const info = () => (this.h.getGraphicsInfo ? this.h.getGraphicsInfo() : null);
    const detected = (info() || {}).detected || 'balanced';
    const saved = () => Object.assign({}, this.settings.gfx || {});
    const chosen = () => (PRESETS.includes((this.settings.gfx || {}).preset) ? this.settings.gfx.preset : 'auto');
    const effective = () => (chosen() === 'auto' ? detected : chosen());
    const save = (g) => { this.updateSetting('gfx', g); refresh(); setTimeout(updateSummary, 120); };
    const row = (label, control, extra) => el('label', { class: 'lp-setting' }, el('span', { t: label }), extra || null, control);

    const presetSel = el('select', {
      id: 'gfx-preset', 'data-gfx': 'preset', at: lt('quality'),
      onchange: (e) => save(choosePreset(saved(), e.target.value)),
    }, el('option', { value: 'auto', t: lt('auto', () => ({ tier: tier(detected) })) }),
    PRESETS.map((p) => el('option', { value: p, t: () => tier(p) })));

    const scaleOut = el('output', { id: 'gfx-scale-value', class: 'lp-gfx-value', for: 'gfx-scale' });
    const scale = el('input', {
      type: 'range', id: 'gfx-scale', 'data-gfx': 'render_scale', min: '50', max: '200', step: '5',
      at: lt('renderScale'),
      oninput: (e) => { const g = saved(); g.render_scale = Number(e.target.value) / 100; save(g); },
    });
    const cats = {};
    const catRows = Object.entries(CATEGORIES).map(([cat, tiers]) => {
      cats[cat] = el('select', {
        id: 'gfx-cat-' + cat, 'data-gfx-cat': cat, at: lt('cat_' + cat),
        onchange: (e) => {
          const g = saved();
          if (e.target.value === 'preset') delete g[cat]; else g[cat] = e.target.value;
          save(g);
        },
      }, el('option', { value: 'preset', t: () => t('fromPreset', { tier: tier(presetTier(effective(), cat)) }) }), tiers.map((x) => el('option', { value: x, t: () => tier(x) })));
      return row(lt('cat_' + cat), cats[cat]);
    });
    const check = (id, key, label) => {
      const box = el('input', {
        type: 'checkbox', id, 'data-gfx': key, at: label,
        onchange: (e) => { const g = saved(); g[key] = e.target.checked; save(g); },
      });
      return box;
    };
    const adaptive = check('gfx-adaptive', 'adaptive', lt('adaptive'));
    const fps = check('gfx-fps', 'show_fps', lt('showFps'));
    const summary = el('p', { id: 'gfx-summary', class: 'lp-gfx-summary' });
    const note = el('p', { id: 'gfx-post-note', class: 'lp-gfx-note', role: 'note', hidden: '' });

    const refresh = () => {
      const g = this.settings.gfx || {};
      presetSel.value = chosen();
      const pct = Math.round((Number(g.render_scale) || 1) * 100);
      scale.value = String(pct);
      scaleOut.textContent = pct + '%';
      for (const [cat, sel] of Object.entries(cats)) {
        sel.options[0].textContent = t('fromPreset', { tier: tier(presetTier(effective(), cat)) });
        sel.value = CATEGORIES[cat].includes(g[cat]) ? g[cat] : 'preset';
      }
      adaptive.checked = g.adaptive !== false;
      fps.checked = !!g.show_fps;
    };
    const updateSummary = () => {
      const i = info();
      const text = i ? `${i.gpu || t('gpuUnknown')} · ${t('level', { level: i.level ?? 0 })} · ${localizeSummary(i.summary)}` : t('noWebgl');
      if (summary.textContent !== text) summary.textContent = text;
      note.textContent = t('postUnavailable');
      note.hidden = !(i && i.postFailed);
    };
    refresh();
    updateSummary();
    const timer = setInterval(() => { if (!summary.isConnected) clearInterval(timer); else updateSummary(); }, 1000);

    // The summary and note re-read the language on their 1 s refresh; registered
    // so a language change updates them at once.
    summary.__loc = { t: () => { updateSummary(); return summary.textContent; } }; LOC.add(summary);
    return el('fieldset', { class: 'lp-gfx', 'data-gfx-section': '' }, el('legend', { t: lt('graphics') }),
      row(lt('quality'), presetSel),
      el('label', { class: 'lp-setting lp-gfx-scale' }, el('span', { t: lt('renderScale') }),
        el('span', { class: 'lp-gfx-range' }, scale, scaleOut)),
      catRows,
      row(lt('adaptive'), adaptive),
      row(lt('showFps'), fps),
      toggle(N('Reduced motion'), 'reducedMotion'), toggle(N('High contrast'), 'highContrast'),
      summary, note);
  }

  showPreparing(meta, countdownSeconds = 3) {
    const node = el('main', { class: 'lp-panel lp-preparing', role: 'main' },
      el('h2', { t: () => modeLabel(meta) }),
      el('p', { class: 'lp-countdown', id: 'lp-countdown', role: 'timer' }, '…'),
    );
    this._setScreen('preparing', node);
    let n = countdownSeconds;
    const cd = document.getElementById('lp-countdown');
    this._stopTimer();
    this.timerId = setInterval(() => {
      if (n <= 0) { this._stopTimer(); return; }
      cd.textContent = String(n);
      this.h.onCountdownTick && this.h.onCountdownTick();
      this.announce(String(n));
      n--;
    }, 1000);
  }

  showError(message, recover) {
    const node = el('main', { class: 'lp-panel lp-error', role: 'alert' },
      el('h2', { t: 'Something went wrong' }),
      el('p', { t: message }),
      el('button', { class: 'lp-btn lp-btn-primary', onclick: recover, t: 'Continue' }),
    );
    this._setScreen('error', node);
  }

  showCompatNotice(reason) {
    const note = el('div', { class: 'lp-compat', role: 'note', t: '3D view unavailable ({reason}). The game below is fully playable.', tv: { reason } });
    this.root.prepend(note);
  }
}
