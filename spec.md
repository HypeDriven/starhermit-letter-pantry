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
| Players | 1, with an asynchronous high-score board |
| Session | 90 s (Journey stage 1) to ~5 min (hard Daily); a full Journey run is ~2 h |
| Platforms | The StarHermit engine 1.24.0 (host API 1.21, `engine.minor=19`): natively in the StarHermit client and in desktop and mobile browsers through the engine's web runtime, portrait and landscape |
| Rendering | `starhermit:scene` for the pantry and biscuits, **plus** a complete `starhermit:ui` layer (focus, keyboard, gamepad, touch, screen readers). The scene is decoration; the UI is the game. |
| Entry point | `native/main.ts` (`engine.entry`); browsers open the loader `index.html` that `npm run package` writes (`launch=index.html`) |

### File map

| File | Responsibility |
|---|---|
| `starhermit.txt` | Manifest: engine pin, capabilities (`platform`, `storage`, `clipboard`), `server=score-script.js`, the actions' `control.*` keys and `engine.gamepad.*` buttons |
| `native/main.ts` | State machine (title → modes → lists → preparing → active ⇄ paused → resolving → results), round lifecycle on `session.js`, command dispatch and refusal sentences, Learn lesson gates, progression, achievements, Daily best, score posting, input (actions, typed letters), lifecycle |
| `native/screens.ts` | Every screen, the play HUD and tray, the pause / settings / help dialogs, results and the toast (`starhermit:ui`), with the four layouts |
| `native/render.ts` | The pantry scene: wall, counter, tray, shelves with jars and tins, the letter biscuits, sparks, dust, bulb shimmer, camera fit and kick, post effects per graphics level |
| `native/quality.ts` | The browser build's presets and budgets keyed by the runtime's quality tier |
| `native/audio.ts` | Sample one-shots per event, the rendered arpeggio bed and room tone on the runtime's buses |
| `native/platform.ts` | Save (`saves`) with cloud merge and old-save migration, device storage for the resumable round, the game's options (`settings`), invite link, clock, leaderboard read and score posting |
| `native/i18n.ts`, `i18n.js`, `locales/`, `sh-strings.js` | Localization: the pure `T`/`N` core and per-locale catalogues keyed by the US-English text, account strings, the runtime's interface language |
| `native/style.ts`, `tools/ui-style.css` → `assets/ui-style.json` | The browser build's style sheet, class-based, converted with `starhermit css` (`npm run css`); high-contrast and colour-vision-safe tokens |
| `native/game.ts` | Typed facade over the shared JS modules |
| `rules.js` | Pure deterministic rules engine: RNG, commands, scoring, undo, serialization, replay. No DOM, no timers |
| `content.js`, `words.js` | Versioned content (dictionary-derived stages, lessons, Journey, challenges, Daily/Practice generators, themes, achievements, validator) and the English dictionary |
| `session.js` | Session orchestration: command ids, injectable clock (`setClock`), replay envelope, checksummed snapshot records |
| `progress.js` | Pure progress document: normalise, two-device merge, the browser build's cloud save and account settings |
| `score-script.js` | StarHermit platform script (`server=`): range-checks a finished round's total and posts it to the `high-score` board |
| `server.js` | Local dev backend (static hosting + `/api/v1/*`: time, daily, replay-validated score, leaderboard, achievements); tests only, left out of the package |
| `assets/` | `title-backdrop.webp`, `results-tray.webp`, `ui-style.json` |
| `sfx/` | 15 Opus clips + manifests |
| `tests/` | `run-tests.mjs` (rules, content, session, server), `progress.test.mjs`, `i18n.test.mjs` (+ `i18n-keys.mjs`), `native.mjs` with `native/*.play` |
| `tools/` | `package-web.mjs`, `css.mjs`, `gen-plays.mjs` (play scripts from the content), `browser-play.mjs` (GPU Chrome play) |
| `index.html`, `starhermit-files.json` | The engine's web loader and file index (generated; never edited) |

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
The scene is drawn by `native/render.ts`; every state is also on the UI layer.

---

## 3. Player experience

**Target player.** Someone who does the newspaper anagram over coffee. Comfortable with words,
not looking for reflexes, likely on a phone.

**First 60 seconds.** The title screen offers **Play** (autofocused), Daily, Journey, *How to
play* and Settings over the pantry key art (the 3D pantry behind it). Two routes teach:

- **Play → Journey → Stage 1** is `TEA` scrambled to `EAT`: three letters, three targets, no
  move limit, all tools on. The HUD states the goal in a sentence ("Find all 3 target words
  (0 found)"), shows one blanked slot per target (`_ _ _`), and disables every illegal action —
  Submit stays greyed until three letters are picked, teaching the minimum word length without a
  line of tutorial prose. A pick lifts, glows and knocks; a target fills its slot, chimes and
  bursts particles.
- **Play → Learn** gates each of three lessons' steps on the player performing the action itself
  (`select`, `deselect`, `clear`, `undo`, `shuffle`, `hint`, `submit`), tracked in a lesson box
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

Failures return `{ok:false, reason}` and never throw; `native/main.ts` maps each reason to a sentence
announced assertively to screen readers ("Words need at least 3 letters.").

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
so `server.js` can rebuild any day's descriptor from the seed string alone. The UTC date comes from the platform's clock (`serverNow()`), the device's when offline. Published seeds are immutable.

**Unlocks and achievements.** Five achievements (`content.ACHIEVEMENTS`): `first_completion`,
`mechanic_mastery` (all lessons), `streak_3` (three completions without a resignation),
`hard_milestone` (a hard Journey stage), `long_term_pantry` (100 cumulative target words).
Unlocks are local — part of the cloud-saved progress doc; no request is made.

---

## 6. Controls and interaction

Keys and pad buttons are the manifest's actions; players rebind them in the runtime's Options
(Controls). Defaults:

| Action | Keyboard | Gamepad | Pointer / touch |
|---|---|---|---|
| Pick / unpick a letter | Type the letter (picks the first free biscuit showing it), or focus a biscuit and press Enter | D-pad / stick to a biscuit, South | Click or tap the biscuit (64 px desktop, 56 px portrait, 48 px landscape) |
| Move between letters (`next` / `prev`) | → ↓ / ← ↑ (wrapping; from the letters field → goes to the first biscuit, ← to the last) | Right / Left shoulder | — |
| Submit (`submit`) | Enter in the letters field or with nothing focused | North | Submit button |
| Unpick last (`unpick`) | Backspace | West | tap the lifted biscuit |
| Clear hand (`clear`) | Escape (with an empty hand Escape pauses) | Select | Clear |
| Shuffle | — | — | Shuffle button |
| Undo / Hint (`undo`, `hint`) | U / H | Left / Right trigger | buttons |
| Pause (`pause`) | P, or Escape with an empty hand | Start | Pause button |
| Camera reset (`camera`) | R | Right stick press | — |
| Close a dialog | Escape | East | Back / Resume buttons |

**Typing.** The play screen has a letters field (the runtime's text field, placeholder *Type
letters*): typed text after the keyboard layout and input methods, and on phones the device
keyboard when tapped. On keyboard devices it has the focus whenever a round shows (and again after
any round button or a clicked biscuit); while it holds the keyboard no game actions fire
(engine.minor 17+), so the game reads Backspace, Escape and the arrows itself. Each typed letter
picks the first free biscuit showing it; a letter the tray has no free biscuit for is refused with a
sentence ("No free X biscuit in the tray.") and the invalid cue. With a biscuit or nothing focused,
letter keys type the same way; an action bound to a letter key (U, H, P, R) types while the tray has
the focus and acts when another button has it. Touch-first devices get no automatic focus (no
keyboard pops up). The words are English dictionary words in every interface language.

Key handling ignores chords with Ctrl/Meta/Alt. Enter on a focused button activates it (a focused
biscuit picks), as the browser build's rule "Enter submits when focus is not on a button".

**Input locking.** There is none. Commands are rejected on their merits by `listActions`, and
`Session.dispatch` refuses everything but `tick` while paused. Double commits are prevented by
command identity (`sessionId:seq`), not a debounce. Cosmetic animation never gates input.

**Feedback.** A pick lifts and glows the biscuit (in the scene and on its button), announces it as a
pressed toggle, appends to the current-word readout, plays `tile-select` and gives a short vibration
(unless *Haptics off*). A refused action is announced assertively. Illegal actions are pre-disabled.

---

## 7. Screens and UI flow

```
boot ─▶ title ─┬─▶ modes ─┬─▶ journey ───┐
               │          ├─▶ practice ──┤
               │          ├─▶ challenges ┼─▶ preparing (3-2-1) ─▶ play ⇄ pause dialog (Settings / Help)
               │          ├─▶ daily ─────┤                          │
               │          └─▶ learn ─────┘                    resolving (900 ms)
               ├─▶ help                                             │
               ├─▶ settings                                     results ─┬─▶ retry
               └─▶ (resume snapshot) ──────────────▶ play               ├─▶ next stage
                                                                         └─▶ title
```

Screens are centred panels over the pantry (scrolling inside when taller than the window); Escape
or the pad's East goes back on the menu screens. Each screen focuses its first control (title:
Play; modes: the Journey card's Start; Journey: stage 1; results: Retry). The pause menu, its
Settings and Help are modal dialogs (Back returns to the pause menu; Escape closes; Leave round saves
the round for *Resume saved round*). A hidden window pauses the round's clock and resumes it on
return unless the player paused.

**Layout.** Layouts are picked by the window's logical size (the runtime's UI scale replaces
`ui-scale.js`):

- **Desktop (≥ 1024 px):** objective rail left (300 px: round title, objective, slots, bonus count,
  lesson box), status and actions rail right (260 px: score, moves, time, player line, the six
  buttons), tray bottom-centre (current word, biscuits, letters field). *Left-handed controls* swap
  the rails.
- **Tablet:** the same with 240 / 220 px rails and 0.9× rail text.
- **Portrait phone (≤ 760 px wide):** status on top (title and objective beside wrapping slots, at
  most 34 % of the height, scrolling inside), actions in a wrapping row in the bottom rail, the tray
  above it, 56 px biscuits.
- **Landscape phone (≤ 900 px wide):** 190 px rails, the actions in two columns of tighter buttons,
  48 px biscuits and a smaller current word, rails scrolling inside.

**Never cut off:** the letter tray, the current-word readout, Submit, and the results total row
(results scroll inside on short windows; the tray art shows above 620 px of height).

---

## 8. Art direction

**Palette** (`tools/ui-style.css` tokens, mirrored by the scene's themes):

| Token | Value | Use |
|---|---|---|
| `bg` | `#2a1d12` | pantry brown ground |
| `panel` | `#261a10eb` | panel and rail fill |
| `text` | `#f5e9d5` | body text |
| `accent` | `#ffc978` | headings, score, selection glow |
| `accent-dark` | `#8a5f36` | borders, found slots, primary button |
| `danger` | `#e0705a` | Leave round |
| `focus` | `#ffe2b0` | 3 px focus ring |
| Biscuit | `#d9a860` on `#8a5f36`, ink `#4a2c12` | letter buttons, matching the 3D material |

The runtime's high contrast swaps the tokens to black / white with a `#ffd700` accent and `#00ffff`
focus and drops the photographic backgrounds (title art, results tray). *Color-vision-safe palette*
moves the accent to `#4dd2ff`, danger to `#ff9f1c` and found slots to `#1c6a8a`.

**Themes** (`content.THEMES`, five): Classic Pantry, Midnight Shelf, Orchard Pantry, Berry Cellar,
Frost Larder. A stage picks one via `fnv1a(id) % THEMES.length`; Settings › Themes overrides it live
until the next round starts.

**Shape language.** Rounded squares everywhere: the biscuit is an extruded rounded-rect with a bevel,
the letter button a 16 px-radius square, panels 14 px, buttons 10 px. Jars are soft cylinders.

**Typography.** The serif face for the whole interface (a recipe-card voice), monospace with wide
letter spacing for word slots, so `_ _ _ _` blanks and revealed letters align.

**Motion.** The selection lift settles exponentially (`dt × 14`). Idle biscuits breathe ±0.02 units.
Camera kick is a decaying offset from a fixed base pose (0.12 on a target, 0.05 on a bonus, 0.2 on
completion). Celebration sparks are one pooled additive `Points` cloud, capped by the level's
particles tier (off 0 / low 300 / high 800 × the budget's sparks factor); dust motes (60 / 160) drift
when ambient motion is on. The runtime's reduced motion stills idle bob, sparks, camera kick, dust
drift, bulb shimmer and the hover lift of the letter buttons; event timing is unchanged.

**Graphics.** A pantry corner: a board wall, a counter with the biscuit tray, two shelves of jars
(glass shells over coloured contents, metal lids, paper labels) and tins. Biscuits mirror the tray
letter for letter, lean back to face the camera, and lift, glow and ring when picked; on the title
they spell PANTRY. The camera pulls back whenever the biscuits would not fit the visible width (0.56
of it on wide windows, where the rails sit, else 0.94). ACES filmic tone mapping; a warm key light
(three.js r170 intensities ÷ π) with soft shadows, a hemisphere fill and a warm pantry bulb.

The runtime's Options choose the graphics level (Auto by the device, or a level); its quality tier
picks the browser build's preset and budget (`native/quality.ts`), its level index scales the sparks
within the tier (≤ 2×). Render scale, the pixel-ratio cap, adaptive resolution, the frame-rate limit
and the frame-rate readout are the runtime's; the old per-effect overrides are not offered.

| Tier | Shadows | AO | Bloom | Grade | AA | Reflections | Surfaces | Particles | Motion |
|---|---|---|---|---|---|---|---|---|---|
| Low | off | off | off | off | MSAA | off | plain | off | static |
| Balanced | 1024² | off | on | on | FXAA | on | detailed | low | animated |
| High | 2048² | on | on | on | SMAA | on | detailed | high | animated |
| Ultra | 4096² | high | on | on | MSAA | on | detailed | high | animated |

| Tier | Materials | Wood / letter face / dough texture | Geometry LOD | Sparks | Dust | Bloom / AO resolution |
|---|---|---|---|---|---|---|
| Low | Lambert | 256×128 / 128 / 64 px | ½ | 0.5× | ½ | ½ / ½ |
| Balanced | Standard | 512×256 / 256 / 128 px | ¾ | 0.75× | ¾ | ½ / ½ |
| High | Physical (clear-coated biscuits, glass jars) | 512×256 / 256 / 128 px | 1 | 1× | full | ½ / ½ |
| Ultra | Physical | 1024×512 / 512 / 256 px | 1.5 | 1.5× | full | full / full |

Detailed surfaces: procedural wood grain and boards with bump (starhermit:canvas textures), speckled
dough with docking holes and a debossed letter. Reflections: `RoomEnvironment(renderer)` through
PMREM at the game's environment intensity 0.3. Post: `renderer.ao` (GTAO settings), `renderer.bloom`
(threshold 0.9: the selection glow and sparks), `renderer.grade` (display-space S-curve, +7 %
saturation, warm highlights, 0.3 vignette), `renderer.antialias`. The environment, biscuits and
textures are rebuilt when the tier changes. Gameplay is identical on every level.

---

## 9. Audio direction

**Philosophy.** A quiet kitchen. Nothing in the mix is louder than a biscuit being set down.

**Buses.** The runtime's Options › Audio own the volumes, mute and voice limit. Music plays on
`music`, effects and the room tone on `effects`, the menu click on `interface`; the browser build's
bus levels (music 0.6, effects 0.8, ambience 0.5) are folded into each sound's gain. Clips load once
the mixer runs (in a browser after the first press), one at a time; a hidden window holds the bed and
room tone.

**Ambience.** Two seconds of seeded noise through a 320 Hz low-pass (rendered once into a looping
clip), at 0.06 gain — the room tone of a still pantry.

**Music.** A generative bed: a four-chord loop (C, Am, G, F) arpeggiated one note every 420 ms (sine
notes rendered into clips once); `setIntensity((targets + bonus×0.5) / targetCount)` after every
command raises its level. It never resolves.

**Samples.** Every event id maps to an Opus clip; a clip still loading is silent (the browser
build's synthesized stand-ins are not ported).

**Captions.** Meaningful audio doubles as an announcement: shuffle, invalid word, bonus word,
target word, round complete / over, hint and achievement.

### SFX event table

This table is the source of `sfx/manifest.txt`.

| event id | file | description | usage context |
|---|---|---|---|
| `select` | `sfx/tile-select.opus` | Wooden letter tile picked up and tapped down; soft knock plus fingertip click | `select` rules event — tap, click, Enter or a typed letter |
| `deselect` | `sfx/tile-deselect.opus` | Tile set back on felt; muted tap, lower and quieter than the pick-up | `deselect` event — re-tapping a lifted biscuit, Backspace or West |
| `clear` | `sfx/tray-clear.opus` | Several tiles swept off a board in one sliding clatter | `clear` event — Clear button, Escape or Select |
| `shuffle` | `sfx/tray-shuffle.opus` | Tiles shaken inside a wooden tray; rattling clicks | `shuffle` event; captioned "Tray shuffled." |
| `uiClick` | `sfx/ui-click.opus` | Crisp small plastic switch press | Menu and chrome buttons; letters and the round actions are excluded |
| `submitInvalid` | `sfx/submit-invalid.opus` | Dull rejected stamp: muted thud plus short descending tone | `word-invalid` event; captioned "Not a valid word." |
| `wordBonus` | `sfx/word-bonus.opus` | Tiny brass bell then an upward glockenspiel gliss | `word-bonus` event — a dictionary word that is not a target |
| `wordComplete` | `sfx/word-complete.opus` | Three rising marimba notes with warm wooden resonance | `word-target` event — the primary reward beat |
| `roundComplete` | `sfx/round-complete.opus` | Hand bell rung twice, then a bright harp arpeggio | `terminal` event, reason `completed` |
| `roundFailed` | `sfx/round-failed.opus` | Three soft falling piano notes and a muted knock | `terminal` event, reason `out-of-moves` or `resigned`; friendly, not punitive |
| `hint` | `sfx/hint-reveal.opus` | Crystal-rim shimmer with a brief rising glint | `hint` event — Hint button, H or the right trigger |
| `undo` | `sfx/undo.opus` | Paper slid back across a wooden table | `undo` event — Undo button, U or the left trigger |
| `roundStart` | `sfx/round-start.opus` | Tray of biscuits set down on a counter: one solid thud, then a settling rattle | Once in `startRound()`, after the HUD mounts; marks preparing → active |
| `achievement` | `sfx/achievement-unlock.opus` | Brass bell, rising three-note celesta figure, shimmer tail | 700 ms into the results screen when a new achievement unlocked; captioned |
| `countdownTick` | `sfx/countdown-tick.opus` | Single dry wooden metronome tick | Once per second on the preparing screen's 3-2-1, in sync with the announced number |

All clips: MOSS-SoundEffect v2.0, 48 kHz mono Opus, 96 kbps VBR, loudness-normalised (I=−20,
TP=−2), 100 inference steps.

---

---

## 10. Localization

The product requires en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR and it-IT.

- The language is the runtime's interface language (Options › Language, else the account's preferred
  language or the device's); the game's own Language setting is gone. Every string is drawn through
  `T()` each frame, so a change shows on the next frame and the round is untouched.
- Catalogues in `locales/` are keyed by the US-English text (en-GB lists spelling changes, es-ES and
  fr-CA their differences from es-419 and fr-FR). Content copy (themes, achievements, lessons,
  challenges, tiers, captions, refusals) is English data translated at display time. Account strings
  come from `sh-strings.js`.
- **The dictionary is content, not UI.** Word validation is English by construction (`words.js` +
  the derived targets) in every interface language; typed letters are A–Z. A localized word set would
  need per-locale dictionaries and a new `CONTENT_VERSION` so server-side replay stays exact.
- `tests/i18n.test.mjs` checks every key found in `native/*.ts` and the content in all locales, with
  the same placeholders, and that no locale keeps stale keys.

---

## 11. Accessibility

- **Keyboard and pad path, end to end.** Title → mode → stage → letters (typing, or arrows + Enter,
  or the pad's D-pad + South) → Submit → results → next stage, with no pointer.
- **Focus.** A 3 px focus ring for focus the player sees; screens and dialogs focus their first
  control.
- **Screen readers.** The runtime's accessibility tree: biscuits are toggles named "Letter T"
  (pressed when picked), slots read "Unfound word, 4 letters" or "Found: team", stages "Stage 3:
  steam, easy, locked", and a label summarises the board ("Tray letters …, Selected …, Found 1 of 4
  …, Score …"). Round narration and refusals are announced (polite / assertive).
- **Color is never the only channel.** A found slot changes fill and prints the word; a picked
  biscuit lifts, rings and is announced pressed.
- **Runtime options:** UI and text size (replacing *Larger text*), high contrast, reduced motion,
  volumes, key and pad rebinding.
- **Game options** (Settings › Accessibility, synced with the account): *Color-vision-safe palette*,
  *Left-handed controls* (rails swap), *Haptics off* (short vibrations on picks, words and round
  ends otherwise; the browser build stored this option without using it), *Replay tutorial prompts*
  (off: a Learn lesson already completed starts without its step box).
- **Target sizes:** every button ≥ 44×44 logical px; biscuits 64/56/48 px with a 10 px gap.

---

## 12. StarHermit integration

Manifest (`starhermit.txt`): `name`, `owner`, `server=score-script.js`, `cover=cover.jpg`,
`launch=index.html`, `engine.api=1`, `engine.entry=native/main.ts`, `engine.version=1.24.0`,
`engine.minor=19`, `engine.capabilities=platform,storage,clipboard`, one `control.<action>` and one
`engine.gamepad.<action>` per action (next, prev, submit, unpick, clear, pause, undo, hint, camera).

| Feature | How |
|---|---|
| Player | `starhermit:platform` `player()`: the display name with the sync state on the title and in the HUD; guests play signed out; **Sign in with StarHermit** (`requestSignIn`) on the title for guests; a session that ends toasts "signed out" and play continues |
| Save | The progress document (completed stages, lessons, stats, achievements, Daily bests) is the game's save (`saves`), on the device and in the account; a conflict merges both (union of stages, lessons and achievements, larger counters, best Daily per date: `progress.js merge`) |
| Old cloud saves | The browser build's slot (`game:<slug>`, its JS SDK JSON doc) shows as a foreign save: it is merged in and replaced once (`saveJSON … replaceForeign`) |
| Old settings | The browser build's account settings KV: the game's options carry over, then all its keys (volumes, graphics, `ui.language`, …) are removed |
| Resumable round | `session.js`'s `last-snapshot` stays on the device (device key/value storage, as localStorage before) |
| Game options | `starhermit:storage` `settings` (`game.<key>`, synced with the account) |
| Invite link | Signed in: **Invite a friend** on the title copies `inviteLink()` (clipboard) with a toast |
| High-score board | Every finished round except Learn lessons posts its total through `score-script.js` (a practice session; the socket carries `{ type: 'result', scores: { 'high-score': total } }`, as the JS SDK's `submitScores` did); results then show the rank line (posting / rank / posted / not posted). Guests post nothing |
| Daily board line | Signed in, the Daily results show the top entry of the high-score board ("High-score board: top …"); guests see "Score kept on this device"; the personal best per date is in the save |
| Clock | The Daily's date and Practice seeds use the platform's clock (`serverNow()`), the device's offline |
| Achievements | Local, part of the save; `score-script.js` only posts scores |

Results and leaderboards follow the platform policy: the only recorded result is the score total that
`score-script.js` range-checks and posts (0–20,000); there is no multiplayer.

---

## 13. Technical architecture

**Dependency direction.** `rules.js` depends on nothing; `content.js` on `rules.js` + `words.js`;
`session.js` on both; `progress.js`, `i18n.js` and the locales are pure. The engine client
(`native/*.ts`) imports them unchanged (`allowJs`); `server.js` imports `rules.js` and `content.js`
so validation shares one implementation.

**Time.** The runtime's fixed steps (60 Hz) drive the session clock (`session.js setClock`), the 3-2-1
countdown (a tick each second, the round at 3.2 s) and the 900 ms results delay, so a hidden window
never counts and play scripts replay exactly; every command carries the clock's stamp, as before.

**Determinism and replay.** Content is derived, never hand-listed; `replay(descriptor, commands)`
reproduces the state and hash chain, asserted in `npm test` and used by `server.js`.

**Persistence.** Checksummed `{v, checksum, body}` records (`session.js`) for the resumable round on
the device; the progress document in the engine save; options in engine settings.

**Performance.** Geometry and textures are rebuilt only when the letters, theme or tier change; letter
textures are cached per letter, theme and size; particles are one fixed buffer with a draw range.
Attenuated Points are divided by the window scale each frame (engine bug at minor ≤ 19, fixed at 20).

---

## 14. Testing and acceptance criteria

`npm test` runs:

- `tests/run-tests.mjs`: the rules (terminal states, undo and hint, serialization and migration,
  replay across seeds, a malformed-command fuzz, command stamps and the par bonus), content (practice
  seeds, `validateContent()` on every stage and sample dailies), the session (duplicate ids, the
  envelope, the injected engine clock with pauses, the resumable snapshot restoring meta and finishing
  to no snapshot), and `server.js` (Daily parity, replay-validated scores, path traversal) on free
  ports;
- `tests/progress.test.mjs`: normalising, the symmetric merge, the browser build's cloud save and
  account settings;
- `tests/i18n.test.mjs`: every key in all locales;
- `tests/native.mjs`: the web index matches the files, `tsc` (the engine's `.d.ts`, no
  `skipLibCheck`), `starhermit check .` with no warnings, and every `tests/native/*.play` as a signed-
  out render check that drives the real UI: `journey-stage-1` (an invalid word, Backspace, Escape, the
  three words typed, results with progress and the First Batch achievement, Next stage),
  `challenge-ration` (8 moves, six words), `learn` (all three lessons step by step through clicks,
  typing, Clear, Undo, Shuffle, Hint and a bonus word, to Pantry Scholar), `keyboard-resume` (arrows +
  Enter on biscuits, the tools, Escape pausing, Leave round, Resume saved round to the end), `menus`
  (How to play, Settings options and a theme, the lists, the Daily, the pause dialog's Help and
  Settings). The scripts are generated from the content (`npm run plays`).

`npm run test:browser` (`tools/browser-play.mjs`) loads the packaged loader in Chrome on the
machine's GPU at 1366×768, a 390×844 phone (DPR 3) and an 844×390 landscape phone (DPR 3): Play →
Journey → stage 1, a tapped biscuit on the phones, the words typed and submitted, results, Retry and
Escape to pause; it fails on console errors or warnings or the runtime's error screen.
`~/games/tools/engine-web-smoke.mjs` checks the start at desktop and phone.

---

## 15. Asset inventory

| Path | Purpose | Source |
|---|---|---|
| `assets/title-backdrop.webp` | 1536×864 pantry key art behind the title panel | FLUX.2 klein, seed 4271 |
| `assets/results-tray.webp` | 1024×768 filled-tray illustration on a completed round's results | FLUX.2 klein, seed 8813 |
| `assets/ui-style.json` | The UI styles (`npm run css` from `tools/ui-style.css`) | generated |
| `cover.jpg`, `coverart.png`, `icon.png` | Store cover, key art, launcher icon | authored |
| `sfx/*.opus` (15 clips) | Interaction and outcome cues (§9) | MOSS-SFX v2.0 |
| Music bed, ambience | Arpeggio and room tone | procedural, rendered into clips (`native/audio.ts`) |
| 3D pantry, tray, biscuits, jars | The scene | procedural geometry and canvas textures (`native/render.ts`) |
| `words.js` | Dictionary | authored |

---

## 16. Known limitations

1. **No per-day platform board.** Finished rounds post to the single `high-score` board.
2. **Practice seeds churn by the minute** (`floor(now / 60000)`): *Retry* within the same minute
   repeats the tray, across a minute boundary it changes.
3. **Shuffle discards the selection**, because selection is index-based. Undo recovers it.
4. **Bonus words are not listed at the end.** Results show only a count.
5. **The Learn lessons match on command type only.** Any `submit` advances a step that asked for a
   bonus word.
6. **The 3D tray does not accept clicks.** Input goes through the UI's biscuits and the letters field.
7. **Journey stage 1 has 3 targets, not the tier's 4** (`TEA` yields only three words).
8. **The RUSH challenge's 90-second target is not enforced** (`timeTargetMs` is stored but the rules
   never read it); kept so replays and the server validator stay exact.
9. **Guests' progress from the browser build's localStorage does not migrate** (only cloud saves do);
   the browser build's per-effect graphics overrides are not offered.
10. **The words are English** in every interface language (§10).
11. **Signed-in paths** (foreign-save migration, the board read and score posting) are covered by unit
    tests of their logic; they cannot run in the signed-out checks.

---

## 17. Design intent not yet implemented

- **Bonus-word review on the results screen**, listing found and missed bonus words.
- **A stable practice seed per retry.**
- **Direct interaction with the 3D biscuits** (raycast pick and drag-to-spell) as an addition to the
  UI controls.
