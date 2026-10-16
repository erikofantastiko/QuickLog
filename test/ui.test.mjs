// QuickLog — browser regression tests (Playwright + headless Chromium, no npm deps in the repo).
//
// WHAT: drives the real index.html/app.js through a local static server and checks the sizer
// end to end: cross-rate sizing (Kraken ticker MOCKED via page.route — deterministic, no
// network), fallback when Kraken fails, manual rate, R targets, the hidden-by-default 2-stop
// plan, the MT5 check, persistence across reload, and that "Copy for Sheet" stays
// byte-identical to the pre-change output.
//
// Needs Playwright importable (`npm i -g playwright` or local). Chromium: PLAYWRIGHT_BROWSERS_PATH
// or a normal Playwright install. Missing Playwright is a FAILURE (exit 1), never a silent pass.
//
// Run: node test/ui.test.mjs   (exit 0 = all pass, exit 1 = any fail)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through to global */ }
  try { return require(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch { return null; }
}
const pw = loadPlaywright();
if (!pw) {
  console.error('FAIL: playwright not found — install with `npm i -g playwright` (then `npx playwright install chromium`).');
  process.exit(1);
}

/* ---------- static server over the repo root ---------- */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ---------- assertion harness (same shape as sizing.test.mjs) ---------- */

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; process.exitCode = 1; console.error('FAIL: ' + msg); }
}
function eq(actual, expected, msg) { ok(actual === expected, msg + ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`); }

/* ---------- browser + Kraken mock ---------- */

const browser = await pw.chromium.launch();
// Kraken behaviour per test: { EUR: 1.17, GBP: 1.30 } → ticker answers; 'fail' → HTTP 500.
let kraken = {};
let krakenCalls = [];

async function newPage() {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    if (url.startsWith('https://api.kraken.com/0/public/Ticker')) {
      const pair = new URL(url).searchParams.get('pair') || '';
      krakenCalls.push(pair);
      if (kraken === 'fail') return route.fulfill({ status: 500, body: 'down' });
      const base = pair.slice(0, 3), v = kraken[base];
      if (v == null) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ error: ['EQuery:Unknown asset pair'] }) });
      const key = 'Z' + base + 'ZUSD';
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ error: [], result: { [key]: { c: [String(v), '1.0'] } } }) });
    }
    return route.abort(); // TradingView, fonts, anything external: off for determinism
  });
  // Capture "Copy for Sheet" text instead of touching the real clipboard.
  await ctx.addInitScript(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } } });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => ok(false, 'page error: ' + e.message));
  return { ctx, page };
}

const vol = (page) => page.locator('.sz-vol').textContent().catch(() => null);
const szText = (page) => page.locator('#szOut').innerText();

async function setSizer(page, { inst, risk = '1.00', entry, sl, tp = '' }) {
  await page.selectOption('#brk', 'ftmo');
  await page.selectOption('#inst', inst);
  await page.selectOption('#accPreset', '100000');
  await page.selectOption('#szRisk', risk);
  await page.fill('#szEntry', entry);
  await page.fill('#szSL', sl);
  await page.fill('#szTP', tp);
}

// Captured from main (before this change) with the exact inputs + pinned clock of test 5.
const SHEET_BASELINE = '\t16/10/2026 10:30\tEURUSD\t\t1.08500\t\t1.08300\t1.08900\t5\t0.25%\t\t\t\t\t\t\tLong\tLondon\t\tAsia Range – clean retest\t\t\t';

/* =================== TESTS =================== */

// 1. GBP/JPY with GBPUSD 1.30 from Kraken ⇒ 1.50 lots (old approximation: 1.95).
{
  kraken = { EUR: 1.17, GBP: 1.30 }; krakenCalls = [];
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await setSizer(page, { inst: 'GBP/JPY', entry: '195.00', sl: '194.00' });
  await page.waitForFunction(() => document.getElementById('fxRate').value !== '');
  ok(krakenCalls.includes('GBPUSD'), 'GBP/JPY fetches GBPUSD from Kraken');
  eq(await page.inputValue('#fxRate'), '1.3', 'fxRate field shows Kraken GBPUSD');
  ok(await page.isVisible('#fxRateWrap'), 'rate field visible for a cross');
  eq(await page.textContent('#fxRateLabel'), 'GBP→USD rate', 'rate label names GBP→USD');
  eq(await page.inputValue('#cv'), '666.66666667', 'GBP/JPY cv = 100000/195 × 1.30 (full precision)');
  eq(await vol(page), '1.50', 'GBP/JPY sizes to 1.50 lots');
  ok((await page.textContent('#fxRateHint')).includes('Kraken'), 'rate hint names Kraken as source');

  // 1b. Switching to EUR/JPY must use EURUSD, never the GBP rate.
  await page.selectOption('#inst', 'EUR/JPY');
  await page.fill('#szEntry', '170.00'); await page.fill('#szSL', '169.00');
  await page.waitForFunction(() => document.getElementById('fxRate').value === '1.17');
  eq(await page.inputValue('#cv'), '688.23529412', 'EUR/JPY cv = 100000/170 × 1.17');
  eq(await vol(page), '1.45', 'EUR/JPY sizes to 1.45 lots');

  // 1c. Non-cross pairs hide the rate field and keep their cv rule.
  await page.selectOption('#inst', 'USD/JPY');
  await page.fill('#szEntry', '150.000'); await page.fill('#szSL', '149.000');
  ok(!(await page.isVisible('#fxRateWrap')), 'rate field hidden for USD/JPY');
  eq(await page.inputValue('#cv'), '666.66666667', 'USD/JPY cv = 100000/150 (full precision)');
  eq(await vol(page), '1.50', 'USD/JPY 150→149, 1 % ⇒ 1.50 lots (was 1.49 with cv rounded to 666.67)');
  await page.selectOption('#inst', 'EUR/USD');
  ok(!(await page.isVisible('#fxRateWrap')), 'rate field hidden for EUR/USD');
  eq(await page.inputValue('#cv'), '100000', 'EUR/USD cv static 100000');
  await ctx.close();
}

// 2. Kraken down ⇒ no size (never the over-sizing approximation), clear message; manual rate fixes it.
{
  kraken = 'fail'; krakenCalls = [];
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await setSizer(page, { inst: 'GBP/JPY', entry: '195.00', sl: '194.00' });
  await page.waitForFunction(() => /unavailable/.test(document.getElementById('fxRateHint').textContent));
  eq(await page.inputValue('#cv'), '', 'Kraken down ⇒ cv empty');
  eq(await page.locator('.sz-vol').count(), 0, 'Kraken down ⇒ no lot size shown');
  ok((await szText(page)).includes('GBP→USD rate'), 'Kraken down ⇒ message asks for the GBP→USD rate');
  await page.fill('#fxRate', '1.30');
  eq(await vol(page), '1.50', 'manual GBPUSD 1.30 ⇒ 1.50 lots');
  ok((await page.textContent('#fxRateHint')).includes('manual'), 'hint marks the rate as manual');

  // 2b. Persistence: reload keeps the manual rate (and does not re-fetch over it).
  krakenCalls = [];
  await page.reload();
  eq(await page.inputValue('#fxRate'), '1.30', 'manual rate survives reload');
  eq(await vol(page), '1.50', 'size survives reload');
  ok(!krakenCalls.includes('GBPUSD'), 'manual rate is not overwritten by a re-fetch');
  await ctx.close();
}

// 3. R targets visible by default; 2-stop hidden by default, toggles, persists.
{
  kraken = {};
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await setSizer(page, { inst: 'EUR/USD', entry: '1.08500', sl: '1.08300' });
  eq(await vol(page), '5.00', 'EUR/USD 1.08500/1.08300, 1 % ⇒ 5.00 lots');
  ok(await page.isVisible('#szRTargets'), 'R targets shown by default');
  const rows = await page.locator('#szRTargets tbody tr').allInnerTexts();
  eq(rows.length, 5, 'five R target rows');
  ok(rows[0].includes('1.08700') && rows[0].includes('+$1,000'), '1R long ⇒ 1.08700, +$1,000');
  ok(rows[4].includes('1.10500') && rows[4].includes('+$10,000'), '10R long ⇒ 1.10500, +$10,000');
  eq(await page.locator('#szTwoStop').count(), 0, '2-stop plan hidden by default');

  await page.click('[data-act="twostop"]');
  ok(await page.isVisible('#szTwoStop'), '2-stop toggle shows the plan');
  const ts = await page.locator('#szTwoStop tbody tr').allInnerTexts();
  ok(ts[0].includes('1.08400') && ts[0].includes('2.50') && ts[0].includes('$250'), 'stop 1: 1.08400, 2.50 lots, −$250');
  ok(ts[1].includes('1.08300') && ts[1].includes('2.50') && ts[1].includes('$500'), 'stop 2: 1.08300, 2.50 lots, −$500');
  ok(ts[2].includes('$750') && ts[2].includes('0.75R'), 'total −$750 = 0.75R');
  eq(await vol(page), '5.00', 'showing the 2-stop plan does not change the size');

  await page.reload();
  ok(await page.isVisible('#szTwoStop'), '2-stop open state survives reload');
  await page.click('[data-act="twostop"]');
  await page.click('[data-act="rtargets"]');
  await page.reload();
  eq(await page.locator('#szTwoStop').count(), 0, '2-stop closed state survives reload');
  eq(await page.locator('#szRTargets').count(), 0, 'R targets collapsed state survives reload');

  // 3b. Short: targets below entry.
  await page.click('[data-act="rtargets"]');
  await setSizer(page, { inst: 'EUR/USD', entry: '1.08500', sl: '1.08700' });
  const sr = await page.locator('#szRTargets tbody tr').allInnerTexts();
  ok(sr[1].includes('1.08100'), '2R short ⇒ 1.08100 (below entry)');
  await ctx.close();
}

// 4. MT5 check: match ⇒ verified (persisted, shown in hint); mismatch ⇒ warning + "Use MT5 value".
{
  kraken = {};
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await setSizer(page, { inst: 'EUR/USD', entry: '1.08500', sl: '1.08300' });
  ok((await page.textContent('#cvHint')).includes('MT5 verified 2026-10-16'), 'EUR/USD verified from the preset (real MT5 screenshot)');

  await page.selectOption('#inst', 'US100 (NDX)');
  ok((await page.textContent('#cvHint')).includes('MT5 verified 2026-10-16'), 'US100 verified from the preset');

  // Local check path on an instrument not verified in code (US500, contract size 1).
  await page.selectOption('#inst', 'US500 (SPX)');
  await page.fill('#szEntry', '5800'); await page.fill('#szSL', '5780');
  ok(!(await page.textContent('#cvHint')).includes('MT5 verified'), 'US500 not verified before the check');
  ok(!(await page.isVisible('#mt5Wrap')), 'MT5 check collapsed by default');
  await page.click('#mt5Toggle');
  await page.fill('#mt5Cs', '1');
  await page.fill('#mt5Ccy', 'usd');
  eq(await page.inputValue('#mt5Ccy'), 'USD', 'profit currency is upper-cased');
  ok((await page.textContent('#mt5Out')).includes('Matches MT5'), 'US500 contract size 1 / USD ⇒ matches');
  ok((await page.textContent('#cvHint')).includes('MT5 verified'), 'US500 hint shows MT5 verified');
  await page.reload();
  ok((await page.textContent('#cvHint')).includes('MT5 verified'), 'verified mark survives reload');

  // Stale inputs must not verify the next instrument.
  await page.click('#mt5Toggle');
  await page.fill('#mt5Cs', '1');
  await page.selectOption('#inst', 'GBP/USD');
  eq(await page.inputValue('#mt5Cs'), '', 'instrument change clears MT5 contract size');
  ok(!(await page.textContent('#cvHint')).includes('MT5 verified'), 'GBP/USD not verified by stale inputs');

  // Mismatch path: XAU preset 100 oz, MT5 says 10.
  await page.selectOption('#inst', 'XAU/USD');
  await page.fill('#mt5Cs', '10');
  const out = await page.textContent('#mt5Out');
  ok(out.includes('MT5 10') && out.includes('QuickLog 100'), 'XAU contract size mismatch is spelled out');
  await page.click('#mt5Use');
  eq(await page.inputValue('#cv'), '10', '"Use MT5 value" writes cv 10');
  ok((await page.textContent('#mt5Out')).includes('manual override'), 'confirms cv is now a manual override');

  // FX: wrong profit currency is flagged, no cv button (cv is derived for FX).
  await page.selectOption('#inst', 'USD/JPY');
  await page.fill('#mt5Cs', '100000');
  await page.fill('#mt5Ccy', 'USD');
  const fx = await page.textContent('#mt5Out');
  ok(fx.includes('Profit currency') && fx.includes('QuickLog JPY'), 'USD/JPY profit currency mismatch flagged');
  eq(await page.locator('#mt5Use').count(), 0, 'no "Use MT5 value" for FX pairs');
  await ctx.close();
}

// 4b. ETH/USD: cv 10 (FTMO contract size), max-volume warning above 5 lots.
{
  kraken = {};
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await setSizer(page, { inst: 'ETH/USD', entry: '2450', sl: '2400' });
  eq(await page.inputValue('#cv'), '10', 'ETH/USD cv field = 10');
  eq(await vol(page), '2.00', 'ETH/USD 2450→2400, 1 % ⇒ 2.00 lots');
  ok(!(await szText(page)).includes('max volume'), 'no max-volume warning at 2.00 lots');
  await page.fill('#szSL', '2440');
  eq(await vol(page), '10.00', 'ETH/USD 10-point stop ⇒ 10.00 lots');
  ok((await szText(page)).includes('Above MT5 max volume (5'), 'warns above MT5 max 5 lots');
  await ctx.close();
}

// 5. "Copy for Sheet" stays byte-identical to the pre-change output (baseline captured on main
//    with the same inputs and the clock pinned).
{
  kraken = {};
  const { ctx, page } = await newPage();
  await page.clock.setFixedTime(new Date('2026-10-16T10:30:00'));
  await page.goto(BASE);
  await page.click('#tab-log');
  await page.fill('#ast', 'EURUSD');
  await page.fill('#ent', '1.08500');
  await page.fill('#slo', '1.08300');
  await page.fill('#tpr', '1.08900');
  await page.fill('#vol', '5');
  await page.fill('#nte', 'clean retest');
  await page.click('#cpb');
  await page.waitForFunction(() => window.__copied !== null);
  const copied = await page.evaluate(() => window.__copied);
  const cols = copied.split('\t');
  eq(cols.length, 23, 'live sheet row has 23 columns');
  for (const L of ['M', 'N', 'O', 'P']) eq(cols[L.charCodeAt(0) - 65], '', `formula column ${L} stays empty`);
  eq(copied, SHEET_BASELINE, 'Copy for Sheet output byte-identical to baseline');
  await ctx.close();
}

/* =================== SUMMARY =================== */

await browser.close();
server.close();
const total = pass + fail;
if (fail === 0) console.log(`PASS ${pass}/${total}`);
else console.log(`FAIL ${pass}/${total} passed (${fail} failed)`);
