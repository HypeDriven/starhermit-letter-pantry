// Letter Pantry — semantic HTML interface layer. The canvas is never the only
// UI: every game action has a DOM control, full keyboard operation, ARIA live
// announcements, and persisted accessibility settings.

import { loadJSON, saveJSON } from './session.js';
import { PRESETS, CATEGORIES, presetTier, choosePreset } from './gfx.js';
import { pickLocale, gfxT } from './gfx-i18n.js';
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

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
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
  return node;
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
    this.applySettingsClasses();

    root.innerHTML = '';
    this.livePolite = el('div', { class: 'lp-sr-only', role: 'status', 'aria-live': 'polite', id: 'lp-live' });
    this.liveAssert = el('div', { class: 'lp-sr-only', role: 'alert', 'aria-live': 'assertive', id: 'lp-alert' });
    this.screenRoot = el('div', { class: 'lp-screen-root', id: 'lp-screen' });
    root.append(this.screenRoot, this.livePolite, this.liveAssert);
    document.addEventListener('keydown', (e) => this._onKey(e));
  }

  announce(msg, assertive = false) {
    const region = assertive ? this.liveAssert : this.livePolite;
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = msg; });
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
    this.applySettingsClasses();
    this.h.onSettingsChanged && this.h.onSettingsChanged(this.settings);
  }

  // -------------------------------------------------------------------------
  _setScreen(name, node) {
    this.screen = name;
    this.screenRoot.innerHTML = '';
    this.screenRoot.append(node);
    const focusable = node.querySelector('[data-autofocus]') || node.querySelector('button');
    if (focusable) focusable.focus();
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
    if (this.overlay) {
      if (e.key === 'Escape') { e.preventDefault(); this.closeOverlay(); }
      return;
    }
    const cmd = (c) => { e.preventDefault(); this.command(c); };
    switch (e.key) {
      case 'p': case 'P': cmd(null); this.showPause(); break;
      case 'u': case 'U': cmd({ type: 'undo' }); break;
      case 'h': case 'H': cmd({ type: 'hint' }); break;
      case 'r': case 'R': e.preventDefault(); this.h.onCameraReset && this.h.onCameraReset(); this.announce('Camera reset.'); break;
      case 'Backspace': {
        const sel = this.session.state.selected;
        if (sel.length) cmd({ type: 'deselect', index: sel[sel.length - 1] });
        break;
      }
      case 'Escape': cmd({ type: 'clear' }); break;
      case 'Enter': {
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
        'already-selected': 'That biscuit is already in your hand.',
        'not-selected': 'That biscuit is not selected.',
        'empty-selection': 'Pick some letters first.',
        'too-short': 'Words need at least 3 letters.',
        'already-found': 'You already found that word.',
        'not-allowed': 'That tool is not available in this stage.',
        'undo-unavailable': 'Undo is not allowed here.',
        'nothing-to-undo': 'Nothing to undo.',
        'no-hints': 'No hints left.',
        'paused': 'Round is paused.',
        'terminal': 'The round is over.',
      };
      this.announce(messages[res.reason] || 'That action is not available.', true);
    }
  }

  // -------------------------------------------------------------------------
  // Screens

  showTitle(data) {
    const { progression, dailyDate, hasSnapshot } = data;
    const done = progression.completedStages.length;
    const node = el('main', { class: 'lp-title lp-panel', role: 'main' },
      el('h1', { class: 'lp-logo', text: 'Letter Pantry' }),
      el('p', { class: 'lp-tagline', text: 'Spell every word hiding in the biscuit tray.' }),
      el('nav', { class: 'lp-title-nav', 'aria-label': 'Main menu' },
        el('button', { class: 'lp-btn lp-btn-primary lp-btn-big', 'data-autofocus': '', onclick: () => this.showModeSelect() }, 'Play'),
        hasSnapshot ? el('button', { class: 'lp-btn', onclick: () => this.h.onResume() }, 'Resume saved round') : null,
        el('button', { class: 'lp-btn', onclick: () => this.h.onPlayDaily() }, `Daily Pantry — ${dailyDate}`),
        el('button', { class: 'lp-btn', onclick: () => this.showJourney() }, `Journey (${done}/${JOURNEY.length})`),
        el('button', { class: 'lp-btn', onclick: () => this.showHelp() }, 'How to play'),
        el('button', { class: 'lp-btn', onclick: () => this.showSettings() }, 'Settings'),
      ),
      this.playerStatus ? el('p', { class: 'lp-player-status', id: 'lp-player-status', text: this.playerStatus }) : null,
      el('p', { class: 'lp-version', text: `Content ${CONTENT_VERSION}` }),
    );
    this._setScreen('title', node);
  }

  showModeSelect() {
    const modeCard = (title, desc, meta, onGo, primary) => el('article', { class: 'lp-mode-card' },
      el('h3', { text: title }),
      el('p', { text: desc }),
      el('p', { class: 'lp-mode-meta', text: meta }),
      el('button', { class: 'lp-btn' + (primary ? ' lp-btn-primary' : ''), onclick: onGo }, 'Start'),
    );
    const node = el('main', { class: 'lp-panel lp-modes', role: 'main' },
      el('h2', { text: 'Choose a mode' }),
      el('div', { class: 'lp-mode-grid' },
        modeCard('Journey', 'Authored stages that teach and test you, one mechanic at a time.', '42 stages · solo · unranked', () => this.showJourney(), true),
        modeCard('Daily Pantry', 'One shared puzzle per UTC day. Same tray for everyone.', '1 round · ranked · ~3 min', () => this.h.onPlayDaily()),
        modeCard('Practice', 'Relaxed round at your chosen difficulty. Undo allowed.', 'unranked · restartable', () => this.showPractice()),
        modeCard('Challenge', 'Constrained rounds: move limits, speed targets, restricted tools.', '4 trials · unranked', () => this.showChallenges()),
        modeCard('Learn', 'Interactive lessons. Each step asks you to perform the action yourself.', '3 lessons · unranked', () => this.showLearn()),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.h.onLeaveRound('to-title') }, 'Back'),
    );
    this._setScreen('modes', node);
  }

  showJourney() {
    const prog = this.h.getProgression();
    const list = el('ol', { class: 'lp-stage-list', 'aria-label': 'Journey stages' });
    JOURNEY.forEach((stage, i) => {
      const unlocked = i === 0 || prog.completedStages.includes(JOURNEY[i - 1].id);
      const doneStage = prog.completedStages.includes(stage.id);
      const li = el('li', {},
        el('button', {
          class: 'lp-stage' + (doneStage ? ' lp-stage-done' : ''),
          disabled: unlocked ? null : '',
          'aria-label': `Stage ${i + 1}: ${stage.base}, ${stage.tier}${doneStage ? ', completed' : ''}${unlocked ? '' : ', locked'}`,
          onclick: () => unlocked && this.h.onPlayJourney(i),
        }, `${i + 1}. ${stage.base.toUpperCase()} ${doneStage ? '✓' : ''} `, el('span', { class: 'lp-stage-tier', text: stage.tier })),
      );
      list.append(li);
    });
    const node = el('main', { class: 'lp-panel', role: 'main' },
      el('h2', { text: 'Journey' }),
      el('p', { text: `${prog.completedStages.length} of ${JOURNEY.length} stages complete.` }),
      el('div', { class: 'lp-stage-scroll' }, list),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect() }, 'Back'),
    );
    this._setScreen('journey', node);
  }

  showPractice() {
    const node = el('main', { class: 'lp-panel', role: 'main' },
      el('h2', { text: 'Practice' }),
      el('p', { text: 'Pick a difficulty. Practice never affects ranked boards.' }),
      el('div', { class: 'lp-row' },
        PRACTICE_DIFFICULTIES.map((d) =>
          el('button', { class: 'lp-btn lp-btn-big', onclick: () => this.h.onPlayPractice(d) }, d[0].toUpperCase() + d.slice(1))),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect() }, 'Back'),
    );
    this._setScreen('practice', node);
  }

  showChallenges() {
    const node = el('main', { class: 'lp-panel', role: 'main' },
      el('h2', { text: 'Challenges' }),
      el('ul', { class: 'lp-challenge-list' },
        CHALLENGES.map((c) => el('li', {},
          el('button', { class: 'lp-btn lp-challenge', onclick: () => this.h.onPlayChallenge(c.id) },
            el('strong', { text: c.base.toUpperCase() }), ` — ${c.challenge}`)))),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect() }, 'Back'),
    );
    this._setScreen('challenges', node);
  }

  showLearn() {
    const tut = this.h.getTutorial();
    const node = el('main', { class: 'lp-panel', role: 'main' },
      el('h2', { text: 'Learn' }),
      el('ul', { class: 'lp-challenge-list' },
        LESSONS.map((l) => el('li', {},
          el('button', { class: 'lp-btn lp-challenge', onclick: () => this.h.onPlayLesson(l.id) },
            `${l.title}${tut.completedLessons.includes(l.id) ? ' ✓' : ''}`)))),
      el('button', { class: 'lp-btn lp-back', onclick: () => this.showModeSelect() }, 'Back'),
    );
    this._setScreen('learn', node);
  }

  // -------------------------------------------------------------------------
  // Play HUD

  showPlay(session, meta) {
    this.session = session;
    this.meta = meta; // {modeLabel, lesson?}
    const s = session.snapshot();

    const objective = el('section', { class: 'lp-rail lp-rail-left', 'aria-label': 'Objective and word slots' },
      el('h2', { class: 'lp-hud-heading', text: meta.modeLabel }),
      el('p', { class: 'lp-objective', id: 'lp-objective' }),
      el('div', { class: 'lp-slots', id: 'lp-slots', role: 'list', 'aria-label': 'Target words' }),
      el('p', { class: 'lp-bonus-count', id: 'lp-bonus' }),
      meta.lesson ? el('div', { class: 'lp-lesson-box', id: 'lp-lesson-box' },
        el('h3', { text: meta.lesson.title }),
        el('p', { id: 'lp-lesson-text' })) : null,
    );

    const actions = el('section', { class: 'lp-rail lp-rail-right', 'aria-label': 'Actions and status' },
      el('div', { class: 'lp-status' },
        el('p', { class: 'lp-score' }, 'Score: ', el('strong', { id: 'lp-score', text: '0' })),
        el('p', { class: 'lp-moves', id: 'lp-moves' }),
        el('p', { class: 'lp-time', id: 'lp-time' }),
        this.playerStatus ? el('p', { class: 'lp-player-status', id: 'lp-sync-status', text: this.playerStatus }) : null,
      ),
      el('div', { class: 'lp-actions', role: 'group', 'aria-label': 'Round actions' },
        this._actionBtn('Submit', 'submit', () => this.command({ type: 'submit' }), 'lp-btn-primary'),
        this._actionBtn('Clear', 'clear', () => this.command({ type: 'clear' })),
        this._actionBtn('Shuffle', 'shuffle', () => this.command({ type: 'shuffle' })),
        this._actionBtn('Undo', 'undo', () => this.command({ type: 'undo' })),
        this._actionBtn('Hint', 'hint', () => this.command({ type: 'hint' })),
        el('button', { class: 'lp-btn', onclick: () => this.showPause() }, 'Pause (P)'),
      ),
    );

    const tray = el('section', { class: 'lp-tray', 'aria-label': 'Letter tray' },
      el('div', { class: 'lp-current', id: 'lp-current', 'aria-label': 'Current word' }),
      el('div', { class: 'lp-letters', id: 'lp-letters', role: 'group', 'aria-label': 'Letters' }),
    );

    const boardModel = el('div', { class: 'lp-sr-only', id: 'lp-board-model', 'aria-label': 'Board state summary' });

    const node = el('main', { class: 'lp-play', role: 'main' },
      objective, tray, actions, boardModel);

    this._setScreen('play', node);
    this._buildLetterButtons(s);
    this.updatePlay(s, session.actions());
    this._startTimer();
    this.announce(`${meta.modeLabel}. Find ${s.targets.length} words. Letters: ${s.letters.join(', ')}.`);
    if (meta.lesson) this._updateLesson();
  }

  _actionBtn(label, id, onclick, extra = '') {
    return el('button', { class: `lp-btn ${extra}`, id: `lp-act-${id}`, onclick }, label);
  }

  _buildLetterButtons(snapshot) {
    const wrap = document.getElementById('lp-letters');
    wrap.innerHTML = '';
    snapshot.letters.forEach((letter, i) => {
      const btn = el('button', {
        class: 'lp-letter', 'data-index': i, 'aria-pressed': 'false',
        'aria-label': `Letter ${letter.toUpperCase()}`,
        onclick: () => this._toggleLetter(i),
      }, letter.toUpperCase());
      // Arrow-key navigation among letters.
      btn.addEventListener('keydown', (e) => {
        const letters = [...wrap.querySelectorAll('.lp-letter')];
        const idx = letters.indexOf(btn);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); letters[(idx + 1) % letters.length].focus(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); letters[(idx - 1 + letters.length) % letters.length].focus(); }
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
        if (btn.textContent.toLowerCase() !== snapshot.letters[i]) btn.textContent = snapshot.letters[i].toUpperCase();
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
          'aria-label': found ? `Found: ${t}` : `Unfound word, ${t.length} letters`,
        }, label);
        slots.append(li);
      }
    }
    const bonus = document.getElementById('lp-bonus');
    if (bonus) bonus.textContent = `Bonus words found: ${snapshot.foundBonus.length}`;

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
      model.textContent = `Tray letters: ${snapshot.letters.map((l) => l.toUpperCase()).join(' ')}. ` +
        `Selected: ${word || 'none'}. Found ${snapshot.foundTargets.length} of ${snapshot.targets.length} target words. ` +
        `Score ${snapshot.score.total}.`;
    }
    if (this.meta && this.meta.lesson) this._updateLesson();
  }

  _tickHud(snapshot) {
    if (!this.session) return;
    const snap = snapshot || this.session.snapshot();
    const timeEl = document.getElementById('lp-time');
    if (timeEl) timeEl.textContent = `Time: ${fmtTime(this.session.elapsedMs())} (par ${fmtTime(snap.par.timeMs)})`;
    const movesEl = document.getElementById('lp-moves');
    if (movesEl) {
      movesEl.textContent = snap.mechanics.moveLimit != null
        ? `Moves: ${snap.movesUsed}/${snap.mechanics.moveLimit}`
        : `Moves: ${snap.movesUsed}`;
    }
    const obj = document.getElementById('lp-objective');
    if (obj) obj.textContent = `Find all ${snap.targets.length} target words (${snap.foundTargets.length} found).`;
  }

  _updateLesson() {
    const lesson = this.meta.lesson;
    const tracker = this.meta.lessonTracker;
    const text = document.getElementById('lp-lesson-text');
    if (!text || !tracker) return;
    if (tracker.done) {
      text.textContent = 'Lesson complete! Finish the round or leave when ready.';
    } else {
      const step = lesson.steps[tracker.stepIndex];
      text.textContent = `Step ${tracker.stepIndex + 1}/${lesson.steps.length}: ${step.text}`;
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
    if (focusable) focusable.focus();
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
      el('h2', { text: 'Paused' }),
      el('button', { class: 'lp-btn lp-btn-primary lp-btn-big', 'data-autofocus': '', onclick: () => { this.closeOverlay(); this.session.resume('user'); } }, 'Resume'),
      el('div', { class: 'lp-pause-grid' },
        el('button', { class: 'lp-btn', onclick: () => this.showSettings(true) }, 'Audio & graphics'),
        el('button', { class: 'lp-btn', onclick: () => this.showSettings(true) }, 'Accessibility'),
        el('button', { class: 'lp-btn', onclick: () => this.showHelp(true) }, 'Help'),
        el('button', { class: 'lp-btn lp-btn-danger', onclick: () => { this.closeOverlay(); this.h.onLeaveRound('pause'); } }, 'Leave round'),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => { this.closeOverlay(); this.session.resume('user'); } }, 'Back to game'),
    );
    this._openOverlay('pause', node);
    this.announce('Paused.');
  }

  showResults(result) {
    this._stopTimer();
    const { outcome, score, progressionText, newAchievements, sessionMeta, allowNext } = result;
    const headline = outcome === 'completed' ? 'Pantry stocked!' : outcome === 'out-of-moves' ? 'Out of moves' : 'Round resigned';
    const rows = [
      ['Target words', score.target], ['Bonus words', score.bonus], ['Length bonus', score.length],
      ['Streak bonus', score.streak], ['Invalid penalty', score.penalty], ['Time bonus', score.time],
    ];
    const node = el('main', { class: 'lp-panel lp-results', role: 'main' },
      el('h2', { text: headline, 'data-autofocus': '', tabindex: '-1' }),
      outcome === 'completed' ? el('img', {
        class: 'lp-results-art', src: './assets/results-tray.webp', alt: '',
        role: 'presentation', decoding: 'async', loading: 'lazy',
        onerror: (e) => { e.target.remove(); },
      }) : null,
      el('table', { class: 'lp-score-table' },
        el('caption', { text: 'Score breakdown' }),
        el('tbody', {},
          rows.map(([label, v]) => el('tr', {}, el('th', { scope: 'row', text: label }), el('td', { text: String(v) }))),
          el('tr', { class: 'lp-total' }, el('th', { scope: 'row', text: 'Total' }), el('td', { text: String(score.total) })))),
      progressionText ? el('p', { class: 'lp-progress-note', text: progressionText }) : null,
      newAchievements && newAchievements.length
        ? el('div', { class: 'lp-achievements' },
            el('h3', { text: 'Achievements unlocked' }),
            el('ul', {}, newAchievements.map((a) => el('li', {}, `🏆 ${a.name} — ${a.desc}`))))
        : null,
      result.comparison ? el('p', { class: 'lp-progress-note', text: result.comparison }) : null,
      el('div', { class: 'lp-row' },
        el('button', { class: 'lp-btn lp-btn-primary', onclick: () => this.h.onRetry() }, 'Retry'),
        allowNext ? el('button', { class: 'lp-btn', onclick: () => this.h.onNext() }, 'Next stage') : null,
        el('button', { class: 'lp-btn', onclick: () => this.h.onLeaveRound('results') }, 'Back to title'),
      ),
    );
    this._setScreen('results', node);
    this.announce(`${headline}. Total score ${score.total}.`, true);
  }

  showHelp(inOverlay = false) {
    const card = (title, text) => el('article', { class: 'lp-help-card' }, el('h3', { text: title }), el('p', { text }));
    const node = el('div', { class: 'lp-panel lp-help' },
      el('h2', { text: 'How to play' }),
      el('div', { class: 'lp-help-grid' },
        card('Goal', 'Rearrange the letter biscuits to find every target word. Bonus words score extra.'),
        card('Select', 'Tap or focus a letter and press Enter to pick it. Letters form a word in pick order.'),
        card('Submit', 'With 3+ letters picked, press Submit. Invalid words cost 25 points and break your streak.'),
        card('Tools', 'Shuffle mixes the tray. Undo takes back an action where allowed. Hint reveals a letter of an unfound word.'),
        card('Keyboard', 'Arrows move between letters · Enter picks · Backspace unpicks · P pause · U undo · H hint · R camera reset.'),
        card('Scoring', 'Target word 100 + 25 per letter past 3. Bonus word 50 + 10 per letter past 3. Streaks add 15 each. Beat par time for a bonus.'),
      ),
      el('button', { class: 'lp-btn lp-back', onclick: () => inOverlay ? this.showPause() : this.h.onLeaveRound('to-title') }, 'Back'),
    );
    if (inOverlay) this._openOverlay('help', node);
    else this._setScreen('help', node);
  }

  showSettings(inOverlay = false) {
    const s = this.settings;
    const slider = (label, key) => el('label', { class: 'lp-setting' },
      el('span', { text: label }),
      el('input', {
        type: 'range', min: '0', max: '1', step: '0.05', value: String(s[key]),
        'aria-label': label,
        oninput: (e) => this.updateSetting(key, Number(e.target.value)),
      }));
    const toggle = (label, key) => el('label', { class: 'lp-setting' },
      el('span', { text: label }),
      el('input', {
        type: 'checkbox', 'aria-label': label,
        onchange: (e) => this.updateSetting(key, e.target.checked),
        ...(s[key] ? { checked: '' } : {}),
      }));
    const node = el('div', { class: 'lp-panel lp-settings' },
      el('h2', { text: 'Settings' }),
      el('fieldset', {}, el('legend', { text: 'Audio' }),
        slider('Music volume', 'music'), slider('Effects volume', 'effects'), slider('Ambience volume', 'ambience')),
      this._graphicsSection(toggle),
      el('fieldset', {}, el('legend', { text: 'Accessibility' }),
        toggle('Larger text', 'largerText'), toggle('Color-vision-safe palette', 'cvdPalette'),
        toggle('Left-handed controls', 'leftHanded'), toggle('Haptics off', 'hapticsOff'),
        toggle('Replay tutorial prompts', 'tutorialReplay')),
      el('fieldset', {}, el('legend', { text: 'Themes' }),
        el('div', { class: 'lp-row' }, THEMES.map((t) =>
          el('button', { class: 'lp-btn', onclick: () => { this.h.onThemeChange && this.h.onThemeChange(t.id); this.announce(`Theme: ${t.name}`); } }, t.name)))),
      el('button', { class: 'lp-btn lp-back', onclick: () => inOverlay ? this.showPause() : this.h.onLeaveRound('to-title') }, 'Back'),
    );
    if (inOverlay) this._openOverlay('settings', node);
    else this._setScreen('settings', node);
  }

  // Graphics section: quality preset, render scale, per-effect overrides,
  // adaptive resolution, frame-rate readout and a GPU/cost summary. Strings
  // come from gfx-i18n.js in the browser's locale.
  _graphicsSection(toggle) {
    const L = pickLocale(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    const t = (k, v) => gfxT(L, k, v);
    const tier = (x) => t('t_' + x);
    const info = () => (this.h.getGraphicsInfo ? this.h.getGraphicsInfo() : null);
    const detected = (info() || {}).detected || 'balanced';
    const saved = () => Object.assign({}, this.settings.gfx || {});
    const chosen = () => (PRESETS.includes((this.settings.gfx || {}).preset) ? this.settings.gfx.preset : 'auto');
    const effective = () => (chosen() === 'auto' ? detected : chosen());
    const save = (g) => { this.updateSetting('gfx', g); refresh(); setTimeout(updateSummary, 120); };
    const row = (label, control, extra) => el('label', { class: 'lp-setting' }, el('span', { text: label }), extra || null, control);

    const presetSel = el('select', {
      id: 'gfx-preset', 'data-gfx': 'preset', 'aria-label': t('quality'),
      onchange: (e) => save(choosePreset(saved(), e.target.value)),
    }, el('option', { value: 'auto', text: t('auto', { tier: tier(detected) }) }),
    PRESETS.map((p) => el('option', { value: p, text: tier(p) })));

    const scaleOut = el('output', { id: 'gfx-scale-value', class: 'lp-gfx-value', for: 'gfx-scale' });
    const scale = el('input', {
      type: 'range', id: 'gfx-scale', 'data-gfx': 'render_scale', min: '50', max: '200', step: '5',
      'aria-label': t('renderScale'),
      oninput: (e) => { const g = saved(); g.render_scale = Number(e.target.value) / 100; save(g); },
    });
    const cats = {};
    const catRows = Object.entries(CATEGORIES).map(([cat, tiers]) => {
      cats[cat] = el('select', {
        id: 'gfx-cat-' + cat, 'data-gfx-cat': cat, 'aria-label': t('cat_' + cat),
        onchange: (e) => {
          const g = saved();
          if (e.target.value === 'preset') delete g[cat]; else g[cat] = e.target.value;
          save(g);
        },
      }, el('option', { value: 'preset' }), tiers.map((x) => el('option', { value: x, text: tier(x) })));
      return row(t('cat_' + cat), cats[cat]);
    });
    const check = (id, key, label) => {
      const box = el('input', {
        type: 'checkbox', id, 'data-gfx': key, 'aria-label': label,
        onchange: (e) => { const g = saved(); g[key] = e.target.checked; save(g); },
      });
      return box;
    };
    const adaptive = check('gfx-adaptive', 'adaptive', t('adaptive'));
    const fps = check('gfx-fps', 'show_fps', t('showFps'));
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
      const text = i ? `${i.gpu || t('gpuUnknown')} · ${i.summary}` : t('noWebgl');
      if (summary.textContent !== text) summary.textContent = text;
      note.textContent = t('postUnavailable');
      note.hidden = !(i && i.postFailed);
    };
    refresh();
    updateSummary();
    const timer = setInterval(() => { if (!summary.isConnected) clearInterval(timer); else updateSummary(); }, 1000);

    return el('fieldset', { class: 'lp-gfx', 'data-gfx-section': '' }, el('legend', { text: t('graphics') }),
      row(t('quality'), presetSel),
      el('label', { class: 'lp-setting lp-gfx-scale' }, el('span', { text: t('renderScale') }),
        el('span', { class: 'lp-gfx-range' }, scale, scaleOut)),
      catRows,
      row(t('adaptive'), adaptive),
      row(t('showFps'), fps),
      toggle('Reduced motion', 'reducedMotion'), toggle('High contrast', 'highContrast'),
      summary, note);
  }

  showPreparing(label, countdownSeconds = 3) {
    const node = el('main', { class: 'lp-panel lp-preparing', role: 'main' },
      el('h2', { text: label }),
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
      el('h2', { text: 'Something went wrong' }),
      el('p', { text: message }),
      el('button', { class: 'lp-btn lp-btn-primary', onclick: recover }, 'Continue'),
    );
    this._setScreen('error', node);
  }

  showCompatNotice(reason) {
    const note = el('div', { class: 'lp-compat', role: 'note' },
      '3D view unavailable (' + reason + '). The game below is fully playable.');
    this.root.prepend(note);
  }
}
