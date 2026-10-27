// The browser build's pure game modules — the deterministic rules (rules.js:
// commands, scoring, undo, hashing, replay), the versioned content
// (content.js: the dictionary-derived Journey stages, lessons, challenges,
// the Daily and Practice generators, themes, achievements; the dictionary
// itself is words.js) and the session with its command ids, replay envelope
// and resumable snapshot (session.js) — imported unchanged (allowJs) and
// typed here with the shapes this client reads.
import * as RulesJs from "../rules.js";
import * as ContentJs from "../content.js";
import * as SessionJs from "../session.js";

export interface Mechanics { moveLimit: number | null; undo: boolean; shuffle: boolean; hints: number; timeTargetMs?: number | null }
export interface Descriptor {
  id: string; seed: string; letters: string; base?: string; tier?: string; targets: string[]; bonus: string[];
  mechanics: Mechanics; par: { timeMs: number; moves: number }; theme: string; index?: number; challenge?: string;
}
export interface Score { target: number; bonus: number; length: number; streak: number; penalty: number; time: number; total: number }
export interface Snapshot {
  letters: string[]; targets: string[]; bonus: string[]; selected: number[]; foundTargets: string[]; foundBonus: string[];
  invalidCount: number; movesUsed: number; hintsUsed: number; hintReveals: Record<string, number[]>; streak: number; bestStreak: number;
  score: Score; status: string; terminalReason: string | null; elapsedMs: number; mechanics: Mechanics; par: { timeMs: number; moves: number };
  theme: string; history: unknown[];
}
export interface Cmd { type: string; index?: number }
export interface GameEvent { type: string; reason?: string; word?: string; index?: number }
export interface Action { type: string; index?: number; pop?: boolean }
export interface Lesson { id: string; title: string; letters: string; targets: string[]; bonus: string[]; steps: { text: string; require: { type: string } }[] }
export interface Theme { id: string; name: string; bg: number; shelf: number; tray: number; biscuit: number; letter: string; accent: number; key: number }
export interface Achievement { id: string; name: string; desc: string }
export interface Meta {
  mode: string; modeLabel: string; modeKey: [string, Record<string, string | number>?]; descriptor: Descriptor; lesson?: Lesson | null;
}
export interface Session {
  descriptor: Descriptor; meta: Meta | null; state: Snapshot; paused: boolean; pauseReason: string | null;
  onEvent(fn: (kind: string, data: { command: Cmd; events: GameEvent[]; state: Snapshot }) => void): () => void;
  elapsedMs(): number;
  pause(reason?: string): void;
  resume(reason?: string): void;
  dispatch(cmd: Cmd): { ok: boolean; reason?: string; id?: string; events?: GameEvent[] };
  snapshot(): Snapshot;
  actions(): Action[];
  saveSnapshot(): boolean;
  verifyReplay(): { ok: boolean; reason?: string; hash?: string };
  dispose(): void;
}

interface ContentApi {
  CONTENT_VERSION: string;
  THEMES: Theme[];
  ACHIEVEMENTS: Achievement[];
  LESSONS: Lesson[];
  JOURNEY: Descriptor[];
  CHALLENGES: Descriptor[];
  PRACTICE_DIFFICULTIES: string[];
  themeById(id: string): Theme;
  deriveDaily(dateISO: string): Descriptor;
  derivePractice(difficulty: string, seedNum: number): Descriptor;
  todayISO(nowMs: number): string;
  validateContent(): { ok: boolean; errors: string[] };
}
interface RulesApi {
  makeStreams(seed: string): { rules: () => number; decoration: () => number; av: () => number };
  fnv1a(s: string): number;
  mulberry32(seed: number): () => number;
}
interface SessionApi {
  Session: new (descriptor: Descriptor, options?: { meta?: Meta | null; autoPause?: boolean }) => Session;
  loadJSON(key: string): unknown;
  clearJSON(key: string): boolean;
  setClock(fn: (() => number) | null): void;
}
interface SessionStatic { restoreSnapshot(): Session | null }

export const Content = ContentJs as unknown as ContentApi;
export const Rules = RulesJs as unknown as RulesApi;
export const Sess = SessionJs as unknown as SessionApi;
export const SessionClass = SessionJs.Session as unknown as SessionStatic;
