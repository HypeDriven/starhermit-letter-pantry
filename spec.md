# Letter Pantry — Game Design Document

**Status:** running spec. Describes the game as it ships today; present tense throughout.
Anything the design wants but the code does not yet do is confined to §17.

---

## 1. Overview

**Pitch.** A tray of letter biscuits sits on a pantry shelf. Rearrange them until every word
hiding in that tray has been served.

| | |
|---|---|
| Genre | Single-player anagram / word-finding puzzle |
| Players | 1, with asynchronous daily leaderboard comparison |
| Session | 90 s (Journey stage 1) to ~5 min (hard Daily); a full Journey run is ~2 h |
| Platforms | Desktop and mobile browsers, portrait and landscape |
| Rendering | Three.js WebGL scene for the pantry and biscuits, **plus** a complete semantic-HTML control layer. The canvas is decoration; the DOM is the game. |
| Entry point | `index.html` (declared as `launch` in `starhermit.txt`) |

### File map

| File | Responsibility |
|---|---|
| `index.html` | Shell: canvas `#game-canvas`, `#ui-root`, import map (`three`, `three/addons/`), ES-module bootstrap, `THREE` global bridge |
| `bootstrap.js` | App state machine, module wiring, progression, achievements, local daily bests, cloud-sync hooks, error recovery |
| `starhermit-sdk.js` | Shared StarHermit client (unmodified copy) |
| `platform.js` | Adapter over the SDK: hosted flag, nickname, cloud-save mirror + sync status, settings KV, key bindings, sign-in/invite, read-only leaderboard |
| `sh-strings.js` | Account strings in the nine locales |
| `rules.js` | Pure deterministic rules engine: RNG, commands, scoring, undo, serialization, replay. No DOM, no timers |
| `content.js` | Versioned content: dictionary-derived stages, lessons, journey table, challenges, daily generator, themes, achievements, offline validator |
| `session.js` | Session orchestration: command ids, monotonic clock, replay envelope, checksummed `localStorage` |
| `ui.js` | Every screen, overlay, control and ARIA live region; settings persistence, including the Graphics section |
| `render.js` | Three.js presentation layer: pantry scene, biscuits, particles, lighting, lazily loaded post-processing, adaptive resolution; applies graphics settings live; no-ops entirely if WebGL or `THREE` is absent |
| `gfx.js` | Pure graphics quality model: presets, per-category tiers, GPU detection, `resolve()`, `choosePreset()`, `presetTier()`, `describe()` |
| `gfx-i18n.js` | Graphics-section strings in the nine product locales, picked from `navigator.language` |
| `vendor/` | `three.module.min.js` (r170) and `three/addons/` (r170 post-processing passes, shaders, `RoomEnvironment`) |
| `audio.js` | WebAudio: sample one-shots from `sfx/`, synth fallbacks, three buses, adaptive music bed |
| `words.js` | The shipped dictionary (`WORDS`, `WORD_SET`) |
| `server.js` | Local dev backend (static hosting + `/api/v1/*`: time, daily, score, leaderboard, achievements; the client no longer calls these); plain Node script, not a platform game script |
| `style.css` | Layout, palette, responsive breakpoints, accessibility classes |
| `assets/` | `title-backdrop.webp`, `results-tray.webp` |
| `sfx/` | 15 Opus clips + `manifest.txt` (canonical), `manifest.md`, `manifest.json` |
| `data/` | Server-side stores (`leaderboard.json`, `achievements.json`); gitignored, API-only |
| `tests/` | `run-tests.mjs` (22 unit/integration tests), `e2e.mjs` (Playwright playthrough) |
| `coverart.png` | 1200×675 store key art |

---

## 2. Design pillars

**1. The tray is the whole board.** Between three and eight letters, one row, always fully
visible. *Rules in:* every legal move is one tap away and needs no scrolling, no camera control,
no hidden information. *Rules out:* letter bags, draws, refills, boards larger than the tray,
and any mechanic that would require the player to remember something off-screen.

**2. Wrong answers are cheap and instructive.** An invalid submission costs 25 points and
resets the streak — never a life, never the round. *Rules in:* free experimentation, "just try
it" as a valid strategy, a friendly `round-failed` cue instead of a punitive one. *Rules out:*
timers that kill you, three-strikes rules, and difficulty expressed as fear.

**3. Every word the tray can make counts for something.** Targets are required; everything else
the dictionary accepts from those letters is a scoring bonus word. *Rules in:* rewarding
vocabulary beyond the goal, a bonus counter always on screen. *Rules out:* "not a word in this
puzzle" dead ends for words a player legitimately knows and the tray can legitimately spell.

**4. Solvability is proven, not hoped for.** Every stage's targets are derived from the shipped
dictionary by seeded selection from words provably formable from the tray, then re-checked by
`validateContent()` at boot and in `npm test`. *Rules in:* deterministic generation, replayable
seeds, server-side score revalidation with the same module. *Rules out:* hand-typed word lists,
live dictionary services, and any daily puzzle that can be unwinnable.

**5. The 3D pantry is atmosphere with a zero-cost exit.** *Rules in:* warm baked lighting, lift
and glow on selection, celebratory bursts. *Rules out:* any state readable only from the canvas.
`render.js` returns a null renderer when `THREE` or WebGL is missing and the game is unchanged
except for a `.lp-compat` notice.

---

## 3. Player experience

**Target player.** Someone who does the newspaper anagram over coffee. Comfortable with words,
not looking for reflexes, likely on a phone.

**First 60 seconds.** The title screen offers **Play** (autofocused), Daily, Journey, *How to
play* and Settings over the pantry key art. Two routes teach:

- **Play → Journey → Stage 1** is `TEA` scrambled to `EAT`: three letters, three targets, no
  move limit, all tools on. The HUD states the goal in a sentence ("Find all 3 target words
  (0 found)"), shows one blanked slot per target (`_ _ _`), and disables every illegal action —
  Submit stays greyed until three letters are picked, teaching the minimum word length without a
  line of tutorial prose. A pick lifts, glows and knocks; a target fills its slot, chimes and
  bursts particles.
- **Play → Learn** gates each of three lessons' steps on the player performing the action itself
  (`select`, `deselect`, `clear`, `undo`, `shuffle`, `hint`, `submit`), tracked in a dashed box
  in the left rail.

*How to play* is reachable from the title and any pause menu, and states the scoring formula
verbatim.

**Session shape.** Mode → 3 s countdown → 1–5 min of pick/submit with occasional shuffle and hint
→ results with a six-row breakdown → Retry, Next stage, or title. A round in progress survives a
reload: the title offers *Resume saved round*.

**The emotional beat.** The moment the tray stops looking like noise. Shuffle exists purely to
manufacture it: the same seven letters in a new order regularly hands the player a word they had
been staring past for a minute.

---

## 4. Core loop and rules contract

Owner of all of this: `rules.js`. Nothing else mutates game state.

### State

`createState(descriptor)` (`rules.js`) builds: `letters[]` (3–8 lowercase chars), `targets[]`,
`bonus[]`, `selected[]` (indices, in pick order), `foundTargets[]`, `foundBonus[]`,
`invalidCount`, `movesUsed`, `hintsUsed`, `hintReveals{word:[positions]}`, `streak`,
`bestStreak`, `score{}`, `tick`, `status`, `terminalReason`, `elapsedMs`, `rngRulesState`,
`history[]`. `mechanics` = `{moveLimit, undo, shuffle, hints}`; `par` = `{timeMs, moves}`.

### Legal actions

`listActions(state)` is the single source of truth, and both the UI's button-enabling and the
tutorial gate call it. With `status !== 'active'` it returns `[]`. Otherwise:
`select{index}` for each unselected letter, `deselect{index}` for each selected one,
`clear` and `submit` (the latter only at ≥3 selected) when the hand is non-empty,
`shuffle` unless `mechanics.shuffle === false`, `undo` when allowed and `history` is non-empty,
`hint` while `hintsUsed < mechanics.hints`, and always `resign`.

### Resolution order — `applyCommand(state, cmd)`

1. Reject non-`tick` commands when `status !== 'active'`.
2. Adopt the session's `elapsedMs` stamp if it is finite, larger than the current value, and ≤ 24 h.
3. Push an undo snapshot (all commands except `tick`, `undo` and `resign`; `history` is capped at
   `MAX_HISTORY = 200` so persisted snapshots stay small).
4. Apply the command's own effect.
5. On `submit`: `movesUsed++`, then classify the word — target, bonus, or invalid — and clear the hand.
6. `recomputeScore(state)`.
7. Terminal check: all targets found → `completed`; else `movesUsed >= moveLimit` → `out-of-moves`.
8. `tick++`, re-sync the RNG state, recompute score, return `{ok, events}`.

Failures return `{ok:false, reason}` and never throw; `ui.js` maps each reason to a sentence
announced on the assertive live region ("Words need at least 3 letters.").

`shuffle` clears the selection (index-based selection cannot survive a permutation). `hint`
reveals one further position of a randomly chosen unfound target, and is undoable. `undo`
restores the previous snapshot and drops the cached RNG so it is rebuilt from `rngRulesState` —
undo is exactly reversible, randomness included.

### Scoring

| Component | Formula |
|---|---|
| Target word | `100` each |
| Length bonus | `25 × max(0, len − 3)` per target word |
| Bonus word | `50 + 10 × max(0, len − 3)` |
| Streak | `+15 × (streak − 1)` accrued on each consecutive found word (any invalid resets `streak` to 0) |
| Invalid penalty | `−25 × invalidCount` |
| Time bonus | on `completed` only: `round((par.timeMs − elapsedMs) / 1000) × 5`, never negative |

**Worked example** — Journey stage 1, tray `EAT`, targets `ate`/`eat`/`tea`, par 180 s, solved in
~1 s with no invalid submissions (this is the e2e run):
target `3 × 100 = 300`; length `0` (all three-letter); bonus `0`; streak `15×1 + 15×2 = 45`;
penalty `0`; time `round(179000/1000) × 5 = 895`. **Total 1240.**

### Terminal states and tie-breaks

`completed` (all targets), `out-of-moves` (`movesUsed >= moveLimit`, hard tier and challenges
only), `resigned`. The daily leaderboard (`server.js`) sorts score desc, then lower `durationMs`,
then earlier timestamp.

### RNG and determinism

`mulberry32` seeded through `fnv1a`. `makeStreams(seed)` yields three independent streams —
`rules` (shuffle, hint choice), `decoration` (jar layout), `av` (pitch variants) — so changing
the visuals can never change gameplay. Only `rngRulesState` is serialized. `hashState()` hashes a
fixed core subset via `stableStringify`; `replay(descriptor, commands)` returns the state plus the
whole hash chain, and `server.js` uses it to revalidate submissions.

---

## 5. Modes and progression

| Mode | Content | Targets | Tools | Ranked |
|---|---|---|---|---|
| **Learn** | 3 authored lessons (`LESSONS`) | 3–5 | all | no |
| **Journey** | 42 stages (`JOURNEY_TABLE`), sequential unlock | 4/6/8 by tier | by tier | no |
| **Daily Pantry** | one stage per UTC date, `deriveDaily(date)` | 6 or 8 | medium/hard tier | **yes** |
| **Practice** | seeded by `floor(now/60000)`, difficulty chosen | by tier | by tier | no |
| **Challenge** | 4 authored constraint stages | 6–8 | restricted | no |

**Tier parameters** (`TIER_PARAMS`, `content.js`):

| Tier | Targets | Min target length | Move limit | Undo | Hints | Par time |
|---|---|---|---|---|---|---|
| easy | 4 | 3 | none | yes | 3 | 180 s |
| medium | 6 | 4 | none | yes | 2 | 240 s |
| hard | 8 | 4 | 14 | **no** | 1 | 300 s |

**Difficulty curve.** The Journey table walks 3–5 letter bases (`tea`, `bread`, `steam`) through
6-letter medium bases (`pantry`, `singer`, `listen`) to 7-letter hard bases (`biscuit`,
`kitchen`, `roasted`). Difficulty rises on four axes at once — letter count, minimum target
length, tool removal, move limit — never by inflating numbers. Stage *n* unlocks when stage *n−1*
is in `progression.completedStages`.

**Challenges.** `RATION` (pantry, 8 moves, no undo, no hints), `RUSH` (stream, 90 s target, no
undo), `NOSHUFFLE` (master, fixed tray, 12 moves), `LARDER` (harvest, 10 moves, no tools at all).

**Daily.** `dailySeed(date) = 'daily:' + ISO date`; the base word is drawn from the non-easy
Journey bases and the tier is hard at ≥7 letters. Client and server run the identical function,
so `server.js` can rebuild any day's descriptor from the seed string alone. UTC date comes from
the device clock. Published seeds are immutable.

**Unlocks and achievements.** Five achievements (`content.ACHIEVEMENTS`): `first_completion`,
`mechanic_mastery` (all lessons), `streak_3` (three completions without a resignation),
`hard_milestone` (a hard Journey stage), `long_term_pantry` (100 cumulative target words).
Unlocks are local — part of the cloud-saved progress doc; no request is made.

---

## 6. Controls and interaction

| Input | Desktop | Mobile |
|---|---|---|
| Pick / unpick a letter | Click the biscuit button, or focus it and press Enter | Tap the biscuit (56 px portrait, 48 px landscape, 64 px desktop) |
| Move between letters | ← → ↑ ↓ within the letter group (wraps) | — |
| Submit | Submit button, or Enter when focus is not on a button | Submit button |
| Unpick last | Backspace | tap the lifted biscuit |
| Clear hand | Escape, or Clear | Clear |
| Shuffle / Undo / Hint | buttons, or U and H | buttons |
| Pause | P, or the Pause button | Pause button |
| Camera reset | R | — (the camera is authored and never moves under player control) |
| Close overlay | Escape | Back / Resume buttons |

Key handling (`UI._onKey`) is active only on the play screen, ignores any chord carrying
Ctrl/Meta/Alt so browser shortcuts survive, and while an overlay is open accepts nothing but
Escape.

**Input locking.** There is none. Commands are rejected on their merits by `listActions`, and
`Session.dispatch` refuses everything but `tick` while paused. Double commits are prevented by
command *identity* — every dispatch carries `sessionId:seq` and repeats return `duplicate` — not
by a debounce timer. Cosmetic animation runs after the logical state has settled and never gates
input.

**Feedback.** A pick lifts and glows the biscuit, sets `aria-pressed="true"`, appends to the
current-word readout and plays `tile-select`. A rejected action announces its reason assertively.
Illegal actions are pre-disabled rather than punished.

---

## 7. Screens and UI flow

```
boot ─▶ title ─┬─▶ mode-select ─┬─▶ journey ──┐
               │                ├─▶ practice ─┤
               │                ├─▶ challenges┼─▶ preparing (3 s) ─▶ play ⇄ pause overlay
               │                └─▶ learn ────┘                        │
               ├─▶ help                                        resolving (900 ms)
               ├─▶ settings                                            │
               └─▶ (resume snapshot) ──────────────▶ play          results ─┬─▶ retry
                                                                            ├─▶ next stage
                                                                            └─▶ title
```

Every transition is logged by `setState(next, reason)` with exactly one owner. `error` is
reachable from any state via the global handler and returns to the title with the round saved.
Overlays (`pause`, `settings`, `help`) are `role="dialog" aria-modal="true"`, autofocus their
first control without scrolling (they open at the top, heading visible), and restore focus to
the invoking element on close.

**Layout.** The play screen is a CSS grid, `left | tray | right`:

- **Desktop (≥1024 px):** objective + slots + lesson box left, score/moves/time and the six
  action buttons right, tray centred and bottom-aligned. Rails cap at 70ch;
  `body.lp-left-handed` swaps them via `grid-area`.
- **Tablet (≤1023 px):** same three columns, narrowed, rail text at 0.9em.
- **Portrait mobile (≤760 px):** restacks to `status / tray / actions`; slots wrap horizontally
  within 34dvh; actions become a wrapping row in the bottom thumb zone.
- **Landscape mobile (≤900 px):** three narrow columns, 48 px biscuits, so the tray is never
  pushed under browser chrome.
- **Large screens (>1600×1000):** `ui-scale.js` sets `--ui-scale` (`min(w/1600, h/1000)`, max 2.5)
  and the whole DOM layer (`#ui-root`, plus the FPS readout) zooms by it, so panels, rails, HUD and
  tray keep their 1600×1000 proportions; the full-viewport 3D canvas is not zoomed. vw/vh lengths
  inside the UI are divided by the scale.

**Safe areas.** `--lp-safe-*` read `env(safe-area-inset-*)` and pad `.lp-play`, `.lp-panel` and
`.lp-compat`; `index.html` sets `viewport-fit=cover`. Panels are `max-height: 100dvh` with
internal scrolling, so nothing is cut off by a virtual keyboard or URL bar.

**Never cut off:** the letter tray, the current-word readout, Submit, and the results total row.

---

## 8. Art direction

**Palette** (`style.css` `:root`, mirrored by the Three.js themes):

| Token | Value | Use |
|---|---|---|
| `--lp-bg` | `#2a1d12` | pantry brown ground |
| `--lp-panel` | `rgba(38,26,16,0.92)` | panel and rail fill |
| `--lp-text` | `#f5e9d5` | body text |
| `--lp-accent` | `#ffc978` | headings, score, selection glow |
| `--lp-accent-dark` | `#8a5f36` | borders, found slots, primary button |
| `--lp-danger` | `#e0705a` | leave-round, errors |
| `--lp-focus` | `#ffe2b0` | 3 px focus ring |
| Biscuit | `#d9a860` on `#8a5f36`, ink `#4a2c12` | DOM letter buttons, matching the 3D material |

High contrast swaps to `#000`/`#fff` with `#ffd700` accent and `#00ffff` focus and drops all
photographic backgrounds. The CVD palette moves the accent to `#4dd2ff` and found slots to
`#1c6a8a` so "found" is never carried by warm/dark alone.

**Themes** (`content.THEMES`, five): Classic Pantry, Midnight Shelf, Orchard Pantry, Berry
Cellar, Frost Larder. Each supplies `bg / shelf / tray / biscuit / letter / accent / key` and
changes materials only — never geometry, layout or rules. A stage picks one deterministically
via `fnv1a(id) % THEMES.length`; the player can override live from Settings.

**Shape language.** Rounded squares everywhere: the biscuit is an extruded rounded-rect with a
bevel, the DOM letter button is a 16 px-radius square, panels are 14 px, buttons 10 px. Jars are
soft cylinders. Nothing in the scene has a sharp corner.

**Typography.** Georgia/serif for the whole interface (a recipe-card voice); Courier New with
0.25em letter-spacing for word slots, so `_ _ _ _` blanks and revealed letters align in a column;
tabular numerals in the score table.

**Motion.** The selection lift settles exponentially (`dt × 14`), frame-rate independent. Idle
biscuits breathe ±0.02 units. Camera "kick" is a decaying offset from a fixed base pose (0.12 on
a target, 0.05 on a bonus, 0.2 on completion) — never a cumulative lerp, so the camera cannot
drift. Celebration sparks are one pooled non-raycastable additive `Points` cloud, capped by the
*particles* tier (off 0 / low 300 / high 800); a second cloud of dust motes (60 / 160) drifts
through the room when ambient motion is on.

**Hero of the screen.** The tray: bottom-centre, largest type on screen above it (the 2em
current word), and the only thing that lifts and glows.

**Reduced motion** (`settings.reducedMotion`) disables idle bob, particle bursts, camera kick,
dust drift and the bulb shimmer in `render.js` (the OS `prefers-reduced-motion` also stills the
ambient animation), and `body.lp-reduced-motion *` kills every CSS transition and animation. Event
*timing* is untouched: the same cues fire, they just do not move.

**Graphics.** The scene is a pantry corner: a board wall, a counter with the biscuit tray, and
two shelves of jars (glass shells over coloured contents, metal lids, paper labels) and tins.
Biscuits in the tray mirror the DOM tray letter-for-letter, lean back so their faces read from
the camera, and lift, glow and ring when picked; on the title screen they spell PANTRY. The camera
pulls back whenever the biscuits would not fit the visible width (portrait phones, side rails on
wide screens). Lighting is ACES filmic tone mapping with sRGB output: a warm key light with PCF
soft shadows whose frustum is fitted to the tray, counter and jar shelf, a hemisphere fill and a
warm pantry bulb that shimmers gently. Optional effects: key-light shadows, image-based
reflections (`PMREMGenerator` + `RoomEnvironment` as `scene.environment`, intensity 0.3), surface
detail (procedural wood-grain and board textures with bump, speckled biscuit dough with a
debossed letter, toasted rims, docking holes and a light clearcoat), GTAO ambient occlusion, bloom
limited to highlights (threshold 0.9: the selection glow and sparks), a colour grade (S-curve,
slight saturation, warm highlights) with vignette, FXAA/SMAA/MSAA anti-aliasing, spark and dust
particles, and ambient motion (idle bob, dust drift, bulb shimmer). The Settings screen's
**Graphics** section offers a quality preset (Auto, chosen from the detected GPU — software
renderers get Low, discrete GPUs and Apple M-series get High, others Balanced, touch-first devices
at most Balanced; Low; Balanced; High; Ultra), a render scale (50–200% of the preset's), a
per-effect override for each of shadows, ambient occlusion, bloom, colour grade, anti-aliasing,
reflections, surface detail, particles and ambient motion ("From preset (…)" by default; choosing
a preset clears overrides), adaptive resolution (steps the resolution down to 60% when frames
average over 26 ms and back up under 14 ms), a frame-rate readout (bottom-left, non-interactive)
and a summary line "GPU · cost · W×H px". Pixel ratio is `min(devicePixelRatio, cap)` × preset scale ×
render scale × adaptive scale, with caps Low 1, Balanced 1.5, High/Ultra 2. Changes apply
immediately without reload and persist in `settings.gfx`; the chosen preset is mirrored to
`data-gfx-preset` on `<body>` and the canvas. The post chain (EffectComposer → RenderPass → GTAO →
UnrealBloom → grade → OutputPass → SMAA/FXAA) is loaded lazily from `vendor/three/addons/` and
only runs when a post effect is on, so Low (no shadows, plain surfaces, no post, no particles,
DPR 1 × 0.85) is cheaper than the previous default. If the post chain cannot load or build, the
scene renders without it and the Graphics section says so.

| Preset | Shadows | AO | Bloom | Grade | AA | Reflections | Detail | Particles | Motion | Scale |
|---|---|---|---|---|---|---|---|---|---|---|
| Low | off | off | off | off | MSAA | off | plain | off | static | 0.85 |
| Balanced | 1024² | off | on | on | FXAA | on | detailed | low | animated | 1 |
| High | 2048² | on | on | on | SMAA | on | detailed | high | animated | 1 |
| Ultra | 4096² | high | on | on | MSAA | on | detailed | high | animated | 1.25 |

**Visual assets the design calls for:** the pantry-shelf key art used as the title-panel backdrop
and as the page backdrop when WebGL is unavailable; a filled-tray illustration for a successful
results screen; store cover art in the same palette. All three ship (§15).

---

## 9. Audio direction

**Philosophy.** A quiet kitchen. Nothing in the mix is louder than a biscuit being set down.
Every cue is an object sound (wood, ceramic, small bells); no synthetic UI beeps except as
fallback.

**Buses** (`audio.js`): `music` 0.6, `effects` 0.8, `ambience` 0.5, each an independent
`GainNode` with its own settings slider, all feeding a master gain. The context starts only on
the first pointer/key gesture and suspends on `visibilitychange`.

**Ambience.** A two-second seeded noise buffer, looped through a 320 Hz lowpass at 0.06 gain —
the room tone of a still pantry.

**Music.** A generative bed, not a track: a four-chord loop (C, Am, G, F) arpeggiated one note
every 420 ms. `setIntensity((targets + bonus×0.5) / targetCount)` is pushed after every command,
so note length and gain grow as the tray empties. It never resolves, and it stops when the tab
is hidden.

**Samples and fallback.** Every event id maps to an Opus clip, lazily fetched, decoded and cached
after the audio unlock. Until the buffer is ready — or forever, if the fetch fails — the event
runs a procedural synth fallback (`_blip` / `_thock`), so the game is never silent and a missing
file is never an error. Pitch variants come from the seeded `av` stream.

**Captions.** Meaningful audio doubles as text: `shuffle`, `submitInvalid`, `wordBonus`,
`wordComplete`, `roundComplete`, `roundFailed`, `hint` and `achievement` all route a sentence
into the polite live region. No information is audio-only.

### SFX event table

This table is the source of `sfx/manifest.txt`.

| event id | file | description | usage context |
|---|---|---|---|
| `select` | `sfx/tile-select.opus` | Wooden letter tile picked up and tapped down; soft knock plus fingertip click | `select` rules event — tap, click or Enter on a letter |
| `deselect` | `sfx/tile-deselect.opus` | Tile set back on felt; muted tap, lower and quieter than the pick-up | `deselect` event — re-tapping a lifted biscuit, or Backspace |
| `clear` | `sfx/tray-clear.opus` | Several tiles swept off a board in one sliding clatter | `clear` event — Clear button or Escape |
| `shuffle` | `sfx/tray-shuffle.opus` | Tiles shaken inside a wooden tray; rattling clicks | `shuffle` event; captioned "Tray shuffled." |
| `uiClick` | `sfx/ui-click.opus` | Crisp small plastic switch press | Delegated cue for every menu/chrome button in `#ui-root`; letters and the five round actions are excluded |
| `submitInvalid` | `sfx/submit-invalid.opus` | Dull rejected stamp: muted thud plus short descending tone | `word-invalid` event; captioned "Not a valid word." |
| `wordBonus` | `sfx/word-bonus.opus` | Tiny brass bell then an upward glockenspiel gliss | `word-bonus` event — a dictionary word that is not a target |
| `wordComplete` | `sfx/word-complete.opus` | Three rising marimba notes with warm wooden resonance | `word-target` event — the primary reward beat |
| `roundComplete` | `sfx/round-complete.opus` | Hand bell rung twice, then a bright harp arpeggio | `terminal` event, reason `completed` |
| `roundFailed` | `sfx/round-failed.opus` | Three soft falling piano notes and a muted knock | `terminal` event, reason `out-of-moves` or `resigned`; friendly, not punitive |
| `hint` | `sfx/hint-reveal.opus` | Crystal-rim shimmer with a brief rising glint | `hint` event — Hint button or H |
| `undo` | `sfx/undo.opus` | Paper slid back across a wooden table | `undo` event — Undo button or U |
| `roundStart` | `sfx/round-start.opus` | Tray of biscuits set down on a counter: one solid thud, then a settling rattle | Once in `startRound()`, after the HUD mounts; marks preparing → active |
| `achievement` | `sfx/achievement-unlock.opus` | Brass bell, rising three-note celesta figure, shimmer tail | 700 ms into the results screen when a new achievement unlocked; captioned |
| `countdownTick` | `sfx/countdown-tick.opus` | Single dry wooden metronome tick | Once per second on the preparing screen's 3-2-1, in sync with the announced number |

All clips: MOSS-SoundEffect v2.0, 48 kHz mono Opus, 96 kbps VBR, loudness-normalised (I=−20,
TP=−2), 100 inference steps.

---

## 10. Localization

The product requires en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR and it-IT.

**Today:** the game ships **en-US only**, except the Graphics settings section, whose strings
(`gfx-i18n.js`) exist in all nine locales and follow `navigator.language`. `index.html` declares `lang="en"`; every interface
string is an inline literal in `ui.js`, `content.js` (achievement and lesson copy) and
`bootstrap.js`; there is no string catalogue, no locale detection, and no `Intl` formatting.

Two properties do already hold and constrain the eventual implementation:

- **The dictionary is content, not UI.** Word validation is English by construction
  (`words.js` + the derived target lists). A localized build needs a per-locale dictionary and a
  new `CONTENT_VERSION`, because `descriptorFromSeed()` on the server must reproduce the exact
  same targets. Translating the interface must therefore never silently change the word set.
- **Layout is already expansion-tolerant.** Buttons are `min-height: 44px` with `padding` rather
  than fixed widths, rails cap at 70ch and scroll, and the mode grid is
  `auto-fit minmax(220px, 1fr)`, so a ~35% German expansion reflows instead of clipping.

The remaining work is tracked in §17.

---

## 11. Accessibility

- **Keyboard-only path, end to end.** Title → mode → stage → pick letters (arrow keys + Enter) →
  Submit (Enter) → results → next stage, with no pointer at any step. Each screen autofocuses
  `[data-autofocus]` or its first button.
- **Focus.** A 3 px `--lp-focus` ring on `:focus-visible` everywhere. Overlays autofocus and
  restore focus to the element that opened them.
- **Announcements.** Two live regions: polite (`#lp-live`, `role="status"`) for round narration,
  assertive (`#lp-alert`, `role="alert"`) for rejections and results. `#lp-board-model` is a
  hidden, continuously updated one-sentence board summary — tray letters, selection, targets
  found, score — instead of a description of the 3D scene. Letter buttons carry `aria-pressed`
  and `aria-label` ("Letter T"); slots are a `role="list"` reading "Unfound word, 4 letters" or
  "Found: team".
- **Color is never the only channel.** A found slot changes fill *and* prints the whole word
  where it printed blanks; a selected biscuit lifts, rings and reorders.
- **Contrast.** `#f5e9d5` on `#2a1d12` is ~11:1, accent on panel ~8:1; high contrast goes to
  black/white with a gold accent.
- **Reduced motion** per §8, preserving event timing. **Target sizes:** every button ≥44×44 CSS
  px, biscuits 64/56/48 px with a 10 px gap.
- **Other options.** Larger text (1.2×), CVD-safe palette, left-handed rail swap, haptics off,
  tutorial-prompt replay, three volume sliders, the Graphics section (§8) — all persisted through
  checksummed `localStorage`.
- **No audio-only gameplay.** Every sound has a caption or an equivalent visual state.

---

## 12. StarHermit integration

Manifest (`starhermit.txt`): `name=Letter Pantry`, `launch=index.html`, `owner=<uuid>`,
`server=server.js`, `cover=cover.jpg`. Conventions per <https://wiki.starhermit.com/>.

Manifest also lists one `control.<action>=<Code>[+<Code>] | <Label>` line per keyboard action
(next, prev, submit, unpick, clear, pause, undo, hint, camera).

All platform calls go through the shared client `starhermit-sdk.js` (loaded before the game
modules) via the adapter `platform.js`. Without a launch token nothing calls the platform.

**Used (on-platform).**

| Feature | How |
|---|---|
| Launch token + renewal | `StarHermit.init()` reads `#game_token=` (library launch) or `#access_token=` (sign-in return), strips it, and renews it before expiry. If renewal is refused the game toasts "signed out", hides the invite button and keeps playing and saving locally |
| Sign-in | On `<id>.starhermit.com` without a token the title shows **Sign in with StarHermit** (`StarHermit.signIn()`); hidden when signed in and when running locally |
| Profile | Profile `nickname` (fallback `Player <id prefix>`) shown with the sync status on the title screen and in the play HUD; `/api/v1/me` is never called and usernames are never displayed |
| Cloud save | The five progress keys are mirrored to the `game:<slug>` cloud-save slot: remote-preferred load at boot, 2 s debounce after every persisted change, keepalive flush on `pagehide`/hidden tab; localStorage stays the offline cache |
| Settings KV | All preferences (volumes, graphics, reduced motion, high contrast, larger text, colour-vision palette, left-handed, haptics, tutorial prompts) are patched to the per-player settings store on change (changed keys only); at boot the stored values override local ones |
| Controls | Keyboard input is routed by `event.code` through `StarHermit.loadBindings()` (defaults = the manifest `control.*` lines); the Help "Keyboard" card lists the effective keys |
| Invite link | Signed-in players get **Invite a friend** on the title, copying `StarHermit.inviteLink()` with a confirmation toast |
| Leaderboards | Read-only: the Daily results line shows the top entry of the game's first platform board when one exists (`StarHermit.leaderboard()`, names via profiles); otherwise only local records show. Daily personal bests live locally (in the cloud-saved doc) |
| Achievements | Local only (part of the cloud-saved progress doc); `server.js` is a standalone Node host, not a platform game script, so there is no server-owned unlock path |

Account strings (sign-in, invite, toasts) are localized in the nine locales (`sh-strings.js`).

**Standalone (no launch token).** The client makes no request to any `/api` or `/ws` route:
device clock, daily bests and achievements kept locally, results read "Score kept on this
device". `server.js` still implements time, daily, replay-validated score, leaderboard and
achievements routes, exercised only by `tests/run-tests.mjs`.

**Not used.** No platform sessions, presence, party, chat, matchmaking, friend-picker invites,
replays or real-time multiplayer (single-player game, no platform game script); clients can
never submit scores to a platform leaderboard (script/elo-owned, read-only by design). With
no launch token and no dev backend the game runs identically: the Daily uses the local UTC
date, progression stays in `localStorage`, and results say "Leaderboard unavailable — score
kept locally."

---

## 13. Technical architecture

**Dependency direction.** `rules.js` depends on nothing; `content.js` on `rules.js` + `words.js`;
`session.js` on both. `ui.js`, `render.js` and `audio.js` see state only as immutable snapshots.
`bootstrap.js` is the only module that knows all of them, and `server.js` dynamically imports
`rules.js` and `content.js` so client and server share one implementation.

**Determinism and replay.** Content is derived, never hand-listed: `pickTargets` shuffles the
formable-word pool with `mulberry32(fnv1a('stage:' + seed + ':' + base))`. Given a descriptor and
a command list, `replay()` reproduces the exact state and hash chain — asserted across seeds in
`npm test` and relied on by the score endpoint.

**Persistence** (`session.js`). Keys are prefixed `letter-pantry:`; every record is
`{v, checksum, body}` with an FNV-1a checksum, so a corrupted or downgraded record reads as
`null` instead of crashing. Keys: `settings`, `progression`, `tutorial`, `stats`, `achievements`,
`boards` (daily personal bests by seed), `last-snapshot`. A terminal round *clears*
`last-snapshot` rather than saving a dead board. On-platform, `platform.js` mirrors the five
progress keys (`progression`, `tutorial`, `stats`, `achievements`, `boards`) into the cloud
slot, remote-wins on load; localStorage remains the authoritative offline cache.
Storage failure (private mode) is caught and the game continues unsaved.

**Clock.** `Session.elapsedMs()` accumulates `performance.now()` deltas across pauses; every
dispatched command carries that stamp, so the round clock — and therefore the par-time bonus —
is identical under replay.

**Performance budgets.** One `requestAnimationFrame` loop that returns immediately when
`document.hidden` or the context is lost, `dt` clamped to 50 ms. Geometry is rebuilt only when
the letter string changes; letter textures are cached per letter+theme; particles are one
fixed-size buffer with `setDrawRange`. Every mesh, material, geometry and texture is disposed in
`dispose()`. Undo history is capped at 200 snapshots.

**Failure handling.** `webglcontextlost` is prevented, announced, and the scene rebuilt from the
last snapshot on restore. Missing `THREE`/WebGL yields a null renderer, a `.lp-compat` notice and
a hidden canvas. Missing or failing post-processing addons fall back to direct rendering with a
note in the Graphics section and no console output. The global `error` handler ignores resource-load failures (a 404 audio clip must
not eject a player mid-round) and offers a recoverable error screen for script errors, saving the
round first.

**How the e2e drives the real UI.** `tests/e2e.mjs` starts its own `node:http` static server on an
ephemeral port (the repo's `server.js` is the platform script, not a dev server) and drives
headless Chrome via `playwright-core`, clicking only visible controls — buttons by accessible
name, `.lp-letter` biscuits by index, real key presses. It imports `JOURNEY` solely to know
*which* biscuits to click, and runs twice: 1280×800, then a fresh 390×844 touch context. Any
console error, warning or `pageerror` that is not documented GPU noise fails the run, and so
does any same-origin `/api` or `/ws` request during the standalone pass.

---

## 14. Testing and acceptance criteria

**`npm test` → `tests/run-tests.mjs`, 22 tests, no framework.** It verifies: the three terminal
states; undo and hint semantics; serialization round-trip and the v0→v1 migration; deterministic
replay across many seeds (property loop); a malformed-command fuzz that must neither throw nor
hang; that command stamps drive the round clock and par-time bonus; that practice seeds
round-trip through `descriptorFromSeed`; that `validateContent()` passes every authored stage and
a sample of dailies; idempotent duplicate-command rejection; envelope hashes and terminal result;
platform adapter behavior over the real SDK with a stubbed fetch (fragment token read + strip,
Bearer, profile nickname, `game:<slug>` cloud-save round-trip, settings KV changed-key patch,
invite link, zero fetches standalone, sign-in offered on the platform host); client/server daily parity; that score validation accepts a valid replay and rejects a
tampered one; that the server blocks path traversal and 404s as JSON; and the graphics model —
`detectPreset` on sample GPU strings (software → Low, discrete/Apple M → High, touch capped at
Balanced), `resolve()` with presets, overrides, invalid values and the 50–200% scale clamp,
`choosePreset()` clearing overrides, and Graphics strings present in all nine locales.

**`npm run test:e2e` → `tests/e2e.mjs`**, both viewports, 14 steps: title renders its four named
buttons; settings open, reduced motion reaches `<body>`, the music slider responds to a real key
press and the theme row is populated; in the Graphics section Auto reads "detected: Low" on the
software GPU, Ultra applies (4096² shadows in the summary) without console noise, Low then High
set `data-gfx-preset`, a shadows override shows "no shadows" in the summary, the render-scale
slider answers a key press, the frame-rate readout appears, the section fits the viewport, and
preset + override + toggle survive a reload, after which choosing Auto clears the override; help opens and
closes; mode select shows 5 cards with Practice/Challenge/Learn rendering ≥3/4/3 clickable
buttons; the Journey list shows 42 stages with exactly 1 unlocked; the countdown leads to a HUD
with the right biscuit count and all five action buttons; a click selects and Escape clears; Hint
reveals a slot letter and Shuffle leaves the tray usable; targets are solved by clicking
biscuits; P pauses, the settings overlay opens, Resume returns to play; a full reload plus
*Resume saved round* preserves the Journey context; the round completes to "Pantry stocked!" with
a 7-row table whose total matches the announced total; progression persists and no resumable
snapshot lingers; Next stage starts stage 2; pause → leave returns to a title showing
`Journey (1/…`.

**QA bar** (from `agents/qa.md`), as checkable statements:

1. A first-time player is taught: Learn gates each lesson step on the action itself, Submit is
   disabled until the word is long enough, and *How to play* states the scoring formula. ✔
2. Every implemented feature is reachable in the browser through visible controls — all five
   modes, all five themes, every setting, pause, resume, retry, next stage. ✔
3. No console errors or warnings during a full playthrough at either viewport, including with the
   Ultra preset; the e2e fails on any that are not documented GPU noise. ✔
4. No text or control is cut off at 1280×800 or 390×844: panels scroll internally within
   `100dvh`, rails cap at 34dvh in portrait, safe-area insets pad every edge. ✔
5. Features that could use StarHermit do: time, daily, score validation, leaderboard,
   achievements (§12). ✔
6. Localization: **not met** — en-US only (§10, §17).

---

## 15. Asset inventory

| Path | Purpose | Source | Status |
|---|---|---|---|
| `assets/title-backdrop.webp` | 1536×864 pantry key art; title-panel backdrop under a dark gradient, and the page backdrop when WebGL is unavailable | FLUX.2 klein, seed 4271, 28 steps, WebP q80 (51 KB) | generated this pass, wired in `style.css` |
| `assets/results-tray.webp` | 1024×768 filled-tray illustration on the successful results screen | FLUX.2 klein, seed 8813, 28 steps, WebP q80 (54 KB) | generated this pass, wired in `ui.js` (`.lp-results-art`, self-removing on error) |
| `coverart.png` | 1200×675 store cover (`cover=` in `starhermit.txt`) | FLUX.2 klein seed 4271, downscaled, 160-colour palette (357 KB) | replaced this pass (the previous file was a generic green template) |
| `favicon.svg`, `icon.png` | Tab and launcher icons | hand-authored | shipped |
| `sfx/tile-select.opus` … `sfx/undo.opus` (12 clips) | Core interaction and outcome cues | MOSS-SFX v2.0 | shipped |
| `sfx/round-start.opus` | Round-start tray thud | MOSS-SFX v2.0, 100 steps | generated this pass, wired (`PantryAudio.roundStart`) |
| `sfx/achievement-unlock.opus` | Achievement flourish on results | MOSS-SFX v2.0, 100 steps | generated this pass, wired (`PantryAudio.achievement`) |
| `sfx/countdown-tick.opus` | Preparing-screen 3-2-1 tick | MOSS-SFX v2.0, 100 steps | generated this pass, wired (`PantryAudio.countdownTick`) |
| `sfx/manifest.txt` | Canonical clip → event → description → context mapping | authored | shipped |
| `sfx/manifest.json` | Generator entries (name, seconds, prompt, event) for all 15 clips | authored | shipped |
| `sfx/manifest.md` | Human-readable mirror of `manifest.txt` | generated from `manifest.txt` | shipped |
| Music bed, ambience | Adaptive arpeggio and room tone | procedural, `audio.js` | shipped — deliberately not sampled |
| 3D pantry, tray, biscuits, jars | The whole scene | procedural Three.js geometry, `render.js` | shipped — no external models; letter faces, wood grain, boards and dough are procedural canvas textures |
| `vendor/three/addons/` | Post-processing passes, shaders, `RoomEnvironment` | three.js r170 `examples/jsm`, same revision as `vendor/three.module.min.js` | shipped |
| `words.js` | Dictionary | authored | shipped |

No 3D model files and no character animations: the game has no humanoid, and every prop is
cheaper and sharper as procedural geometry driven by the theme palette.

---

## 16. Known limitations

1. **English only.** No i18n layer beyond the Graphics section's string table (§10).
2. **No shared daily board standalone.** The client submits no scores (the `server.js` board
   is test-only). On-platform the board is read-only, identity comes from the
   launch token (nickname shown, progress cloud-saved), and client score submission is
   impossible by design.
3. **Practice seeds churn by the minute.** `derivePractice` is seeded on
   `floor(serverNow / 60000)`, so *Retry* within the same minute repeats the same tray while a
   retry across a minute boundary silently changes it.
4. **Shuffle discards the selection**, because selection is index-based. Undo recovers it.
5. **Bonus words are not listed at the end.** Results show only a count, so a player never learns
   which bonus words they missed.
6. **The Learn lessons match on command type only.** Performing a `submit` of any kind advances a
   step that asked for a bonus word specifically.
7. **No gamepad support.** The spec's ideal input set includes one; only keyboard, mouse and
   touch are implemented.
8. **The 3D tray does not accept clicks.** All input goes through the DOM buttons; the canvas is
   presentation only, so there is no raycasting and no drag-to-spell.
9. **Journey stage 1 has 3 targets, not the tier's 4**, because `TEA` yields only three formable
   three-letter words. The generator takes what the dictionary offers rather than padding.

---

## 17. Design intent not yet implemented

- **Localization to the nine required locales.** Needs a string catalogue extracted from `ui.js`,
  `content.js` and `bootstrap.js`, a locale picker plus `navigator.language` detection, `Intl`
  number and date formatting, and per-locale dictionaries carried by a bumped `CONTENT_VERSION`
  so server-side replay stays exact.
- **Bonus-word review on the results screen**, listing found and missed bonus words.
- **A stable practice seed per retry**, so *Retry* is a genuine retry of the same tray.
- **Direct interaction with the 3D biscuits** (raycast pick and drag-to-spell) as an addition to,
  never a replacement for, the DOM controls.
- **Gamepad navigation** across focusable targets with remappable primary/secondary actions.

## Browser interference

`browser-guard.js` (loaded from `index.html`) suppresses browser UI that gets in the way of play: the right-click context menu, the iOS long-press callout, copy / cut / paste, and page text selection. Text fields (inputs, textareas, selects, contenteditable) keep normal selection, context menu and clipboard behaviour.
