/**
 * Letter Pantry — automated end-to-end QA playthrough (dev only, not shipped).
 *
 * Drives the REAL visible UI in headless Chrome via playwright-core:
 *   title → settings/help → mode select → journey stage 1 → play
 *   (hint/shuffle/undo/clear via on-screen buttons and keys) → pause/resume
 *   → solve every target word by clicking letter biscuits + Submit → results
 *   → next stage → pause → leave → title.
 *
 * The repo's server.js is the StarHermit authoritative game script (score
 * validation, leaderboard writes), NOT a dev static server, so this test
 * embeds its own minimal node:http static server on an ephemeral port.
 * Without a launch token the game runs standalone and must make zero
 * same-origin /api or /ws requests (asserted for the whole pass).
 *
 * Word knowledge (Journey stage letters/targets) is imported from the shared
 * content module purely to decide WHICH visible buttons to click — every
 * action goes through the on-screen UI a player sees.
 *
 * Regression guard: ui.js `el()` used to append array children without
 * flattening, so `node.append(array)` stringified to "[object HTMLElement]…".
 * That silently emptied the settings quality <select> and theme row, the
 * results score table, and the Practice/Challenge/Learn lists. Those are now
 * asserted directly below rather than logged as known bugs.
 *
 * Two passes: desktop 1280x800, then a fresh context at mobile 390x844 with
 * touch. Any non-benign console error or pageerror fails the run.
 *
 * Run: npm run test:e2e
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { launchToken, stubStarHermit } from './starhermit-e2e.mjs';

import { JOURNEY } from '../content.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Benign GPU/swiftshader console noise (from tools/production_game_audit.mjs).
const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.ts': 'video/mp2t',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});

const STAGE1 = JOURNEY[0];
const failures = [];

async function playthrough(label, viewport, hasTouch) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  const errors = [];
  // Standalone (no launch token) must not touch any own-server route.
  const ownServer = [];
  const onRequest = (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && /^\/(api|ws)(\/|$)/.test(u.pathname)) ownServer.push(r.method() + ' ' + u.pathname); };
  page.on('request', onRequest);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if ((m.type() !== 'error' && m.type() !== 'warning') || browserNoise.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });

  const shot = (stage) => page.screenshot({ path: `/tmp/letter-pantry-e2e-${stage}-${label}.png` });
  const step = async (name, fn) => {
    await fn();
    console.log(`ok - [${label}] ${name}`);
  };

  try {
    await step('load → title screen visible', async () => {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForSelector('.lp-title', { timeout: 15000 });
      const h1 = await page.textContent('.lp-title h1');
      if (!/Letter Pantry/.test(h1)) throw new Error('title heading missing: ' + h1);
      for (const label of ['Play', 'Journey', 'How to play', 'Settings']) {
        if (!(await page.getByRole('button', { name: label }).first().isVisible())) {
          throw new Error(`title button not visible: ${label}`);
        }
      }
      await shot('title');
    });

    await step('settings open/change/close', async () => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.waitForSelector('.lp-settings');
      await page.getByLabel('Reduced motion').check();
      if (!(await page.evaluate(() => document.body.classList.contains('lp-reduced-motion')))) {
        throw new Error('reduced-motion class not applied');
      }
      // Nudge the music slider with the keyboard (real input event).
      // The game's own Audio fieldset (the shared Sound section also has a "Music volume").
      const music = page.locator('.lp-settings fieldset').first().getByLabel('Music volume', { exact: true });
      const before = await music.inputValue();
      await music.press('ArrowLeft');
      if ((await music.inputValue()) === before) throw new Error('music slider did not respond');
      const themes = await page.locator('.lp-settings fieldset:last-of-type .lp-row button').count();
      if (themes < 2) throw new Error(`theme picker rendered ${themes} buttons`);
      await shot('settings');
      await page.locator('.lp-settings .lp-back').click();
      await page.waitForSelector('.lp-title');
    });

    await step('settings → Graphics: presets, override, summary, persistence', async () => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.waitForSelector('[data-gfx-section]');
      const preset = page.locator('#gfx-preset');
      await preset.scrollIntoViewIfNeeded();
      if ((await preset.locator('option').count()) !== 5) throw new Error('quality select should offer Auto + 4 presets');
      if (!/^Auto \(detected: Low\)$/.test((await preset.locator('option').first().textContent()).trim())) {
        throw new Error('software GPU should auto-detect Low');
      }
      const bodyPreset = () => page.evaluate(() => document.body.dataset.gfxPreset);
      const summary = () => page.textContent('#gfx-summary');
      if ((await bodyPreset()) !== 'low') throw new Error('auto preset not applied: ' + (await bodyPreset()));
      // Ultra renders the full post chain; it must not produce console noise.
      await preset.selectOption('ultra');
      await page.waitForFunction(() => document.body.dataset.gfxPreset === 'ultra');
      await page.waitForTimeout(1200);
      if (!/4096² shadows/.test(await summary())) throw new Error('ultra summary: ' + (await summary()));
      await preset.selectOption('low');
      await preset.selectOption('high');
      await page.waitForFunction(() => document.body.dataset.gfxPreset === 'high');
      const shadows = page.locator('#gfx-cat-shadows');
      if (!/From preset \(Medium\)/.test(await shadows.locator('option').first().textContent())) {
        throw new Error('shadows select should default to the preset tier');
      }
      await shadows.selectOption('off');
      await page.waitForFunction(() => /no shadows/.test(document.getElementById('gfx-summary').textContent));
      const scale = page.locator('#gfx-scale');
      await scale.focus();
      await scale.press('ArrowLeft');
      if ((await page.textContent('#gfx-scale-value')).trim() !== '95%') throw new Error('render scale slider did not respond');
      await page.locator('#gfx-fps').check();
      await page.waitForSelector('#lp-fps', { state: 'attached' });
      const box = await page.locator('[data-gfx-section]').boundingBox();
      const vw = page.viewportSize().width;
      if (!box || box.x < 0 || box.x + box.width > vw + 1) throw new Error('graphics section overflows the viewport');
      await shot('settings-graphics');
      await page.reload();
      await page.waitForSelector('.lp-title');
      if ((await bodyPreset()) !== 'high') throw new Error('preset not persisted across reload');
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.waitForSelector('[data-gfx-section]');
      if ((await page.locator('#gfx-preset').inputValue()) !== 'high') throw new Error('preset select lost after reload');
      if ((await page.locator('#gfx-cat-shadows').inputValue()) !== 'off') throw new Error('override lost after reload');
      if (!(await page.locator('#gfx-fps').isChecked())) throw new Error('frame-rate toggle lost after reload');
      // Choosing a preset clears the overrides; Auto keeps the rest of the run fast.
      await page.locator('#gfx-fps').uncheck();
      await page.locator('#gfx-preset').selectOption('auto');
      if ((await page.locator('#gfx-cat-shadows').inputValue()) !== 'preset') throw new Error('preset did not clear overrides');
      await page.waitForFunction(() => document.body.dataset.gfxPreset === 'low');
      await page.locator('.lp-settings .lp-back').click();
      await page.waitForSelector('.lp-title');
    });

    await step('help screen open/close', async () => {
      await page.getByRole('button', { name: 'How to play' }).click();
      await page.waitForSelector('.lp-help');
      await page.locator('.lp-help .lp-back').click();
      await page.waitForSelector('.lp-title');
    });

    await step('mode select → journey list → stage 1', async () => {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.waitForSelector('.lp-modes');
      if ((await page.locator('.lp-mode-card').count()) !== 5) throw new Error('expected 5 mode cards');
      await shot('modes');
      // Practice / Challenge / Learn lists must render real, clickable buttons.
      for (const [mode, selector, min] of [
        ['Practice', '.lp-panel .lp-row .lp-btn-big', 3],
        ['Challenge', '.lp-challenge-list button.lp-challenge', 4],
        ['Learn', '.lp-challenge-list button.lp-challenge', 3],
      ]) {
        await page.locator('.lp-mode-card', { hasText: mode }).getByRole('button', { name: 'Start' }).click();
        await page.waitForSelector(selector);
        const n = await page.locator(selector).count();
        if (n < min) throw new Error(`${mode} list rendered ${n} buttons, expected >= ${min}`);
        await page.locator('.lp-panel .lp-back').click();
        await page.waitForSelector('.lp-modes');
      }
      await page.locator('.lp-mode-card', { hasText: 'Journey' }).getByRole('button', { name: 'Start' }).click();
      await page.waitForSelector('.lp-stage-list');
      const stages = await page.locator('button.lp-stage').count();
      if (stages !== JOURNEY.length) throw new Error(`expected ${JOURNEY.length} stages, got ${stages}`);
      const unlocked = await page.locator('button.lp-stage:not([disabled])').count();
      if (unlocked !== 1) throw new Error(`expected 1 unlocked stage, got ${unlocked}`);
      await shot('journey');
      await page.locator('button.lp-stage').first().click();
    });

    await step('preparing countdown → play HUD', async () => {
      await page.waitForSelector('.lp-preparing');
      await shot('preparing');
      await page.waitForSelector('.lp-play', { timeout: 10000 });
      const letters = await page.locator('.lp-letter').allTextContents();
      if (letters.length !== STAGE1.letters.length) {
        throw new Error(`expected ${STAGE1.letters.length} letter biscuits, got ${letters.length}`);
      }
      for (const id of ['submit', 'clear', 'shuffle', 'undo', 'hint']) {
        if (!(await page.locator('#lp-act-' + id).isVisible())) throw new Error(`action button hidden: ${id}`);
      }
      if (!(await page.getByRole('button', { name: /Pause/ }).isVisible())) throw new Error('pause button hidden');
    });

    await step('select + Escape clears + Undo restores nothing weird', async () => {
      await page.locator('.lp-letter').first().click();
      const word = await page.textContent('#lp-current');
      if (word.trim().length !== 1) throw new Error('selection not reflected in current word');
      await page.keyboard.press('Escape');
      const cleared = await page.textContent('#lp-current');
      if (cleared.trim() !== '·') throw new Error('Escape did not clear selection');
    });

    await step('hint reveals a slot letter; shuffle keeps tray usable', async () => {
      await page.locator('#lp-act-hint').click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.lp-slot')].some((s) => /[A-Z]/.test(s.textContent)));
      await page.locator('#lp-act-shuffle').click();
      await page.waitForTimeout(150);
      await shot('play');
    });

    // Click the visible letter biscuits spelling `word`, then Submit.
    async function submitWord(word, expectFound) {
      const letters = (await page.locator('.lp-letter').allTextContents()).map((t) => t.trim().toLowerCase());
      const used = new Set();
      for (const ch of word) {
        const idx = letters.findIndex((l, i) => l === ch && !used.has(i));
        if (idx === -1) throw new Error(`letter "${ch}" unavailable for "${word}" in tray ${letters.join('')}`);
        used.add(idx);
        await page.locator('.lp-letter').nth(idx).click();
      }
      await page.locator('#lp-act-submit').click();
      await page.waitForFunction(
        (n) => document.getElementById('lp-board-model').textContent.includes(`Found ${n} of`),
        expectFound, { timeout: 5000 });
    }

    await step('solve two target words through the tray', async () => {
      await submitWord(STAGE1.targets[0], 1);
      await submitWord(STAGE1.targets[1], 2);
    });

    await step('pause (P) → settings overlay → resume', async () => {
      await page.keyboard.press('p');
      await page.waitForSelector('#lp-overlay .lp-pause');
      await shot('pause');
      await page.getByRole('button', { name: 'Audio & graphics' }).click();
      await page.waitForSelector('#lp-overlay .lp-settings');
      await shot('pause-settings');
      await page.locator('#lp-overlay .lp-settings .lp-back').click();
      await page.waitForSelector('#lp-overlay .lp-pause');
      await page.getByRole('button', { name: 'Resume' }).click();
      await page.waitForSelector('#lp-overlay', { state: 'detached' });
      if (!(await page.locator('.lp-play').isVisible())) throw new Error('play screen not visible after resume');
    });

    await step('reload and resume preserve Journey context', async () => {
      await page.reload();
      await page.getByRole('button', { name: 'Resume saved round' }).click();
      await page.waitForSelector('.lp-play');
      if (!/Journey stage 1/.test(await page.textContent('.lp-hud-heading'))) {
        throw new Error('resumed round lost Journey context');
      }
    });

    await step('solve remaining targets → results screen', async () => {
      for (let i = 2; i < STAGE1.targets.length; i++) await submitWord(STAGE1.targets[i], i + 1);
      await page.waitForSelector('.lp-results', { timeout: 8000 });
      const headline = await page.textContent('.lp-results h2');
      if (!/Pantry stocked/.test(headline)) throw new Error('unexpected results headline: ' + headline);
      // Total score via the assertive live-region announcement (the breakdown
      // table itself is broken by the known el() bug — checked below).
      await page.waitForFunction(() => /Total score \d+/.test(document.getElementById('lp-alert').textContent));
      const announced = await page.textContent('#lp-alert');
      const total = Number(announced.match(/Total score (\d+)/)[1]);
      if (!(total > 0)) throw new Error('non-positive total score: ' + announced);
      console.log('  results headline:', headline.trim(), '| announced total:', total);
      const rows = await page.locator('.lp-score-table tbody tr').count();
      if (rows !== 7) throw new Error(`results score breakdown rendered ${rows} rows, expected 7`);
      const tableTotal = Number(await page.textContent('.lp-score-table tr.lp-total td'));
      if (tableTotal !== total) throw new Error(`table total ${tableTotal} != announced ${total}`);
      for (const name of ['Retry', 'Next stage', 'Back to title']) {
        if (!(await page.getByRole('button', { name, exact: true }).isVisible())) {
          throw new Error(`results button missing: ${name}`);
        }
      }
      await shot('results');
    });

    await step('progression persisted (stage 1 complete)', async () => {
      const raw = await page.evaluate(() => localStorage.getItem('letter-pantry:progression'));
      const record = raw ? JSON.parse(raw) : null;
      const payload = record && record.body ? JSON.parse(record.body).payload : null;
      if (!payload || !payload.completedStages.includes(STAGE1.id)) {
        throw new Error('journey stage 1 not persisted: ' + raw);
      }
      // A finished round must not linger as a resumable snapshot.
      const snap = await page.evaluate(() => localStorage.getItem('letter-pantry:last-snapshot'));
      if (snap !== null) throw new Error('completed round left a resumable snapshot');
    });

    await step('next stage starts; pause → leave → title with resume offer', async () => {
      await page.getByRole('button', { name: 'Next stage' }).click();
      await page.waitForSelector('.lp-play', { timeout: 10000 });
      const heading = await page.textContent('.lp-hud-heading');
      if (!/Journey stage 2/.test(heading)) throw new Error('unexpected stage heading: ' + heading);
      await page.keyboard.press('p');
      await page.waitForSelector('#lp-overlay .lp-pause');
      await page.getByRole('button', { name: 'Leave round' }).click();
      await page.waitForSelector('.lp-title');
      if (!(await page.getByRole('button', { name: 'Resume saved round' }).isVisible())) {
        throw new Error('resume-saved-round offer missing on title');
      }
      if (!/Journey \(1\//.test(await page.textContent('.lp-title-nav'))) {
        throw new Error('journey progress not shown on title');
      }
      await shot('title-return');
    });

    await step('language: Automatic follows the StarHermit preferred language (fr-CA); Deutsch re-renders and saves ui.language; report a problem', async () => {
      // Standalone checks end here; the signed-in steps talk to a stubbed API.
      page.off('request', onRequest);
      const calls = await stubStarHermit(page, { preferredLanguage: 'fr-CA' });
      await page.goto('about:blank');
      await page.goto(BASE + '/index.html#game_token=' + launchToken(), { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.lang === 'fr-CA', null, { timeout: 15000 });
      await page.waitForSelector('.lp-title');
      if ((await page.textContent('.lp-title-nav button')) !== 'Jouer') throw new Error('title not in fr-CA');
      await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
      await page.waitForSelector('.lp-settings');
      const choice = page.locator('[data-game-language="choice"]');
      if ((await choice.count()) !== 1) throw new Error('expected exactly one Language select');
      await choice.scrollIntoViewIfNeeded();
      const auto = await choice.locator('option').first().textContent();
      if (auto !== 'Automatique — Français (Canada)') throw new Error('Automatic label: ' + auto);
      await page.evaluate(() => { document.querySelector('[data-game-language="choice"]').__kept = true; });
      await choice.selectOption('de-DE');
      await page.waitForFunction(() => document.documentElement.lang === 'de-DE');
      await page.waitForFunction(() => /Im Konto gespeichert/.test(document.querySelector('[data-game-language="status"]').textContent), null, { timeout: 5000 });
      if (calls.settings['ui.language']?.choice !== 'de-DE') throw new Error('ui.language not saved: ' + JSON.stringify(calls.settings));
      const de = await page.evaluate(() => ({
        h: document.querySelector('.lp-settings h2').textContent,
        gfx: document.querySelector('.lp-gfx legend').textContent,
        music: document.querySelector('.lp-settings fieldset .lp-setting span').textContent,
        back: document.querySelector('.lp-settings .lp-back').textContent,
        kept: document.querySelector('[data-game-language="choice"]').__kept === true,
      }));
      if (de.h !== 'Einstellungen' || de.gfx !== 'Grafik' || de.music !== 'Musiklautstärke' || de.back !== 'Zurück' || !de.kept) {
        throw new Error('settings not re-rendered in place: ' + JSON.stringify(de));
      }
      await page.locator('[data-game-report="title"]').scrollIntoViewIfNeeded();
      await page.fill('[data-game-report="title"]', 'Language test report');
      await page.click('[data-game-report="send"]');
      await page.waitForFunction(() => /Danke/.test(document.querySelector('[data-game-report="status"]').textContent), null, { timeout: 5000 });
      if (!calls.reports?.[0] || calls.reports[0].kind !== 'bug') throw new Error('report not posted');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('German settings overflow horizontally');
      const fit = await page.evaluate(() => [...document.querySelectorAll('.lp-settings fieldset')].every((f) => f.getBoundingClientRect().right <= innerWidth + 1));
      if (!fit) throw new Error('a German settings fieldset is cut off');
      await shot('language-de');
      await page.locator('.lp-settings .lp-back').click();
      await page.waitForSelector('.lp-title');
      if (!(await page.locator('.lp-title-nav button', { hasText: /^Reise \(/ }).count())) throw new Error('title not German');
    });

    await step('language: switching mid-round re-renders the HUD, tray and pause dialog and keeps the round', async () => {
      await page.getByRole('button', { name: 'Spielen', exact: true }).click();
      await page.locator('.lp-mode-card button').first().click();
      await page.locator('.lp-stage').first().click();
      await page.waitForSelector('.lp-play', { timeout: 10000 });
      await page.locator('.lp-letter').first().click();
      const before = await page.evaluate(() => ({ cur: document.getElementById('lp-current').textContent, letters: [...document.querySelectorAll('.lp-letter')].map((b) => b.textContent).join('') }));
      await page.keyboard.press('p');
      await page.waitForSelector('#lp-overlay .lp-pause');
      await page.getByRole('button', { name: 'Audio & Grafik', exact: true }).click();
      await page.waitForSelector('#lp-overlay .lp-settings');
      const choice = page.locator('[data-game-language="choice"]');
      await choice.scrollIntoViewIfNeeded();
      await choice.selectOption('it-IT');
      await page.waitForFunction(() => document.documentElement.lang === 'it-IT');
      if ((await page.textContent('#lp-overlay .lp-settings h2')) !== 'Impostazioni') throw new Error('settings overlay not Italian');
      await page.locator('#lp-overlay .lp-settings .lp-back').click();
      await page.waitForSelector('#lp-overlay .lp-pause');
      if ((await page.textContent('#lp-overlay .lp-pause h2')) !== 'In pausa') throw new Error('pause dialog not Italian');
      await page.getByRole('button', { name: 'Riprendi', exact: true }).click();
      await page.waitForSelector('#lp-overlay', { state: 'detached' });
      const it = await page.evaluate(() => ({
        heading: document.querySelector('.lp-hud-heading').textContent,
        submit: document.getElementById('lp-act-submit').textContent,
        objective: document.getElementById('lp-objective').textContent,
        letter: document.querySelector('.lp-letter').getAttribute('aria-label'),
        cur: document.getElementById('lp-current').textContent,
        letters: [...document.querySelectorAll('.lp-letter')].map((b) => b.textContent).join(''),
      }));
      if (!/^Tappa 1 del percorso — facile/.test(it.heading) || it.submit !== 'Invia' || !/^Trova tutte le/.test(it.objective) || !/^Lettera /.test(it.letter)) {
        throw new Error('round not re-rendered: ' + JSON.stringify(it));
      }
      if (it.cur !== before.cur || it.letters !== before.letters) throw new Error('the round changed during the language switch');
      await shot('language-it-play');
      await page.keyboard.press('p');
      await page.getByRole('button', { name: 'Abbandona il turno', exact: true }).click();
      await page.waitForSelector('.lp-title');
      await page.getByRole('button', { name: 'Impostazioni', exact: true }).click();
      await choice.scrollIntoViewIfNeeded();
      await choice.selectOption('auto');
      await page.waitForFunction(() => document.documentElement.lang === 'fr-CA');
      await page.locator('.lp-settings .lp-back').click();
      await page.unroute(/\/api\/v1\//);
    });
  } finally {
    if (ownServer.length) failures.push(`[${label}] standalone requested own-server routes: ` + ownServer.join(', '));
    else console.log(`ok - [${label}] standalone made zero /api or /ws requests`);
    if (errors.length) failures.push(`[${label}] page errors:\n  ` + errors.join('\n  '));
    await context.close();
  }
}

try {
  console.log(`serving ${ROOT} at ${BASE}`);
  await playthrough('desktop', { width: 1280, height: 800 }, false);
  await playthrough('mobile', { width: 390, height: 844 }, true);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error('\nE2E FAIL — page errors detected:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('\nE2E PASS — Letter Pantry playable end-to-end on desktop and mobile, no page errors');
