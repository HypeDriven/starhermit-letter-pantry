// The game's data and the StarHermit platform, on the runtime's modules:
// - progress (progress.js: completed Journey stages, finished lessons, the
//   stats counters, achievements and the best Daily per date) is the game's
//   save (starhermit:storage `saves`) on the device and in the player's cloud
//   slot; two devices' copies merge on a conflict (progress.js merge: the
//   browser build's saveconflict merge). The slot the browser build wrote
//   (the JS SDK's saveJSON of { schemaVersion, savedAt, progression, tutorial,
//   stats, achievements, boards } under game:<slug>) shows as foreign: it is
//   merged in and replaced once;
// - the round in progress (session.js's `last-snapshot`, "Resume saved
//   round") stays on the device, as it did in the browser's localStorage:
//   session.js writes it through a localStorage stand-in over the device's
//   key/value storage;
// - the game's own options (colour-vision palette, left-handed rails,
//   haptics, lesson prompts) are `settings` (game.<key>, synced with the
//   account); the browser build's values in the account's settings KV are
//   migrated, then all its KV keys removed. Volumes, graphics, language,
//   reduced motion, high contrast and larger text are the runtime's Options;
// - the player, the invite link, the platform's clock for the Daily, the
//   leaderboard read for the Daily results line, and posting a finished
//   round's total through score-script.js (a practice session whose socket
//   carries { type: 'result', scores }, as the JS SDK's submitScores did)
//   with the rank on the high-score board.
import type { JsonValue } from "starhermit:engine";
import {
  connectGame, inviteLink as fetchInviteLink, leaderboards, onPlayerChange, player, serverNow, serverTime, sessions, type Leaderboard,
} from "starhermit:platform";
import { saves, settings as store, storage } from "starhermit:storage";
import * as P from "../progress.js";

export interface Progress {
  progression: { completedStages: string[] };
  tutorial: { completedLessons: string[] };
  stats: { targetWordsFound: number; roundsCompleted: number; completionStreak: number };
  achievements: { unlocked: string[] };
  boards: { daily: Record<string, { score: number; durationMs: number; date: string }> };
}
export interface Settings { cvdPalette: boolean; leftHanded: boolean; hapticsOff: boolean; tutorialReplay: boolean }
type Key = keyof Settings;
const Prog = P as unknown as {
  normalize(raw: unknown): Progress;
  merge(a: unknown, b: unknown): Progress;
  pickSettings(raw: unknown): Partial<Settings>;
  readForeign(text: string | null): Progress | null;
  DEFAULT_SETTINGS: Settings;
  SETTING_KEYS: Key[];
  BROWSER_KEYS: string[];
};

// --- the device's localStorage stand-in (session.js's last-snapshot) -------------------------------
// session.js keeps its checksummed records in localStorage under "letter-pantry:<key>"; here they go
// to the device's key/value storage under the same names.
const local = {
  getItem(key: string): string | null { try { return storage.getText(key); } catch { return null; } },
  setItem(key: string, value: string): void { storage.set(key, String(value)); },
  removeItem(key: string): void { try { storage.remove(key); } catch { /* gone */ } },
};
(globalThis as unknown as { localStorage: typeof local }).localStorage = local;

// --- the progress save ------------------------------------------------------------------
let live: Progress = Prog.normalize(null);
let lastSavedAt = 0;
const mergedListeners = new Set<() => void>();
/** fn() after progress from the account (another device, the browser build) was merged in. */
export function onProgressMerged(fn: () => void): void { mergedListeners.add(fn); }
function merged(): void { for (const fn of mergedListeners) fn(); }

/** The live progress document (rounds update it in place, then persist()). */
export function progress(): Progress { return live; }
/** Saves the progress (device at once, the account debounced by the runtime). */
export function persist(opts: { replaceForeign?: boolean } = {}): void {
  try { saves.save(live as unknown as JsonValue, { schema: 1, ...opts }); }
  catch (e) { console.warn(`save: ${String(e)}`); }
}
/** Merges another copy into the live document (and saves); whether anything changed. */
function adopt(other: unknown): boolean {
  const next = Prog.merge(live, other);
  if (JSON.stringify(next) === JSON.stringify(live)) return false;
  live = next;
  persist();
  return true;
}
saves.onConflict((localSave, remote) => ({ merged: Prog.merge(localSave?.data ?? null, remote.data) as unknown as JsonValue }));
saves.onStatus((_status, state) => {
  if (state === "foreign") { migrateForeign(); return; }
  // The account's save replaced the device's (another device saved last): merge it in.
  const cur = saves.load();
  if (cur && cur.savedAt !== lastSavedAt) {
    lastSavedAt = cur.savedAt;
    if (adopt(cur.data)) merged();
  }
});
/** The browser build's cloud save: its progress merged with this device's, saved over it once. */
function migrateForeign(): void {
  const old = saves.foreign();
  if (!old) return;
  const doc = Prog.readForeign(old.text);
  const changed = doc ? adopt(doc) : false;
  persist({ replaceForeign: true });
  if (changed) merged();
}

/** For the profile line: local (a guest) | syncing | saving | synced | offline. */
export function syncState(): "local" | "syncing" | "saving" | "synced" | "offline" {
  if (!player()) return "local";
  const st = saves.state();
  if (st === "error" || st === "read-blocked") return "offline";
  if (st === "loading" || st === "foreign") return "syncing";
  if (st === "uploading" || saves.status() === "pending") return "saving";
  return "synced";
}
export function flush(): void { void saves.flush().catch(() => undefined); }

// --- the game's options ---------------------------------------------------------------
export const settings: Settings = { ...Prog.DEFAULT_SETTINGS };
const KEYS = Prog.SETTING_KEYS;
const settingsListeners = new Set<() => void>();
export function onSettingsChange(fn: () => void): void { settingsListeners.add(fn); }
function settingsChanged(): void { for (const fn of settingsListeners) fn(); }
function check(key: Key, v: unknown): boolean | undefined { return Prog.pickSettings({ [key]: v })[key]; }
function readSetting(key: Key): void {
  let v: JsonValue | undefined;
  try { v = store.get(key); } catch { return; }
  const ok = check(key, v);
  if (ok !== undefined) settings[key] = ok;
}
/** A migrated value, kept unless this game set the key since. */
function adoptSetting(key: Key, value: unknown): void {
  const v = check(key, value);
  if (v === undefined) return;
  try {
    if (store.get(key) !== undefined) return;
    store.set(key, v);
    settings[key] = v;
    settingsChanged();
  } catch { /* keep the device's */ }
}
/** Changes one of the game's options (device and account). */
export function setSetting(key: Key, value: boolean): void {
  if (settings[key] === value) return;
  settings[key] = value;
  try { store.set(key, value); } catch (e) { console.warn(`setting ${key}: ${String(e)}`); }
  settingsChanged();
}
// The browser build patched its whole settings object into the account's settings KV key by key
// (plus the language helper's ui.language): the game's options carry over (unless this game set them
// since), then all of them are removed.
function importLegacy(): void {
  const keys = store.legacyKeys();
  if (!keys) return;
  for (const key of keys) if ((KEYS as string[]).includes(key)) adoptSetting(key as Key, store.legacy(key));
  for (const key of keys) if (Prog.BROWSER_KEYS.includes(key)) store.removeLegacy(key);
}

/** Reads the device's save and the game's options (from onStart). */
export function initPlatform(): void {
  const cur = saves.load();
  lastSavedAt = cur?.savedAt ?? 0;
  live = Prog.normalize(cur?.data ?? null);
  for (const k of KEYS) readSetting(k);
  store.onChange((key) => {
    if (!(KEYS as string[]).includes(key)) return;
    readSetting(key as Key);
    settingsChanged();
  });
  store.onLegacy(importLegacy);
  importLegacy();
  if (saves.state() === "foreign") migrateForeign();
  settingsChanged();
  refreshPlayer();
  void serverTime().catch(() => undefined);
}

// --- the player and the clock ------------------------------------------------------
export function signedIn(): boolean { return !!player(); }
export function displayName(): string { return player()?.displayName ?? ""; }
let invite: string | null = null;
/** The invite link, fetched ahead so a button press can copy it at once. */
export function inviteLink(): string | null { return player() ? invite : null; }
function refreshPlayer(): void {
  invite = null;
  board = undefined;
  if (!player()) return;
  fetchInviteLink().then((u) => { invite = u; }, () => { invite = null; });
}
onPlayerChange(() => refreshPlayer());

/** Now in ms by the platform's clock when it has answered, else the device's. */
export function nowMs(): number {
  try { return serverNow() ?? Date.now(); } catch { return Date.now(); }
}

// --- leaderboards --------------------------------------------------------------------------
let board: Leaderboard | null | undefined;
async function highScoreBoard(): Promise<Leaderboard | null> {
  if (board !== undefined) return board;
  const list = await leaderboards.list();
  board = list.find((b) => b.key === "high-score") ?? list[0] ?? null;
  return board;
}
/** The top entry of the game's board and how many were read (the Daily results line); null when unavailable. */
export async function readTop(): Promise<{ name: string; score: number; shown: number } | null> {
  try {
    const b = await highScoreBoard();
    if (!b) return null;
    const r = await leaderboards.entries(b.id, { pageSize: 10 });
    const top = r.items[0];
    if (!top) return null;
    return { name: top.displayName || top.username, score: top.score ?? 0, shown: Math.min(10, r.items.length) };
  } catch { return null; }
}

/** Signed in only: post a finished round's total through score-script.js; { posted, rank }. Never rejects. */
export async function postLeaderboard(total: number): Promise<{ posted: boolean; rank: number | null }> {
  const me = player();
  if (!me) return { posted: false, rank: null };
  const score = Math.max(0, Math.round(total));
  let accepted: string[] = [];
  try {
    const sessionId = await sessions.practice();
    accepted = await new Promise<string[]>((resolve) => {
      const socket = connectGame(sessionId);
      let done = false;
      const finish = (list: string[]): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.close();
        resolve(list);
      };
      const timer = setTimeout(() => finish([]), 15000);
      socket.on("open", () => { socket.sendCommand({ type: "result", scores: { "high-score": score } }); });
      socket.on("game", (data) => {
        const d = data as { type?: string; accepted?: string[] } | null;
        if (d && d.type === "result-ack") finish(Array.isArray(d.accepted) ? d.accepted : []);
      });
      socket.on("error", () => finish([]));
      socket.on("stopped", () => finish([]));
      socket.on("abandoned", () => finish([]));
    });
  } catch { return { posted: false, rank: null }; }
  if (!accepted.includes("high-score")) return { posted: false, rank: null };
  try {
    const b = await highScoreBoard();
    if (!b) return { posted: true, rank: null };
    const r = await leaderboards.entries(b.id, { pageSize: 100 });
    const mine = r.items.find((e) => e.userId === me.userId);
    return { posted: true, rank: mine ? mine.rank : null };
  } catch { return { posted: true, rank: null }; }
}
