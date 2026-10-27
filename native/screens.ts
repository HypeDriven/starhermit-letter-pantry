// The browser build's DOM layer (ui.js + style.css) as starhermit:ui, built
// every frame over the pantry: the title (name, tagline, Play, Resume saved
// round, Daily, Journey, How to play, Settings, the player line, Sign in /
// Invite, the content version), the mode cards and the Journey / Practice /
// Challenges / Learn lists, How to play, Settings, the 3-2-1 preparing
// panel, the play screen (the objective rail with the word slots, bonus
// count and lesson box; the status and action rail; the tray with the
// current word, the letter biscuits and the letters field), the pause menu
// with its Settings and Help overlays, the results, and the toast. The
// browser's media queries are layouts picked by the window's logical size:
// desktop (≥ 1024 px), tablet (narrower rails, smaller rail text), portrait
// phone (≤ 760 px wide: status on top, actions in a wrapping row at the
// bottom, 56 px biscuits) and landscape phone (≤ 900 px wide: three narrow
// columns, the actions in two columns, 48 px biscuits).
import { frame, openMenu } from "starhermit:engine";
import { requestRebind } from "starhermit:input";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { Content, type Snapshot } from "./game.ts";
import { account, N, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import {
  app, can, click, command, copyInvite, dailyDate, hasSnapshot, keysFor, leaderboardLine, leaveRound, lessonBox, modeLabel,
  nextStage, openOverlay, openScreen, pauseRound, pickTheme, playChallenge, playDaily, playJourney, playLesson, playPractice, progress,
  resumeRound, resumeSaved, retry, settings, showTitle, signIn, toggleLetter, typedInField, letterLabel, focusTyping,
  TYPE_ID, TYPING, typingFocus,
} from "./main.ts";

export const LETTER_ID = (i: number): string => `letter-${i}`;

// ------------------------------------------------------------------ layout
interface Layout { lw: number; lh: number; sc: number; desktop: boolean; portrait: boolean; landscape: boolean }
function layoutNow(): Layout {
  const f = frame();
  const sc = ui.preferences().scale;
  const sa = f.safeArea;
  const lw = Math.max(1, (f.width - sa.left - sa.right) / sc), lh = Math.max(1, (f.height - sa.top - sa.bottom) / sc);
  const portrait = lw <= 760 && lh >= lw;
  const landscape = !portrait && lw <= 900 && lw > lh;
  return { lw, lh, sc, desktop: lw >= 1024, portrait, landscape };
}
const lastSize = new Map<string, number>();
const prefs = (): ui.UiPreferences => ui.preferences();
const hc = (): boolean => prefs().highContrast;
function textWidth(text: string, style: string | readonly (string | ui.Style)[], kind?: "button" | "heading"): number {
  return ui.measureText(text, { ...(kind ? { kind } : {}), style: typeof style === "string" ? style : [...style] }).width / prefs().scale;
}
interface Btn { id: string; text: string; style?: string; disabled?: boolean; act: () => void }
const buttonWidth = (text: string, style: string): number => textWidth(text, style, "button") + 4;
/** A button `width` wide (null: its text's); a label too long for it wraps inside. */
function button(b: Btn, width: number | null = null): boolean {
  const style = b.style ?? "btn";
  const opts: ui.ButtonOptions = {};
  if (b.disabled) opts.disabled = true;
  const s: ui.Style = width != null ? { width } : {};
  if (width != null && buttonWidth(b.text, style) > width) {
    const inner = Math.max(20, width - 44);
    opts.content = () => { ui.style({ text: { align: style === "btn-start" || style === "btn-stage" ? "start" : "center" } }).paragraph(b.text, inner); };
  }
  const hit = ui.style(style, s).id(b.id).button(b.text, opts);
  if (hit && frame().frame !== app.openedFrame) b.act();
  return hit;
}
/** Buttons at their own widths in rows that wrap at `width` (CSS flex-wrap). */
function flow(label: string, list: Btn[], width: number, gap = 9.6, align: "start" | "center" = "start"): void {
  const rows: Btn[][] = [[]];
  let used = 0;
  for (const b of list) {
    const bw = Math.min(width, buttonWidth(b.text, b.style ?? "btn"));
    if (rows[rows.length - 1]!.length && used + gap + bw > width) { rows.push([]); used = 0; }
    used += (rows[rows.length - 1]!.length ? gap : 0) + bw;
    rows[rows.length - 1]!.push(b);
  }
  ui.column(label, () => {
    rows.forEach((row, ri) => ui.row(`${label}-r${ri}`, () => {
      for (const b of row) button(b, buttonWidth(b.text, b.style ?? "btn") > width ? width : null);
    }, { spacing: gap, align: "center" }));
  }, { spacing: gap, align, width });
}
/** Text up to `width` wide: one label when it fits, else a paragraph. */
function para(text: string, width: number, cls = "body", id?: string, center = false): void {
  if (!text) return;
  const styles: (string | ui.Style)[] = [cls];
  if (center) styles.push({ text: { align: "center" } });
  let u = ui.style(...styles);
  if (id) u = u.id(id);
  if (textWidth(text, styles) <= width) u.label(text);
  else u.paragraph(text, width);
}
function heading(cls: string, text: string, width: number, id?: string, center = false): void {
  const styles: (string | ui.Style)[] = [cls];
  if (center) styles.push({ text: { align: "center" } });
  if (textWidth(text, styles, "heading") <= width) (id ? ui.id(id) : ui).style(...styles).heading(text);
  else ui.style(...styles).paragraph(text, width);
}
const fresh = (n = 5): boolean => frame().frame - app.openedFrame <= n;

// ------------------------------------------------------------------ the frame
export function drawScreens(): void {
  const L = layoutNow();
  const f = frame();
  switch (app.screen) {
    case "title": page("title", L, titleScreen, { style: hc() ? "panel" : "title-panel", max: 420 }); break;
    case "modes": page("modes", L, modesScreen, { max: 620 }); break;
    case "journey": page("journey", L, journeyScreen, { max: 620 }); break;
    case "practice": page("practice", L, practiceScreen, { max: 560 }); break;
    case "challenges": page("challenges", L, challengesScreen, { max: 560 }); break;
    case "learn": page("learn", L, learnScreen, { max: 560 }); break;
    case "help": page("help", L, (w) => helpBody(w, () => { click(); showTitle(); }), { max: 620 }); break;
    case "settings": page("settings", L, (w) => settingsBody(w, () => { click(); showTitle(); }), { max: 560 }); break;
    case "preparing": page("preparing", L, preparingScreen, { max: 480 }); break;
    case "play": playScreen(L); break;
    case "results": page("results", L, resultsScreen, { max: 620, min: 480 }); break;
  }
  if (app.screen === "play") overlays(L);
  toast(L);
  if (app.focusNext) {
    const age = f.frame - app.openedFrame;
    if (age >= 1) {
      const target = app.focusNext === TYPING ? typingFocus() : app.focusNext;
      if (target) ui.setFocus(target);
    }
    if (age >= 3) app.focusNext = null;
  }
  // Escape / Back on a menu screen goes back (the overlays are dialogs that close themselves).
  if (!app.overlay && ui.back() && !fresh(1)) {
    if (app.screen === "journey" || app.screen === "practice" || app.screen === "challenges" || app.screen === "learn") openScreen("modes");
    else if (app.screen === "modes" || app.screen === "help" || app.screen === "settings") { click(); showTitle(); }
  }
}

/** A panel (style.css .lp-panel): centred, at most 70ch wide, scrolling inside when taller than the window. */
function page(key: string, L: Layout, build: (w: number, L: Layout) => void, o: { style?: string; max: number; min?: number }): void {
  const pad = L.portrait ? 16 : 32;
  const outer = Math.min(o.max, L.lw * 0.92, L.lw - 16);
  const avail = Math.max(80, L.lh - 16);
  const h = lastSize.get(key) ?? 0;
  const scroll = h > avail;
  const inner = outer - 2 * pad - (scroll ? 14 : 0);
  ui.place(`page-${key}`, "center", () => {
    const body = (): void => {
      const r = ui.column(`${key}-col`, () => build(inner, L), {
        style: o.style ?? "panel", width: outer - (scroll ? 14 : 0), spacing: 12,
        padding: { top: L.portrait ? 16 : 24, bottom: L.portrait ? 16 : 24, start: pad, end: pad },
      });
      lastSize.set(key, r.height / L.sc);
    };
    if (scroll) ui.scrollArea(`${key}-scroll`, { width: outer, height: avail }, body, fresh() ? { scrollTo: { top: 0 } } : undefined);
    else body();
  });
}
function backButton(w: number, act: () => void, id = "btn-back"): void { flow(`${id}-row`, [{ id, text: T("Back"), act }], w); }

// ------------------------------------------------------------------ title and mode lists
const SYNC: Record<string, string> = { syncing: N("syncing…"), saving: N("syncing…"), synced: N("synced"), offline: N("sync unavailable — local save") };
export function playerLine(): string {
  if (!platform.signedIn()) return "";
  const s = platform.syncState();
  const name = platform.displayName() || T("Player {id}", { id: "…" });
  return SYNC[s] ? `${name} · ${T(SYNC[s]!)}` : name;
}
function titleScreen(w: number): void {
  heading(w < 340 ? "logo-small" : "logo", "Letter Pantry", w, "title-h", true);
  para(T("Spell every word hiding in the biscuit tray."), w, "tagline", "tagline", true);
  ui.column("title-nav", () => {
    button({ id: "btn-play", text: T("Play"), style: "btn-big", act: () => openScreen("modes") }, w);
    if (hasSnapshot()) button({ id: "btn-resume", text: T("Resume saved round"), act: resumeSaved }, w);
    button({ id: "btn-daily", text: T("Daily Pantry — {date}", { date: dailyDate() }), act: playDaily }, w);
    button({ id: "btn-journey", text: T("Journey ({done}/{total})", { done: progress().progression.completedStages.length, total: Content.JOURNEY.length }), act: () => openScreen("journey") }, w);
    button({ id: "btn-help", text: T("How to play"), act: () => openScreen("help") }, w);
    button({ id: "btn-settings", text: T("Settings"), act: () => openScreen("settings") }, w);
  }, { spacing: 9.6, width: w });
  const line = playerLine();
  if (line) para(line, w, "player-status", "player-line", true);
  const a = account();
  const row: Btn[] = [];
  if (!platform.signedIn()) row.push({ id: "btn-signin", text: a.signIn, act: signIn });
  if (platform.inviteLink()) row.push({ id: "btn-invite", text: a.invite, act: copyInvite });
  if (row.length) flow("account-row", row, w, 8, "center");
  para(T("Content {v}", { v: Content.CONTENT_VERSION }), w, "version", "version", true);
}

const MODES: { id: string; title: string; desc: string; meta: string; go: () => void; primary?: boolean }[] = [
  { id: "journey", title: N("Journey"), desc: N("Authored stages that teach and test you, one mechanic at a time."), meta: N("42 stages · solo · unranked"), go: () => openScreen("journey"), primary: true },
  { id: "daily", title: N("Daily Pantry"), desc: N("One shared puzzle per UTC day. Same tray for everyone."), meta: N("1 round · ranked · ~3 min"), go: () => playDaily() },
  { id: "practice", title: N("Practice"), desc: N("Relaxed round at your chosen difficulty. Undo allowed."), meta: N("unranked · restartable"), go: () => openScreen("practice") },
  { id: "challenge", title: N("Challenge"), desc: N("Constrained rounds: move limits, speed targets, restricted tools."), meta: N("4 trials · unranked"), go: () => openScreen("challenges") },
  { id: "learn", title: N("Learn"), desc: N("Interactive lessons. Each step asks you to perform the action yourself."), meta: N("3 lessons · unranked"), go: () => openScreen("learn") },
];
function modesScreen(w: number): void {
  heading("h2", T("Choose a mode"), w, "modes-h");
  const gap = 12.8;
  const cols = Math.max(1, Math.floor((w + gap) / (220 + gap)));
  const cw = (w - gap * (cols - 1)) / cols;
  ui.grid("mode-grid", () => {
    for (const m of MODES) ui.column(`card-${m.id}`, () => {
      para(T(m.title), cw - 30, "h3");
      para(T(m.desc), cw - 30, "body");
      para(T(m.meta), cw - 30, "mode-meta");
      button({ id: `mode-${m.id}`, text: T("Start"), style: m.primary ? "btn-primary" : "btn", act: m.go });
    }, { style: "mode-card", width: cw, spacing: 6 });
  }, { columns: cols, gap, width: w, align: "stretch" });
  backButton(w, () => { click(); showTitle(); });
}
function journeyScreen(w: number, L: Layout): void {
  const p = progress();
  heading("h2", T("Journey"), w, "journey-h");
  para(T("{done} of {total} stages complete.", { done: p.progression.completedStages.length, total: Content.JOURNEY.length }), w, "body", "journey-count");
  const maxH = Math.max(140, L.lh * 0.5);
  const tall = (lastSize.get("stage-grid") ?? 0) > maxH;
  const gw = w - (tall ? 14 : 0);
  const gap = 8;
  const cols = Math.max(1, Math.floor((gw + gap) / (150 + gap)));
  const cw = (gw - gap * (cols - 1)) / cols;
  const list = (): void => {
    const r = ui.grid("stage-grid", () => {
      Content.JOURNEY.forEach((stage, i) => {
        const unlocked = i === 0 || p.progression.completedStages.includes(Content.JOURNEY[i - 1]!.id);
        const done = p.progression.completedStages.includes(stage.id);
        const tier = T(stage.tier!);
        const v = { n: i + 1, word: stage.base!, tier };
        const aria = done ? T("Stage {n}: {word}, {tier}, completed", v) : unlocked ? T("Stage {n}: {word}, {tier}", v) : T("Stage {n}: {word}, {tier}, locked", v);
        const opts: ui.ButtonOptions = {
          content: () => {
            ui.style("dt", hc() || !done ? {} : { text: { color: "$accent" } }).label(`${i + 1}. ${stage.base!.toUpperCase()}${done ? " ✓" : ""}`);
            ui.style("stage-tier").label(tier);
          },
        };
        if (!unlocked) opts.disabled = true;
        if (ui.style(done ? "btn-done" : "btn-stage", { width: cw }).id(`stage-${i + 1}`).button(aria, opts) && unlocked && !fresh(0)) playJourney(i);
      });
    }, { columns: cols, gap, width: gw, align: "stretch" });
    lastSize.set("stage-grid", r.height / L.sc);
  };
  if (tall) ui.scrollArea("stage-scroll", { width: w, height: maxH }, list, fresh() ? { scrollTo: { top: 0 } } : undefined);
  else list();
  backButton(w, () => openScreen("modes"));
}
const DIFFICULTY: Record<string, string> = { easy: N("Easy"), medium: N("Medium"), hard: N("Hard") };
function practiceScreen(w: number): void {
  heading("h2", T("Practice"), w, "practice-h");
  para(T("Pick a difficulty. Practice never affects ranked boards."), w, "body", "practice-p");
  flow("practice-row", Content.PRACTICE_DIFFICULTIES.map((d) => ({ id: `practice-${d}`, text: T(DIFFICULTY[d] ?? d), style: "btn-big-plain", act: () => playPractice(d) })), w);
  backButton(w, () => openScreen("modes"));
}
function challengesScreen(w: number): void {
  heading("h2", T("Challenges"), w, "challenges-h");
  ui.column("challenge-list", () => {
    for (const c of Content.CHALLENGES) button({ id: c.id, text: `${c.base!.toUpperCase()} — ${T(c.challenge!)}`, style: "btn-start", act: () => playChallenge(c.id) }, w);
  }, { spacing: 8, width: w });
  backButton(w, () => openScreen("modes"));
}
function learnScreen(w: number): void {
  heading("h2", T("Learn"), w, "learn-h");
  const done = progress().tutorial.completedLessons;
  ui.column("lesson-list", () => {
    for (const l of Content.LESSONS) button({ id: l.id, text: `${T(l.title)}${done.includes(l.id) ? " ✓" : ""}`, style: "btn-start", act: () => playLesson(l.id) }, w);
  }, { spacing: 8, width: w });
  backButton(w, () => openScreen("modes"));
}

// ------------------------------------------------------------------ help and settings
function helpBody(w: number, back: () => void): void {
  heading("h2", T("How to play"), w, "help-h");
  const cards: [string, string][] = [
    [T("Goal"), T("Rearrange the letter biscuits to find every target word. Bonus words score extra.")],
    [T("Select"), T("Tap or focus a letter and press Enter to pick it. Letters form a word in pick order.")],
    [T("Typing"), T("Type a letter to pick the first free biscuit showing it. The words are English in every language.")],
    [T("Submit"), T("With 3+ letters picked, press Submit. Invalid words cost 25 points and break your streak.")],
    [T("Tools"), T("Shuffle mixes the tray. Undo takes back an action where allowed. Hint reveals a letter of an unfound word.")],
    [T("Keyboard"), T("{prev} {next} move between letters · Enter picks a focused letter · {submit} submits · {unpick} unpicks · {clear} clears · {pause} pause · {undo} undo · {hint} hint · {camera} camera reset.", {
      prev: keysFor("prev"), next: keysFor("next"), submit: keysFor("submit"), unpick: keysFor("unpick"), clear: keysFor("clear"),
      pause: keysFor("pause"), undo: keysFor("undo"), hint: keysFor("hint"), camera: keysFor("camera"),
    })],
    [T("Scoring"), T("Target word 100 + 25 per letter past 3. Bonus word 50 + 10 per letter past 3. Streaks add 15 each. Beat par time for a bonus.")],
  ];
  const gap = 11.2;
  const cols = Math.max(1, Math.floor((w + gap) / (220 + gap)));
  const cw = (w - gap * (cols - 1)) / cols;
  ui.grid("help-cards", () => {
    cards.forEach(([title, body], i) => ui.column(`help-${i}`, () => {
      para(title, cw - 23, "help-h");
      para(body, cw - 23, "help-p");
    }, { style: "help-card", width: cw, spacing: 5 }));
  }, { columns: cols, gap, width: w, align: "stretch" });
  backButton(w, back);
}
const OPTIONS: [keyof platform.Settings, string][] = [
  ["cvdPalette", N("Color-vision-safe palette")], ["leftHanded", N("Left-handed controls")],
  ["hapticsOff", N("Haptics off")], ["tutorialReplay", N("Replay tutorial prompts")],
];
function settingsBody(w: number, back: () => void): void {
  heading("h2", T("Settings"), w, "settings-h");
  ui.column("set-access", () => {
    para(T("Accessibility"), w - 28, "fieldset-legend");
    for (const [key, label] of OPTIONS) {
      const cur = !!settings[key];
      const next = ui.id(`set-${key}`).checkbox(T(label), cur);
      if (next !== cur) { platform.setSetting(key, next); click(); }
    }
  }, { style: "fieldset", width: w, spacing: 4 });
  ui.column("set-themes", () => {
    para(T("Themes"), w - 28, "fieldset-legend");
    flow("theme-row", Content.THEMES.map((t) => ({ id: `theme-${t.id}`, text: T(t.name), act: () => pickTheme(t.id) })), w - 28, 8);
  }, { style: "fieldset", width: w, spacing: 6 });
  para(T("Sound, graphics, language, reduced motion, high contrast and larger text are in the StarHermit Options."), w, "small", "options-note");
  flow("options-row", [
    { id: "btn-options", text: T("Audio & graphics"), act: () => { click(); openMenu(); } },
    { id: "btn-rebind", text: T("Keyboard bindings"), act: () => { click(); requestRebind(); } },
  ], w);
  backButton(w, back);
}

// ------------------------------------------------------------------ preparing
function preparingScreen(w: number): void {
  heading("h2", modeLabel(app.meta), w, "prep-h", true);
  const n = app.countdown.n;
  ui.style("countdown", { text: { align: "center" } }).id("countdown").label(n > 0 ? String(n) : "…");
}

// ------------------------------------------------------------------ play
const fmtTime = (ms: number): string => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
function playScreen(L: Layout): void {
  const s = app.session;
  if (!s) return;
  const snap = s.state as Snapshot;
  const pad = 9.6;
  const gap = L.landscape ? 6.4 : 9.6;
  if (L.portrait) {
    const w = L.lw - 2 * pad;
    ui.place("rail-top", { anchor: "top", y: pad }, () => {
      const maxH = L.lh * 0.34;
      const h = lastSize.get("rail-top") ?? 0;
      const body = (): void => {
        const r = ui.column("rail-top-col", () => objectiveRail(w - 26 - (h > maxH ? 14 : 0), true), { style: "rail", width: w - (h > maxH ? 14 : 0), spacing: 8, padding: 8 });
        lastSize.set("rail-top", r.height / L.sc);
      };
      if (h > maxH) ui.scrollArea("rail-top-scroll", { width: w, height: maxH }, body);
      else body();
    });
    let actionsH = 0;
    ui.place("rail-bottom", { anchor: "bottom", y: pad }, () => {
      const r = ui.column("rail-bottom-col", () => actionRail(w - 26, "row"), { style: "rail", width: w, spacing: 8, padding: 8 });
      actionsH = r.height / L.sc;
      lastSize.set("rail-bottom", actionsH);
    });
    tray(L, w, (lastSize.get("rail-bottom") ?? 140) + pad + 16, 56);
    return;
  }
  const leftW = L.desktop ? 300 : L.landscape ? 190 : 240;
  const rightW = L.desktop ? 260 : L.landscape ? 190 : 220;
  const swap = settings.leftHanded;
  const railH = L.lh - 2 * pad;
  const small = !L.desktop;
  const left = (): void => {
    const maxH = railH;
    const h = lastSize.get("rail-left") ?? 0;
    const inner = leftW - 2 * 12.8 - 2 - (h > maxH ? 14 : 0);
    const body = (): void => {
      const r = ui.column("rail-left-col", () => objectiveRail(inner, false, small), { style: "rail", width: leftW - (h > maxH ? 14 : 0), spacing: 8, ...(h > maxH ? {} : { height: railH }) });
      lastSize.set("rail-left", r.height / L.sc);
    };
    if (h > maxH) ui.scrollArea("rail-left-scroll", { width: leftW, height: maxH }, body);
    else body();
  };
  const right = (): void => {
    const maxH = railH;
    const h = lastSize.get("rail-right") ?? 0;
    const inner = rightW - 2 * (L.landscape ? 8 : 12.8) - 2 - (h > maxH ? 14 : 0);
    const body = (): void => {
      const r = ui.column("rail-right-col", () => actionRail(inner, L.landscape ? "grid" : "column", small), {
        style: "rail", width: rightW - (h > maxH ? 14 : 0), spacing: 8, ...(L.landscape ? { padding: 8 } : {}),
      });
      lastSize.set("rail-right", r.height / L.sc);
    };
    if (h > maxH) ui.scrollArea("rail-right-scroll", { width: rightW, height: maxH }, body);
    else body();
  };
  ui.place("rail-a", { anchor: "top-start", x: pad, y: pad }, swap ? right : left);
  ui.place("rail-b", { anchor: "top-end", x: pad, y: pad }, swap ? left : right);
  const trayW = L.lw - leftW - rightW - 2 * pad - 2 * gap;
  tray(L, Math.max(160, trayW), pad + 16, L.landscape ? 48 : 64);
  void snap;
}

/** The left rail (ui.js showPlay objective): round title, objective, word slots, bonus count, lesson box. */
function objectiveRail(w: number, compact: boolean, small = false): void {
  const s = app.session!;
  const snap = s.state as Snapshot;
  const sz = small ? 0.9 : 1;
  const t = (cls: string): (string | ui.Style)[] => (sz === 1 ? [cls] : [cls, { text: { size: Math.round(({ "hud-heading": 16.8, objective: 14.4, bonus: 13.6, "lesson-h": 15.2, "lesson-p": 14.4 } as Record<string, number>)[cls]! * sz * 10) / 10 } }]);
  const p = (text: string, ww: number, cls: string, id: string): void => {
    const st = t(cls);
    if (textWidth(text, st) <= ww) ui.style(...st).id(id).label(text);
    else ui.style(...st).id(id).paragraph(text, ww);
  };
  const head = (): void => {
    p(modeLabel(app.meta), compact ? Math.min(w, 180) : w, "hud-heading", "hud-heading");
    p(T("Find all {n} target words ({found} found).", { n: snap.targets.length, found: snap.foundTargets.length }), compact ? Math.min(w, 180) : w, "objective", "objective");
  };
  if (compact) {
    // Portrait (style.css ≤ 760 px): heading and objective beside the slots, which wrap in rows.
    ui.row("obj-row", () => {
      ui.column("obj-head", head, { spacing: 4, width: Math.min(w * 0.42, 180) });
      ui.column("obj-slots", () => { slots(w - Math.min(w * 0.42, 180) - 12, true); p(T("Bonus words found: {n}", { n: snap.foundBonus.length }), w - Math.min(w * 0.42, 180) - 12, "bonus", "bonus"); }, { spacing: 6 });
    }, { spacing: 12, width: w });
  } else {
    head();
    slots(w, false);
    p(T("Bonus words found: {n}", { n: snap.foundBonus.length }), w, "bonus", "bonus");
  }
  const box = lessonBox();
  if (box) ui.column("lesson-box", () => { p(box.title, w - 26, "lesson-h", "lesson-title"); p(box.text, w - 26, "lesson-p", "lesson-text"); }, { style: "lesson-box", width: w, spacing: 4 });
}
/** The word slots: one per target, blanks (with hinted letters) until found, then the word on the found fill. */
function slots(w: number, wrap: boolean): void {
  const snap = app.session!.state as Snapshot;
  const sorted = snap.targets.slice().sort((a, b) => a.length - b.length || a.localeCompare(b));
  const font = "monospace";
  const items = sorted.map((tw) => {
    const found = snap.foundTargets.includes(tw);
    const reveals = snap.hintReveals?.[tw] ?? [];
    const text = found ? tw.toUpperCase() : tw.split("").map((ch, p) => (reveals.includes(p) ? ch.toUpperCase() : "_")).join(" ");
    const cls = found ? "slot-text-found" : "slot-text";
    const tw2 = textWidth(text, [cls, { text: { font } }]);
    return { tw, found, text, cls, width: wrap ? tw2 + 20 : w };
  });
  const slot = (it: typeof items[number], i: number): void => {
    ui.id(`slot-${i}`).widget(it.found ? T("Found: {word}", { word: it.tw }) : T("Unfound word, {n} letters", { n: it.tw.length }), {
      role: "image", size: { width: it.width, height: 28 },
      draw: (r, st) => {
        const k = st.scale;
        draw.box(r.x, r.y, r.width, r.height, it.found ? "slot-found" : "slot");
        draw.text(it.text, r.x + 9.6 * k, r.y + (r.height - 16 * k * prefs().textScale) / 2 - 1 * k, {
          size: 16 * k * prefs().textScale, font, weight: "bold", letterSpacing: 4 * k, color: it.found || st.highContrast ? "#ffffff" : "#f5e9d5",
        });
      },
    });
  };
  if (!wrap) { ui.column("slots", () => items.forEach(slot), { spacing: 4.8, width: w }); return; }
  const rows: (typeof items)[] = [[]];
  let used = 0;
  for (const it of items) {
    if (rows[rows.length - 1]!.length && used + 4.8 + it.width > w) { rows.push([]); used = 0; }
    used += (rows[rows.length - 1]!.length ? 4.8 : 0) + it.width;
    rows[rows.length - 1]!.push(it);
  }
  let n = 0;
  ui.column("slots", () => rows.forEach((row, ri) => ui.row(`slots-r${ri}`, () => row.forEach((it) => slot(it, n++)), { spacing: 4.8 })), { spacing: 4.8 });
}
/** The right rail: score, moves, time (and the player line), then the round actions. */
function actionRail(w: number, mode: "column" | "row" | "grid", small = false): void {
  const s = app.session!;
  const snap = s.state as Snapshot;
  const k = small ? 0.9 : 1;
  const st = (cls: string, size: number): (string | ui.Style)[] => (k === 1 ? [cls] : [cls, { text: { size: size * k } }]);
  const statusLines = (): void => {
    ui.row("score-row", () => {
      ui.style(...st("status", 16)).label(T("Score:"));
      ui.style(...st("score-value", 20.8)).id("score").label(String(snap.score.total));
    }, { spacing: 5, align: "center" });
    ui.style(...st("status", 16)).id("moves").label(snap.mechanics.moveLimit != null
      ? T("Moves: {used}/{limit}", { used: snap.movesUsed, limit: snap.mechanics.moveLimit }) : T("Moves: {used}", { used: snap.movesUsed }));
    ui.style(...st("status", 16)).id("time").label(T("Time: {time} (par {par})", { time: fmtTime(s.elapsedMs()), par: fmtTime(snap.par.timeMs) }));
    const line = playerLine();
    if (line) para(line, w, "player-status", "sync-line");
  };
  if (mode === "row") {
    const items: (() => void)[] = [statusLines];
    flowItems(items, w);
  } else ui.column("status", statusLines, { spacing: 4, width: w });
  const acts: Btn[] = [
    { id: "act-submit", text: T("Submit"), style: "btn-primary", disabled: !can("submit"), act: () => { command({ type: "submit" }); focusTyping(); } },
    { id: "act-clear", text: T("Clear"), disabled: !can("clear"), act: () => { command({ type: "clear" }); focusTyping(); } },
    { id: "act-shuffle", text: T("Shuffle"), disabled: !can("shuffle"), act: () => { command({ type: "shuffle" }); focusTyping(); } },
    { id: "act-undo", text: T("Undo"), disabled: !can("undo"), act: () => { command({ type: "undo" }); focusTyping(); } },
    { id: "act-hint", text: T("Hint"), disabled: !can("hint"), act: () => { command({ type: "hint" }); focusTyping(); } },
    { id: "act-pause", text: T("Pause ({key})", { key: keysFor("pause") }), act: pauseRound },
  ];
  if (mode === "column") ui.column("actions", () => acts.forEach((b) => button(b, w)), { spacing: 7.2, width: w });
  else if (mode === "grid") {
    const cw = (w - 5.6) / 2;
    ui.grid("actions", () => acts.forEach((b) => button({ ...b, style: b.style }, cw)), { columns: 2, gap: 5.6, width: w });
  } else flow("actions", acts, w, 8, "center");
}
function flowItems(items: (() => void)[], w: number): void { ui.row("status-row", () => items.forEach((f) => f()), { spacing: 16, width: w }); }

/** The tray (style.css .lp-tray): the current word over the biscuits, then the letters field; bottom-centred. */
function tray(L: Layout, w: number, bottom: number, size: number): void {
  const s = app.session!;
  const snap = s.state as Snapshot;
  const word = snap.selected.map((i) => snap.letters[i]!.toUpperCase()).join("");
  ui.place("tray", { anchor: "bottom", y: bottom }, () => ui.column("tray-col", () => {
    const cur = L.landscape ? [{ text: { size: 24 } }] : [];
    ui.style("current", ...cur, { text: { align: "center" } }).id("current").label(word || "·");
    const gap = 10;
    const n = snap.letters.length;
    const sz = Math.min(size, Math.floor((w - gap * (n - 1)) / n));
    ui.row("letters", () => {
      for (let i = 0; i < n; i++) letterButton(i, snap, sz);
    }, { spacing: gap, align: "end" });
    const field = Math.min(w, Math.max(200, n * (sz + gap)));
    const t = ui.style("field").textField(TYPE_ID, "", { width: field, maxChars: 32, placeholder: T("Type letters"), arrows: false });
    if (t) typedInField(t);
    if (ui.submitted(TYPE_ID)) command({ type: "submit" });
    ui.target(T("Tray letters: {letters}. Selected: {word}. Found {found} of {total} target words. Score {score}.", {
      letters: snap.letters.map((l) => l.toUpperCase()).join(" "), word: word || T("none"),
      found: snap.foundTargets.length, total: snap.targets.length, score: snap.score.total,
    }), { x: 0, y: 0, width: 1, height: 1 }, { role: "label" });
  }, { spacing: 8, align: "center", width: w }));
}
function letterButton(i: number, snap: Snapshot, sz: number): void {
  const sel = snap.selected.includes(i);
  const letter = snap.letters[i]!.toUpperCase();
  const lift = 14;
  const r = ui.id(LETTER_ID(i)).widget(letterLabel(i), {
    role: "toggle", checked: sel, size: { width: sz, height: sz + lift },
    draw: (rect, st) => {
      const k = st.scale;
      const y = rect.y + (sel ? 0 : lift * k) - (st.hovered && !sel && !st.reducedMotion ? 3 * k : 0);
      const h = rect.height - lift * k;
      draw.box(rect.x, y, rect.width, h, sel ? "letter-sel" : "letter");
      const fs = sz * 0.45 * k * prefs().textScale;
      draw.text(letter, rect.x + rect.width / 2, y + (h - fs) / 2 - 1 * k, {
        size: fs, font: "serif", weight: "bold", align: "center", color: st.highContrast ? "#000000" : "#4a2c12",
      });
    },
  });
  if (r.activated) {
    toggleLetter(i);
    // A click or tap hands the keys back to the letters field (keyboard and pad activation keep the biscuit).
    if (r.hovered) focusTyping();
  }
}

// ------------------------------------------------------------------ pause, settings and help over the round
function dialog(key: string, L: Layout, build: (w: number) => void, onClose: () => void): void {
  const pad = 24;
  const outer = Math.min(L.portrait ? L.lw - 16 : 560, L.lw - 16);
  const w = outer - 2 * pad;
  const avail = Math.max(80, L.lh * 0.92 - 2 * pad);
  const h = lastSize.get(`dlg-${key}`) ?? 0;
  const body = (): void => {
    const r = ui.column(`${key}-body`, () => build(w - (h > avail ? 14 : 0)), { spacing: 12, width: w - (h > avail ? 14 : 0) });
    lastSize.set(`dlg-${key}`, r.height / L.sc);
  };
  const open = ui.dialog(key, "", true, () => {
    if (h > avail) ui.scrollArea(`${key}-scroll`, { width: w, height: avail }, body, fresh(4) ? { scrollTo: { top: 0 } } : undefined);
    else body();
  });
  // The Escape that opened it must not close it the same frame.
  if (!open && !fresh(0)) onClose();
}
function overlays(L: Layout): void {
  const back = (): void => { click(); openOverlay("pause"); };
  if (app.overlay === "pause") {
    dialog(T("Paused"), L, (w) => {
      heading("h2", T("Paused"), w, "pause-h", true);
      button({ id: "btn-resume", text: T("Resume"), style: "btn-big", act: resumeRound }, w);
      const gw = (w - 8) / 2;
      ui.grid("pause-grid", () => {
        button({ id: "btn-av", text: T("Audio & graphics"), act: () => { click(); openMenu(); } }, gw);
        button({ id: "btn-access", text: T("Accessibility"), act: () => openOverlay("settings") }, gw);
        button({ id: "btn-phelp", text: T("Help"), act: () => openOverlay("help") }, gw);
        button({ id: "btn-leave", text: T("Leave round"), style: "btn-danger", act: leaveRound }, gw);
      }, { columns: 2, gap: 8, width: w });
      button({ id: "btn-back-game", text: T("Back to game"), act: resumeRound }, w);
    }, resumeRound);
  } else if (app.overlay === "settings") dialog(T("Settings"), L, (w) => settingsBody(w, back), back);
  else if (app.overlay === "help") dialog(T("How to play"), L, (w) => helpBody(w, back), back);
}

// ------------------------------------------------------------------ results
function resultsScreen(w: number, L: Layout): void {
  const r = app.results;
  if (!r) return;
  const headline = r.outcome === "completed" ? T("Pantry stocked!") : r.outcome === "out-of-moves" ? T("Out of moves") : T("Round resigned");
  heading("h2", headline, w, "results-h");
  if (r.outcome === "completed" && !hc() && L.lh > 620) {
    const aw = Math.min(320, w * 0.7);
    ui.row("art-row", () => {
      ui.widget("", { role: "image", size: { width: aw, height: aw * 0.75 }, draw: (rc) => draw.box(rc.x, rc.y, rc.width, rc.height, "results-art") });
    }, { width: w, justify: "center" });
  }
  para(T("Score breakdown"), w, "caption", "caption", true);
  const sc = r.score;
  const rows: [string, number, boolean?][] = [
    [T("Target words"), sc.target], [T("Bonus words"), sc.bonus], [T("Length bonus"), sc.length],
    [T("Streak bonus"), sc.streak], [T("Invalid penalty"), sc.penalty], [T("Time bonus"), sc.time], [T("Total"), sc.total, true],
  ];
  ui.column("score-table", () => rows.forEach(([k, v, total], i) => ui.row(`score-${i}`, () => {
    para(k, w - 90, total ? "total" : "dt");
    ui.spacer();
    ui.style(total ? "total" : "dd", { text: { numerals: "tabular" } }).id(`score-${i}-v`).label(String(v));
  }, { width: w, align: "center", padding: { start: 8, end: 8 }, ...(total ? { style: "total-row" } : {}) })), { spacing: 6, width: w });
  const lines = (parts: Results["comparison"]): string => parts.map(([k, v]) => T(k, v ?? null)).join(" ");
  if (r.progressionText.length) para(lines(r.progressionText), w, "note", "progress-note");
  if (r.newAchievements.length) {
    para(T("Achievements unlocked"), w, "h3", "ach-h");
    for (const a of r.newAchievements) para(`🏆 ${T(a.name)} — ${T(a.desc)}`, w - 16, "body", `ach-${a.id}`);
  }
  if (r.comparison.length) para(lines(r.comparison), w, "note", "comparison");
  const lb = leaderboardLine();
  if (lb) para(lb, w, "note", "results-lb");
  const row: Btn[] = [{ id: "btn-retry", text: T("Retry"), style: "btn-primary", act: retry }];
  if (r.allowNext) row.push({ id: "btn-next", text: T("Next stage"), act: nextStage });
  row.push({ id: "btn-title", text: T("Back to title"), act: leaveRound });
  flow("results-row", row, w);
}
type Results = NonNullable<typeof app.results>;

// ------------------------------------------------------------------ the toast
function toast(L: Layout): void {
  const t = app.toast;
  if (!t) return;
  const w = Math.min(L.lw - 32, 420);
  ui.place("toast", { anchor: "bottom", y: 16 }, () => ui.column("toast-col", () => para(t.text(), w - 34, "toast-text", "toast-text", true), { style: "toast", align: "center" }));
}


