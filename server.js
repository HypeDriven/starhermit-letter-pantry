// Letter Pantry — authoritative server script.
// Static hosting + time/daily/score/leaderboard/achievements APIs.
// CommonJS, no dependencies. Rules/content modules are loaded via dynamic
// import so the exact same logic validates score submissions.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const MAX_BODY = 512 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.opus': 'audio/ogg',
};

// ---------------------------------------------------------------------------
// Lazily-imported ES modules (shared rules/content logic).

let rulesMod = null;
let contentMod = null;
async function loadModules() {
  if (!rulesMod) rulesMod = await import('./rules.js');
  if (!contentMod) contentMod = await import('./content.js');
  return { rules: rulesMod, content: contentMod };
}

// ---------------------------------------------------------------------------
// JSON helpers

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
const sendError = (res, status, msg) => sendJSON(res, status, { error: msg });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Durable stores (JSON files under data/).

function loadStore(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch { return fallback; }
}
function saveStore(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, file + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, path.join(DATA_DIR, file));
}

// ---------------------------------------------------------------------------
// Score validation: replay the command log with the shared rules engine.

async function validateScoreSubmission(body) {
  const { rules, content } = await loadModules();
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad submission' };
  if (body.ruleset !== rules.RULESET) return { ok: false, error: 'stale ruleset' };
  if (body.contentVersion !== content.CONTENT_VERSION) return { ok: false, error: 'stale content version' };
  if (typeof body.seed !== 'string' || body.seed.length > 64) return { ok: false, error: 'bad seed' };
  if (!Array.isArray(body.commands) || body.commands.length > 2000) return { ok: false, error: 'bad command log' };
  if (!Number.isFinite(body.durationMs) || body.durationMs < 0 || body.durationMs > 3600000) {
    return { ok: false, error: 'implausible duration' };
  }
  if (!Number.isInteger(body.score) || body.score < -100000 || body.score > 1000000) {
    return { ok: false, error: 'implausible score' };
  }
  const descriptor = content.descriptorFromSeed(body.seed);
  if (!descriptor) return { ok: false, error: 'unknown seed' };
  const result = rules.replay(descriptor, body.commands);
  if (!result.ok) return { ok: false, error: `replay failed at command ${result.failedIndex}: ${result.reason}` };
  const finalScore = result.state.score.total;
  if (finalScore !== body.score) {
    return { ok: false, error: `score mismatch: replayed ${finalScore}, claimed ${body.score}` };
  }
  if (result.state.elapsedMs > body.durationMs + 2000) {
    return { ok: false, error: 'duration inconsistent with replay' };
  }
  return { ok: true, score: finalScore, terminalReason: result.state.terminalReason };
}

// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/api/v1/time' && req.method === 'GET') {
      return sendJSON(res, 200, { now: Date.now() });
    }

    if (pathname === '/api/v1/daily' && req.method === 'GET') {
      const { content } = await loadModules();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')
        ? url.searchParams.get('date')
        : new Date().toISOString().slice(0, 10);
      const d = content.deriveDaily(date);
      return sendJSON(res, 200, {
        date,
        seed: d.seed,
        contentVersion: content.CONTENT_VERSION,
        ruleset: (await loadModules()).rules.RULESET,
        targetCount: d.targets.length,
        letterCount: d.letters.length,
      });
    }

    if (pathname === '/api/v1/score' && req.method === 'POST') {
      const body = await readBody(req);
      const verdict = await validateScoreSubmission(body);
      if (!verdict.ok) return sendError(res, 422, verdict.error);
      const boardName = body.board === 'daily' ? 'daily' : 'global';
      const boards = loadStore('leaderboard.json', { global: [], daily: [] });
      const entry = {
        name: typeof body.name === 'string' ? body.name.slice(0, 24) : 'guest',
        score: verdict.score,
        seed: body.seed,
        ruleset: body.ruleset,
        contentVersion: body.contentVersion,
        durationMs: Math.round(body.durationMs),
        assists: body.assists || {},
        ts: Date.now(),
      };
      boards[boardName].push(entry);
      // Sort: score desc, then lower duration, then earlier timestamp.
      boards[boardName].sort((a, b) => b.score - a.score || a.durationMs - b.durationMs || a.ts - b.ts);
      boards[boardName] = boards[boardName].slice(0, 100);
      saveStore('leaderboard.json', boards);
      return sendJSON(res, 200, { accepted: true, score: verdict.score, board: boardName });
    }

    if (pathname === '/api/v1/leaderboard' && req.method === 'GET') {
      const boardName = url.searchParams.get('board') === 'daily' ? 'daily' : 'global';
      const boards = loadStore('leaderboard.json', { global: [], daily: [] });
      let entries = boards[boardName] || [];
      const seed = url.searchParams.get('seed');
      if (seed) entries = entries.filter((e) => e.seed === seed);
      // friends param accepted; friends are local-only, so the set is unchanged.
      return sendJSON(res, 200, { board: boardName, entries: entries.slice(0, 50) });
    }

    if (pathname === '/api/v1/achievements') {
      if (req.method === 'GET') {
        return sendJSON(res, 200, loadStore('achievements.json', { unlocked: [] }));
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const { content } = await loadModules();
        const valid = new Set(content.ACHIEVEMENTS.map((a) => a.id));
        const store = loadStore('achievements.json', { unlocked: [] });
        const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
        for (const id of ids) {
          if (valid.has(id) && !store.unlocked.includes(id)) store.unlocked.push(id); // idempotent
        }
        saveStore('achievements.json', store);
        return sendJSON(res, 200, store);
      }
    }

    if (pathname.startsWith('/api/')) return sendError(res, 404, 'unknown endpoint');

    // ---- static hosting with path traversal protection ----
    let rel = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
      return sendError(res, 403, 'forbidden');
    }
    fs.readFile(filePath, (err, data) => {
      if (err) return sendError(res, 404, 'not found');
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (err) {
    sendError(res, err.message === 'payload too large' ? 413 : 400, err.message || 'bad request');
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Letter Pantry server listening on http://localhost:${PORT}`);
  });
}

module.exports = { server, validateScoreSubmission };
