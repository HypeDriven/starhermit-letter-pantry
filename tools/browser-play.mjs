// Plays the web package in Chrome on the machine's GPU (~/games/tools/
// gpu-chrome.mjs; GPU_ADAPTER=software for headless SwiftShader), the loader
// index.html that `npm run package` writes, past ~/games/tools/
// engine-web-smoke.mjs's start: at a desktop viewport, a phone (DPR 3) and a
// phone held sideways (DPR 3) — Enter on the focused Play, the focused Journey
// Start and the focused stage 1 starts Journey stage 1 (TEA); its three words
// are typed (the letters field on the desktop, letter keys on the phones) and
// submitted with Enter, a biscuit is tapped on the phones, to the results;
// then Retry and Escape on an empty hand pauses. Screenshots of each step go
// to --shots. Fails on console errors or warnings or the runtime's error
// screen.
//   node tools/browser-play.mjs [GAME_DIR] [--shots OUT_DIR]
// Serves GAME_DIR on loopback (never tests/, tools/ or dot-names), the engine
// itself from wiki.starhermit.com as the loader pins it. playwright-core is
// resolved from GAME_DIR's node_modules or any sibling game's.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const args = process.argv.slice(2);
const dir = resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const shots = opt('--shots', null);

function findPlaywright() {
  const roots = [dir, resolve(dir, '..'), ...readdirSync(resolve(dir, '..')).map((d) => resolve(dir, '..', d))];
  for (const r of roots) {
    const p = join(r, 'node_modules', 'playwright-core');
    if (existsSync(p)) return createRequire(join(r, 'package.json'))('playwright-core');
  }
  throw new Error('playwright-core not found');
}
const { chromium } = findPlaywright();

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/plain',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '') || 'index.html';
  // The platform's clock (platform.serverTime / serverNow), as the game host answers it.
  if (path === 'api/v1/time') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ serverTime: Date.now(), serverTimeIso: new Date().toISOString() })); return; }
  const parts = path.split('/');
  if (parts.some((p) => p.startsWith('.') || p === '..') || ['tests', 'tools', 'node_modules'].includes(parts[0])) { res.writeHead(404).end(); return; }
  const file = join(dir, path);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const { launchChrome } = await import('/home/albert/games/tools/gpu-chrome.mjs');
const { browser, gpu, close } = await launchChrome(chromium);
console.log(`# chrome on ${gpu}`);
let failed = false;

const word = (w) => [['type', w], ['wait', 200], ['key', 'Enter'], ['wait', 600]];
const round = (tap) => [
  ['shot', 'title'], ['key', 'Enter'], ['wait', 800], ['shot', 'modes'], ['key', 'Enter'], ['wait', 800], ['shot', 'journey'],
  ['key', 'Enter'], ['wait', 1500], ['shot', 'countdown'], ['wait', 3500],
  ...(tap ? [['tap', tap], ['wait', 600], ['shot', 'tapped'], ['key', 'Escape'], ['wait', 400]] : []),
  ['type', 'ea'], ['wait', 600], ['shot', 'play'], ['type', 't'], ['wait', 200], ['key', 'Enter'], ['wait', 600],
  ...word('ate'), ...word('tea'), ['wait', 2500], ['shot', 'results'],
  ['key', 'Enter'], ['wait', 5000], ['key', 'Escape'], ['wait', 800], ['shot', 'paused'],
];
const views = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, steps: round(null) },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, steps: round({ x: 0.5, y: 0.72 }) },
  { name: 'landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, steps: round({ x: 0.5, y: 0.7 }) },
];
for (const v of views) {
  const ctx = await browser.newContext({ viewport: v.viewport, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.deviceScaleFactor });
  const page = await ctx.newPage();
  const cdp = v.hasTouch ? await ctx.newCDPSession(page) : null;
  const problems = [];
  const environment = /^No available adapters\.$|GL Driver Message/;
  page.on('console', (m) => {
    const platformRoute = /\/api\//.test(m.location()?.url ?? '');
    if ((m.type() === 'error' || m.type() === 'warning') && !environment.test(m.text()) && !platformRoute) problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !/\/api\//.test(r.url())) problems.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  const started = await page.waitForFunction(() => ['running', 'error'].includes(document.documentElement.dataset.starhermit), null, { timeout: 90000 }).then(() => true, () => false);
  // The first key press can be lost while the runtime starts up.
  await page.waitForTimeout(4000);
  const W = v.viewport.width, H = v.viewport.height;
  const at = (p) => ({ x: W * p.x, y: H * p.y, id: 0 });
  for (const [op, a, b] of v.steps) {
    if (op === 'key') { await page.keyboard.down(a); await page.waitForTimeout(120); await page.keyboard.up(a); }
    if (op === 'type') for (const ch of a) { await page.keyboard.down(`Key${ch.toUpperCase()}`); await page.waitForTimeout(60); await page.keyboard.up(`Key${ch.toUpperCase()}`); await page.waitForTimeout(60); }
    if (op === 'wait') await page.waitForTimeout(a);
    if (op === 'tap') {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(a)] });
      await page.waitForTimeout(120);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    if (op === 'shot' && shots) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, `${v.name}-${a}.png`) }); }
  }
  const state = await page.evaluate(() => document.documentElement.dataset.starhermit ?? '');
  const ok = started && state === 'running' && problems.length === 0;
  failed ||= !ok;
  console.log(`${ok ? 'ok' : 'not ok'} - ${v.name} played: started=${started} state=${state || '-'}`);
  for (const p of problems) console.log(`  ${p}`);
  await ctx.close();
}
await close();
server.close();
process.exit(failed ? 1 : 0);
