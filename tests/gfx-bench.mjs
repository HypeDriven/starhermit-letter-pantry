// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics,
// starts Journey stage 1 and keeps playing through the visible tray: lifting letter biscuits, clearing,
// shuffling and spelling the stage's target words with Submit (celebration bursts). A finished stage
// is replayed with Retry.
import { JOURNEY } from '../content.js';

export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

const STAGE = JOURNEY[0];

export async function setPreset(page, preset) {
  await page.waitForSelector('.lp-title', { timeout: 20000 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForSelector('[data-gfx-section]');
  await page.locator('#gfx-preset').selectOption(preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.locator('.lp-settings .lp-back').click();
  await page.waitForSelector('.lp-title');
}

async function spell(page, word) {
  const letters = (await page.locator('.lp-letter').allTextContents()).map((t) => t.trim().toLowerCase());
  const used = new Set();
  for (const ch of word) {
    const idx = letters.findIndex((l, i) => l === ch && !used.has(i));
    if (idx < 0) return;
    used.add(idx);
    await page.locator('.lp-letter').nth(idx).click({ timeout: 1000 });
    await page.waitForTimeout(120);
  }
  await page.locator('#lp-act-submit').click({ timeout: 1000 });
}

export async function start(page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForSelector('.lp-modes');
  await page.locator('.lp-mode-card', { hasText: 'Journey' }).getByRole('button', { name: 'Start' }).click();
  await page.waitForSelector('.lp-stage-list');
  await page.locator('button.lp-stage').first().click();
  await page.waitForSelector('.lp-play', { timeout: 15000 });
  let stopped = false, n = 0;
  page.once('close', () => { stopped = true; });
  (async () => {
    while (!stopped) {
      try {
        if (await page.locator('.lp-results').count()) {
          await page.getByRole('button', { name: 'Retry' }).click({ timeout: 1000 });
          await page.waitForSelector('.lp-play', { timeout: 15000 });
        } else if (n % 4 === 3) {
          await spell(page, STAGE.targets[Math.floor(n / 4) % STAGE.targets.length]);
        } else {
          const count = await page.locator('.lp-letter').count();
          for (let i = 0; i < Math.min(3, count); i++) { await page.locator('.lp-letter').nth((n + i) % count).click({ timeout: 1000 }); await page.waitForTimeout(150); }
          await page.keyboard.press('Escape');
          await page.locator('#lp-act-shuffle').click({ timeout: 1000 });
        }
      } catch { /* screen changing */ }
      n++;
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  await page.waitForTimeout(1000);
}
