// Letter Pantry on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules (rules.js), the content and its
// English dictionary (content.js, words.js) and the session with its command
// ids, replay envelope and resumable snapshot (session.js) are the browser
// build's, unchanged; this module is what its bootstrap.js and ui.js did
// around them: the state machine (title → mode select → Journey / Practice /
// Challenges / Learn lists → preparing (3-2-1) → active ⇄ paused → resolving
// → results, with Help and Settings as screens and as overlays over the
// pause menu), command dispatch and the refusal sentences, the Learn lesson
// gates, progression, achievements, the Daily's personal best and board
// line, posting a finished round's total to the high-score board, and input:
// the round's keys and pad buttons, the letter biscuits' buttons, and typed
// letters (the runtime's text field on the play screen: each typed letter
// picks the first free biscuit showing it).
//
// Time is the runtime's fixed steps (60 a second): the session's clock
// (session.js setClock), the countdown and the results delay count steps,
// so a hidden window never counts and play scripts replay exactly.
import "./i18n.ts";
import { clipboard, frame, onFixedUpdate, onPreferencesChange, onQuit, onRender, onResume, onStart, onSuspend, onUpdate, preferences, setFixedRate } from "starhermit:engine";
import { bindings, isKeyDown, onAction, onKey, onPointerButton, onTouch, primaryPointer, vibrate } from "starhermit:input";
import * as ui from "starhermit:ui";
import { onSessionEnded, requestSignIn } from "starhermit:platform";
import * as audio from "./audio.ts";
import { Content, Sess, SessionClass, type Cmd, type Descriptor, type GameEvent, type Meta, type Session, type Snapshot, type Achievement, type Lesson } from "./game.ts";
import { account, N, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import * as render from "./render.ts";
import { drawScreens, LETTER_ID } from "./screens.ts";
import { applyPalette, initStyles } from "./style.ts";

export type Screen = "title" | "modes" | "journey" | "practice" | "challenges" | "learn" | "help" | "settings" | "preparing" | "play" | "results";
export type Overlay = null | "pause" | "settings" | "help";
export interface Results {
  outcome: string; score: Snapshot["score"]; progressionText: [string, Record<string, string | number>?][];
  newAchievements: Achievement[]; comparison: [string, Record<string, string | number>?][]; allowNext: boolean;
}

export const app = {
  screen: "title" as Screen,
  /** The round's state: active ⇄ paused, resolving between the last word and the results. */
  state: "title" as "title" | "preparing" | "active" | "paused" | "resolving" | "results",
  overlay: null as Overlay,
  /** Frame the screen or overlay opened on (the press that opened it must not also act on it). */
  openedFrame: 0,
  focusNext: null as string | null,
  session: null as Session | null,
  meta: null as Meta | null,
  lesson: null as { stepIndex: number; done: boolean } | null,
  countdown: { n: 0, steps: 0, total: 0 },
  resolveSteps: 0,
  results: null as Results | null,
  lb: null as null | "posting" | { posted: boolean; rank: number | null },
  toast: null as { text: () => string; until: number } | null,
  /** The settings' theme pick (render.js setTheme; until the next round starts). */
  themeOverride: null as string | null,
};
export const settings = platform.settings;
export const progress = (): platform.Progress => platform.progress();
const now = (): number => frame().time;

// ------------------------------------------------------------------ helpers
export function announce(text: string, assertive = false): void {
  if (text) ui.announce(text.slice(0, 500), { politeness: assertive ? "assertive" : "polite" });
}
/** ui.js toast(): 3.2 s over any screen. */
export function toast(text: () => string): void {
  app.toast = { text, until: now() + 3.2 };
  announce(text());
}
/** Menu and chrome buttons' click (letters and the round actions make their own sounds). */
export function click(): void { audio.play("uiClick"); }
function haptic(ms: number): void { if (!settings.hapticsOff) { try { vibrate(ms); } catch { /* unsupported */ } } }
const KEY_GLYPHS: Record<string, string> = { "Arrow Left": "←", "Arrow Right": "→", "Arrow Up": "↑", "Arrow Down": "↓", Escape: "Esc" };
/** ui.js keyLabel/_keys: an action's effective keys, e.g. "→/↓". */
export function keysFor(action: string, sep = "/"): string {
  const names = bindings(action).filter((b) => b.device === "keyboard").map((b) => KEY_GLYPHS[b.label] ?? b.label);
  return [...new Set(names)].join(sep) || "—";
}
/** Phone-sized or touch-first: no keyboard focus on the letters field (it would bring up the device keyboard). */
export function touchFirst(): boolean {
  const pp = primaryPointer();
  if (pp !== "none") return pp === "coarse";
  const f = frame(), sc = ui.preferences().scale;
  const w = f.width / sc, h = f.height / sc;
  return (w <= 760 && h >= w) || (w > h && h <= 500);
}
export function dailyDate(): string { return Content.todayISO(platform.nowMs()); }
export function hasSnapshot(): boolean { return !!Sess.loadJSON("last-snapshot"); }
/** ui.js modeLabel: a round's title in the current language. */
export function modeLabel(meta: Meta | null): string {
  if (!meta) return "";
  if (!meta.modeKey) return meta.modeLabel || "";
  const [key, vars = {}] = meta.modeKey;
  const v: Record<string, string | number> = { ...vars };
  for (const k of ["tier", "challenge", "lesson", "difficulty"]) if (v[k] != null) v[k] = T(String(v[k]));
  return T(key, v);
}

// ------------------------------------------------------------------ screens
export function show(screen: Screen, focus: string | null = null): void {
  app.screen = screen;
  app.overlay = null;
  app.openedFrame = frame().frame;
  app.focusNext = focus;
  ui.setFocus(null);
}
export function showTitle(): void {
  app.state = "title";
  render.show(null);
  render.setTheme(app.themeOverride ?? "classic");
  show("title", "btn-play");
}
export function openScreen(screen: Screen): void {
  click();
  const first: Partial<Record<Screen, string>> = { modes: "mode-journey", journey: "stage-1", practice: "practice-easy", challenges: "challenge-ration", learn: "lesson-select", help: "btn-back", settings: "set-cvdPalette" };
  show(screen, first[screen] ?? "btn-back");
}
export function openOverlay(o: Overlay): void {
  click();
  app.overlay = o;
  app.openedFrame = frame().frame;
  app.focusNext = o === "pause" ? "btn-resume" : "btn-back";
  ui.setFocus(null);
}

// ------------------------------------------------------------------ round lifecycle
function prepareRound(descriptor: Descriptor, meta: Meta): void {
  click();
  disposeSession();
  app.meta = meta;
  app.state = "preparing";
  app.countdown = { n: 0, steps: 0, total: 0 };
  render.setTheme(descriptor.theme);
  render.show({ letters: descriptor.letters.split(""), selected: [] });
  show("preparing", null);
}
function disposeSession(): void {
  if (app.session) app.session.dispose();
  app.session = null;
  app.lesson = null;
}
/** bootstrap.js startRound: a new session on the descriptor, wired to the HUD, sound, sparks and lessons. */
function startRound(descriptor: Descriptor, meta: Meta): void {
  disposeSession();
  const session = new Sess.Session(descriptor, { meta, autoPause: false });
  app.session = session;
  app.meta = meta;
  app.lesson = meta.lesson ? { stepIndex: 0, done: false } : null;
  wire(session);
  app.themeOverride = null;
  render.setTheme(descriptor.theme);
  render.show(session.snapshot());
  audio.play("roundStart");
  session.resume("round-start");
  enterPlay();
  const s = session.snapshot();
  announce(T("{mode}. Find {n} words. Letters: {letters}.", { mode: modeLabel(meta), n: s.targets.length, letters: s.letters.join(", ") }));
}
function wire(session: Session): void {
  session.onEvent((kind, data) => {
    if (kind !== "command") return;
    const { command, events, state } = data;
    render.show(state);
    render.onEvents(events);
    handleAudioEvents(events);
    handleLessonProgress(command);
    if (state.status === "terminal" && app.state === "active") {
      app.state = "resolving";
      app.resolveSteps = 54; // 900 ms
    }
  });
}
function enterPlay(): void {
  app.state = "active";
  show("play", TYPING);
}
function handleAudioEvents(events: GameEvent[]): void {
  for (const ev of events) {
    switch (ev.type) {
      case "select": audio.play("select"); haptic(10); break;
      case "deselect": audio.play("deselect"); break;
      case "clear": audio.play("clear"); break;
      case "shuffle": audio.play("shuffle"); announce(T("Tray shuffled.")); break;
      case "hint": audio.play("hint"); announce(T("Hint revealed.")); break;
      case "undo": audio.play("undo"); break;
      case "word-invalid": audio.play("submitInvalid"); haptic(30); announce(T("Not a valid word.")); break;
      case "word-bonus": audio.play("wordBonus"); haptic(20); announce(T("Bonus word found.")); break;
      case "word-target": audio.play("wordComplete"); haptic(20); announce(T("Target word found.")); break;
      case "terminal":
        if (ev.reason === "completed") { audio.play("roundComplete"); announce(T("Round complete.")); }
        else { audio.play("roundFailed"); announce(T("Round over.")); }
        haptic(60);
        break;
      default: break;
    }
  }
  const s = app.session?.state;
  if (s && s.targets.length) audio.setIntensity((s.foundTargets.length + s.foundBonus.length * 0.5) / s.targets.length);
}
function handleLessonProgress(command: Cmd): void {
  const tracker = app.lesson;
  const lesson = app.meta?.lesson;
  if (!tracker || tracker.done || !lesson) return;
  const step = lesson.steps[tracker.stepIndex];
  if (step && command.type === step.require.type) {
    tracker.stepIndex++;
    if (tracker.stepIndex >= lesson.steps.length) {
      tracker.done = true;
      const p = progress();
      if (!p.tutorial.completedLessons.includes(lesson.id)) {
        p.tutorial.completedLessons.push(lesson.id);
        platform.persist();
      }
      announce(T("Lesson complete!"), true);
    } else announce(T("Good! Next step."));
  }
}
/** The lesson box: false when there is none (or prompts are off for a lesson already done). */
export function lessonBox(): { title: string; text: string } | null {
  const lesson = app.meta?.lesson;
  const tracker = app.lesson;
  if (!lesson || !tracker) return null;
  if (!settings.tutorialReplay && progress().tutorial.completedLessons.includes(lesson.id) && tracker.stepIndex === 0) return null;
  if (tracker.done) return { title: T(lesson.title), text: T("Lesson complete! Finish the round or leave when ready.") };
  const step = lesson.steps[tracker.stepIndex]!;
  return { title: T(lesson.title), text: T("Step {n}/{count}: {text}", { n: tracker.stepIndex + 1, count: lesson.steps.length, text: T(step.text) }) };
}

function checkAchievements(outcome: string, descriptor: Descriptor): Achievement[] {
  const p = progress();
  const newly: Achievement[] = [];
  const unlock = (id: string): void => {
    if (p.achievements.unlocked.includes(id)) return;
    p.achievements.unlocked.push(id);
    const def = Content.ACHIEVEMENTS.find((a) => a.id === id);
    if (def) newly.push(def);
  };
  if (outcome === "completed") unlock("first_completion");
  if (p.tutorial.completedLessons.length >= Content.LESSONS.length) unlock("mechanic_mastery");
  if (p.stats.completionStreak >= 3) unlock("streak_3");
  if (outcome === "completed" && descriptor.tier === "hard" && descriptor.id.startsWith("journey")) unlock("hard_milestone");
  if (p.stats.targetWordsFound >= 100) unlock("long_term_pantry");
  return newly;
}

/** bootstrap.js showResults: progression, achievements, the Daily's best and board line, the score post. */
function showResults(): void {
  const session = app.session;
  const meta = app.meta;
  if (!session || !meta) return;
  const snap = session.snapshot();
  const outcome = snap.terminalReason ?? "resigned";
  const descriptor = meta.descriptor;
  const p = progress();
  const progressionText: Results["progressionText"] = [];
  if (outcome === "completed") {
    p.stats.roundsCompleted++;
    p.stats.completionStreak++;
    p.stats.targetWordsFound += snap.foundTargets.length;
    if (meta.mode === "journey" && !p.progression.completedStages.includes(descriptor.id)) {
      p.progression.completedStages.push(descriptor.id);
      progressionText.push([N("Journey progress: {done}/{total} stages."), { done: p.progression.completedStages.length, total: Content.JOURNEY.length }]);
    }
    if (descriptor.index != null && descriptor.index + 1 < Content.JOURNEY.length) progressionText.push([N("Next stage unlocked.")]);
  } else p.stats.completionStreak = 0;
  const newAchievements = checkAchievements(outcome, descriptor);
  if (newAchievements.length) achievementAt = frame().time + 0.7;

  let comparison: Results["comparison"] = [];
  let readTop: ((res: Results) => void) | null = null;
  if (meta.mode === "daily") {
    const prev = p.boards.daily[descriptor.seed];
    if (!prev || snap.score.total > prev.score) {
      p.boards.daily[descriptor.seed] = { score: snap.score.total, durationMs: Math.round(snap.elapsedMs), date: Content.todayISO(platform.nowMs()) };
    }
    const best = p.boards.daily[descriptor.seed]!;
    const bestText: [string, Record<string, string | number>] = [N("Your best today: {score}."), { score: best.score }];
    if (platform.signedIn()) {
      comparison = [[N("Leaderboard unavailable — score kept locally.")], bestText];
      readTop = (res) => void platform.readTop().then((top) => {
        if (app.results !== res) return;
        res.comparison = top
          ? [[N("High-score board: top {name} {score} ({n} shown)."), { name: top.name, score: top.score, n: top.shown }], bestText]
          : [[N("Global board unavailable — score kept locally.")], bestText];
      });
    } else comparison = [[N("Score kept on this device.")], bestText];
  }
  platform.persist();
  app.results = {
    outcome, score: snap.score, progressionText, newAchievements, comparison,
    allowNext: meta.mode === "journey" && outcome === "completed" && descriptor.index != null && descriptor.index + 1 < Content.JOURNEY.length,
  };
  app.state = "results";
  if (readTop) readTop(app.results);
  postHighScore(snap.score.total, meta.mode);
  const headline = outcome === "completed" ? T("Pantry stocked!") : outcome === "out-of-moves" ? T("Out of moves") : T("Round resigned");
  announce(T("{headline}. Total score {score}.", { headline, score: snap.score.total }), true);
  show("results", "btn-retry");
}
let achievementAt = 0;
/** Signed in, every finished round except Learn lessons posts its total; the results show the rank line. */
function postHighScore(total: number, mode: string): void {
  if (!platform.signedIn() || mode === "learn") { app.lb = null; return; }
  app.lb = "posting";
  const res = app.results;
  void platform.postLeaderboard(total).then((r) => { if (app.results === res) app.lb = r; });
}
export function leaderboardLine(): string | null {
  const lb = app.lb;
  if (!lb) return null;
  const a = account();
  if (lb === "posting") return a.lbPosting;
  return !lb.posted ? a.lbNotPosted : lb.rank ? a.lbRank.replace("{rank}", String(lb.rank)) : a.lbPosted;
}

export function leaveRound(): void {
  click();
  if (app.session) app.session.saveSnapshot();
  disposeSession();
  app.meta = null;
  app.results = null;
  showTitle();
}

// ------------------------------------------------------------------ mode starts (bootstrap.js handlers)
export function playJourney(i: number): void {
  const d = Content.JOURNEY[i]!;
  prepareRound(d, { mode: "journey", modeLabel: `Journey stage ${i + 1} — ${d.tier}`, modeKey: [N("Journey stage {n} — {tier}"), { n: i + 1, tier: d.tier! }], descriptor: d });
}
export function playDaily(): void {
  const date = dailyDate();
  const d = Content.deriveDaily(date);
  prepareRound(d, { mode: "daily", modeLabel: `Daily Pantry — ${date}`, modeKey: [N("Daily Pantry — {date}"), { date }], descriptor: d });
}
export function playPractice(diff: string): void {
  const d = Content.derivePractice(diff, Math.floor(platform.nowMs() / 60000));
  prepareRound(d, { mode: "practice", modeLabel: `Practice — ${diff}`, modeKey: [N("Practice — {difficulty}"), { difficulty: diff }], descriptor: d });
}
export function playChallenge(id: string): void {
  const d = Content.CHALLENGES.find((c) => c.id === id)!;
  prepareRound(d, { mode: "challenge", modeLabel: `Challenge — ${d.challenge}`, modeKey: [N("Challenge — {challenge}"), { challenge: d.challenge! }], descriptor: d });
}
export function playLesson(id: string): void {
  const lesson = Content.LESSONS.find((l) => l.id === id) as Lesson;
  const d: Descriptor = {
    id: lesson.id, seed: "lesson:" + lesson.id, letters: lesson.letters, targets: lesson.targets, bonus: lesson.bonus,
    mechanics: { moveLimit: null, undo: true, shuffle: true, hints: 3 }, par: { timeMs: 600000, moves: 30 }, theme: "classic",
  };
  prepareRound(d, { mode: "learn", modeLabel: `Learn — ${lesson.title}`, modeKey: [N("Learn — {lesson}"), { lesson: lesson.title }], descriptor: d, lesson });
}
export function resumeSaved(): void {
  click();
  const session = SessionClass.restoreSnapshot();
  if (!session) { showTitle(); return; }
  disposeSession();
  app.session = session;
  const stage = Content.JOURNEY.find((d) => d.id === session.descriptor.id);
  app.meta = session.meta || {
    mode: stage ? "journey" : "resumed",
    modeLabel: stage ? `Journey stage ${stage.index! + 1} — ${stage.tier}` : "Resumed round",
    modeKey: stage ? [N("Journey stage {n} — {tier}"), { n: stage.index! + 1, tier: stage.tier! }] : [N("Resumed round")],
    descriptor: session.descriptor, lesson: null,
  };
  session.meta = app.meta;
  app.lesson = app.meta.lesson ? { stepIndex: 0, done: false } : null;
  wire(session);
  render.setTheme(session.descriptor.theme);
  render.show(session.snapshot());
  session.resume("restore");
  enterPlay();
}
export function retry(): void {
  const meta = app.meta;
  if (!meta) return;
  prepareRound(meta.descriptor, { ...meta });
}
export function nextStage(): void {
  const i = (app.meta?.descriptor.index ?? -1) + 1;
  if (i > 0 && i < Content.JOURNEY.length) playJourney(i);
}

// ------------------------------------------------------------------ commands
const REFUSALS: Record<string, string> = {
  "already-selected": N("That biscuit is already in your hand."),
  "not-selected": N("That biscuit is not selected."),
  "empty-selection": N("Pick some letters first."),
  "too-short": N("Words need at least 3 letters."),
  "already-found": N("You already found that word."),
  "not-allowed": N("That tool is not available in this stage."),
  "undo-unavailable": N("Undo is not allowed here."),
  "nothing-to-undo": N("Nothing to undo."),
  "no-hints": N("No hints left."),
  "paused": N("Round is paused."),
  "terminal": N("The round is over."),
};
/** ui.js command(): dispatch, and say why a refused action was refused. */
export function command(cmd: Cmd): void {
  const s = app.session;
  if (!s || app.state !== "active") return;
  const res = s.dispatch(cmd);
  if (!res.ok && res.reason !== "duplicate") announce(T(REFUSALS[res.reason ?? ""] ?? N("That action is not available.")), true);
}
export function toggleLetter(i: number): void {
  const s = app.session;
  if (!s) return;
  command(s.state.selected.includes(i) ? { type: "deselect", index: i } : { type: "select", index: i });
}
export function unpickLast(): void {
  const sel = app.session?.state.selected;
  if (sel && sel.length) command({ type: "deselect", index: sel[sel.length - 1]! });
}
export function can(type: string): boolean { return !!app.session && app.state === "active" && app.session.actions().some((a) => a.type === type); }

// ------------------------------------------------------------------ pause
export function pauseRound(): void {
  if (app.state !== "active" || !app.session) return;
  app.session.pause("user");
  app.state = "paused";
  openOverlay("pause");
  announce(T("Paused."));
}
export function resumeRound(): void {
  if (app.state !== "paused" || !app.session) return;
  click();
  app.session.resume("user");
  app.state = "active";
  app.overlay = null;
  app.openedFrame = frame().frame;
  app.focusNext = TYPING;
}
export function cameraReset(): void { render.resetCamera(); announce(T("Camera reset.")); }

// ------------------------------------------------------------------ the platform
export function copyInvite(): void {
  click();
  const link = platform.inviteLink();
  if (!link) return;
  let ok = false;
  try { clipboard.writeText(link); ok = true; } catch { ok = false; }
  toast(() => (ok ? account().copied : account().copyFailed));
}
export function signIn(): void { click(); void requestSignIn().catch(() => undefined); }
export function pickTheme(id: string): void {
  click();
  app.themeOverride = id;
  render.setTheme(id);
  const t = Content.themeById(id);
  announce(T("Theme: {name}", { name: T(t.name) }));
}

// ------------------------------------------------------------------ input
// Letters reach the tray three ways: the biscuit buttons (click, tap, or focus and Enter), the play
// screen's letters field (the runtime's text field: typed text after the keyboard layout and input
// methods; on keyboard devices it has the focus whenever a round shows, and while it holds the
// keyboard — no game actions then, engine.minor 17+ — Backspace unpicks, Enter submits, Escape clears
// the hand (pauses with an empty hand) and the arrows move to the biscuits), and letter keys while a
// biscuit or nothing has focus. Each typed letter picks the first free biscuit showing it. A bound
// action on a letter key (Undo U, Hint H, Pause P, Camera R) types there and acts elsewhere.
export const TYPE_ID = "type-field";
/** app.focusNext's stand-in for the typing focus, resolved as the screen is built. */
export const TYPING = "@typing";
export function typingFocus(): string | null { return touchFirst() ? null : TYPE_ID; }
export function fieldFocused(): boolean { const f = ui.focused(); return f === TYPE_ID || f === T("Type letters"); }
function letterFocused(): number {
  const f = ui.focused();
  if (!f || !app.session) return -1;
  const n = app.session.state.letters.length;
  for (let i = 0; i < n; i++) if (f === LETTER_ID(i) || f === letterLabel(i)) return i;
  return -1;
}
export function letterLabel(i: number): string {
  const l = app.session?.state.letters[i] ?? "";
  return T("Letter {letter}", { letter: l.toUpperCase() });
}
/** The tray has the keys: the letters field, a biscuit, or nothing is focused. */
function onTray(): boolean { return ui.focused() === null || fieldFocused() || letterFocused() >= 0; }
function focusLetter(i: number): void {
  const n = app.session?.state.letters.length ?? 0;
  if (!n) return;
  ui.setFocus(LETTER_ID(((i % n) + n) % n));
}
export function focusTyping(): void { app.focusNext = TYPING; app.openedFrame = frame().frame; }
/** A typed letter picks the first free biscuit showing it. */
export function typeLetter(ch: string): void {
  const s = app.session;
  if (!s || app.state !== "active" || app.overlay) return;
  const c = ch.toLowerCase();
  const st = s.state;
  const i = st.letters.findIndex((l, k) => l === c && !st.selected.includes(k));
  if (i < 0) { audio.play("submitInvalid"); announce(T("No free {letter} biscuit in the tray.", { letter: c.toUpperCase() }), true); return; }
  command({ type: "select", index: i });
}
/** What the letters field received this frame. */
export function typedInField(text: string): void { for (const ch of text) if (/^[a-zA-Z]$/.test(ch)) typeLetter(ch); }
function escape(): void {
  if (app.session && app.session.state.selected.length) command({ type: "clear" });
  else pauseRound();
}

/** A pointer button or finger lifted this frame or the last (a click or tap activates on its release). */
let pointerUpFrame = -10;
onPointerButton((e) => { if (!e.pressed) pointerUpFrame = frame().frame; });
onTouch((e) => { if (e.phase === "end") pointerUpFrame = frame().frame; });
export function pointerActivation(): boolean { return frame().frame - pointerUpFrame <= 1; }

const LETTER_ACTIONS = ["undo", "hint", "pause", "camera"];
let lastKeyCode = "";
let lastKeyFrame = -1;
const held = (...codes: string[]): boolean => codes.some((c) => isKeyDown(c));
onKey((e) => {
  if (!e.pressed) return;
  lastKeyCode = e.code;
  lastKeyFrame = frame().frame;
  if (app.state !== "active" || app.screen !== "play" || app.overlay) return;
  if (ui.capturingKeys()) {
    if (!fieldFocused()) return;
    switch (e.code) {
      case "Backspace": case "Delete": unpickLast(); break;
      case "Escape": if (!e.repeat) escape(); break;
      case "ArrowRight": case "ArrowDown": focusLetter(0); break;
      case "ArrowLeft": case "ArrowUp": focusLetter(-1); break;
      default: break;
    }
    return;
  }
  if (held("ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "AltLeft", "AltRight")) return;
  const m = /^Key([A-Z])$/.exec(e.code);
  if (m && (onTray() || !boundLetterKey(e.code))) typeLetter(m[1]!);
});
function boundLetterKey(code: string): boolean {
  return LETTER_ACTIONS.some((a) => bindings(a).some((b) => b.device === "keyboard" && b.code === code));
}

onAction((e) => {
  if (!e.pressed) return;
  if (app.screen !== "play" || app.overlay) return;
  if (e.action === "pause" && app.state === "paused") return; // the dialog's Escape / Back closes it
  if (app.state !== "active") return;
  if (held("ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "AltLeft", "AltRight")) return;
  const kb = e.source === "keyboard";
  const letterKey = kb && lastKeyFrame === frame().frame && /^Key[A-Z]$/.test(lastKeyCode);
  if (letterKey && onTray() && LETTER_ACTIONS.includes(e.action)) return; // typed into the tray instead
  const li = letterFocused();
  switch (e.action) {
    case "next": if (li >= 0 || !kb) focusLetter(li + 1); break;
    case "prev": if (li >= 0 || !kb) focusLetter(li < 0 ? -1 : li - 1); break;
    // Enter activates a focused button (a biscuit picks); with nothing focused it submits.
    case "submit": if (!kb || ui.focused() === null) command({ type: "submit" }); break;
    case "unpick": unpickLast(); break;
    case "clear": if (kb) escape(); else command({ type: "clear" }); break;
    case "pause": pauseRound(); break;
    case "undo": command({ type: "undo" }); break;
    case "hint": command({ type: "hint" }); break;
    case "camera": cameraReset(); break;
    default: break;
  }
});

// ------------------------------------------------------------------ lifecycle
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const k = `${f.quality}:${f.levelIndex}`;
  if (k === lookKey) return;
  lookKey = k;
  render.applyLook(lookFor(f.quality, f.levelIndex));
}
let clockMs = 0;
let hidden = false;

onStart(() => {
  setFixedRate(60);
  Sess.setClock(() => clockMs);
  initStyles();
  platform.initPlatform();
  audio.loadSfx();
  render.setReducedMotion(preferences().reducedMotion);
  applyLook();
  showTitle();
});
onPreferencesChange((p) => render.setReducedMotion(p.reducedMotion));
onSessionEnded(() => toast(() => account().signedOut));
// A hidden window pauses the round's clock (session.js's visibilitychange auto-pause) and resumes it on return
// unless the player paused.
onSuspend(() => {
  hidden = true;
  if (app.session && app.state === "active") app.session.pause("tab-hidden");
  audio.setSuspended(true);
  platform.flush();
});
onResume(() => {
  hidden = false;
  if (app.session && app.session.pauseReason === "tab-hidden") app.session.resume("tab-visible");
  audio.setSuspended(false);
});
onQuit(() => {
  if (app.session && (app.state === "active" || app.state === "paused")) app.session.saveSnapshot();
  platform.flush();
});

onFixedUpdate(() => {
  if (hidden) return;
  clockMs += 1000 / 60;
  if (app.state === "preparing" && app.meta) {
    // ui.js showPreparing: "…", then 3, 2, 1 a second apart (a tick each), the round at 3.2 s.
    const c = app.countdown;
    c.total++;
    if (c.total % 60 === 0 && c.total <= 180) {
      c.n = 4 - c.total / 60;
      audio.play("countdownTick");
      announce(String(c.n));
    }
    if (c.total >= 192) startRound(app.meta.descriptor, app.meta);
    return;
  }
  if (app.state === "resolving" && --app.resolveSteps <= 0) showResults();
});

let frameDt = 0;
onUpdate((dt) => {
  frameDt = dt;
  applyLook();
  applyPalette(ui.preferences().highContrast, settings.cvdPalette);
  audio.update();
  if (achievementAt && frame().time >= achievementAt) {
    achievementAt = 0;
    audio.play("achievement");
    announce(T("Achievement unlocked."));
  }
  if (app.toast && app.toast.until < now()) app.toast = null;
});
onRender(() => {
  drawScreens();
  render.update(frameDt);
});

/** Content sanity check (bootstrap.js; cheap). */
export function contentOk(): boolean { return Content.validateContent().ok; }
platform.onProgressMerged(() => { /* screens read progress() each frame */ });
