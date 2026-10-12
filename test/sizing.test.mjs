// QuickLog — money-math regression tests (framework-free, no npm deps).
//
// WHY this shape: the sizing functions live inside one IIFE in app.js and are
// not exported. To avoid testing a stale hardcoded *copy* of the math (which would
// not regress when the source changes), this script EXTRACTS the relevant source
// text straight out of app.js and evaluates it in a sandbox. If someone edits
// e.g. the `vol = riskAmt/(dist*cv)` line or a preset cv, these tests see the new
// definition and (correctly) fail if it broke a known value.
//
// EXTRACTION STRATEGY:
//   * Pure literals/functions (FX_LOT, PRESETS, parseNum, contractValueFor,
//     SHEET_COLUMNS) are sliced by name and evaluated as-is.
//   * DOM-coupled functions ($ -> document.getElementById): currentPreset, stepFor,
//     roundVol, stepDecimals, getAccount, calcSize. We inject a `$` stub backed by a
//     mutable field map { id: stringValue } that mimics the inputs/selects, then run
//     the REAL extracted bodies against it. This exercises the actual control flow
//     (incl. the +1e-9 floor epsilon and the tpWrongSide sign check) rather than a
//     reimplementation.
//
// RISK / fragility: extraction is regex-on-source. If a function is renamed or its
// `function NAME(` / `var NAME =` declaration shape changes, the slice fails loudly
// (we throw "could not extract <name>") instead of silently passing. That is the
// intended failure mode — a missing extraction is a test failure, not a false green.
//
// Run: node test/sizing.test.mjs   (exit 0 = all pass, exit 1 = any fail)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'app.js'), 'utf8');

/* ---------- extraction helpers ---------- */

// Slice a balanced {...} / [...] / (...) block starting at the first opener at/after `from`.
function sliceBalanced(text, from, open, close) {
  const start = text.indexOf(open, from);
  if (start < 0) return null;
  let depth = 0, inStr = null, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (c === '\\') { esc = true; }
      else if (c === inStr) { inStr = null; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// Extract a `function NAME(...) { ... }` declaration as source text.
function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(SRC);
  if (!m) throw new Error('could not extract function ' + name);
  const parenStart = SRC.indexOf('(', m.index);
  const args = sliceBalanced(SRC, parenStart, '(', ')');
  if (!args) throw new Error('could not extract args of ' + name);
  const body = sliceBalanced(SRC, parenStart + args.length, '{', '}');
  if (!body) throw new Error('could not extract body of ' + name);
  return 'function ' + name + args + body;
}

// Extract a `var NAME = <literal>;` (object or array literal) as source text.
function extractVarLiteral(name, open, close) {
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*');
  const m = re.exec(SRC);
  if (!m) throw new Error('could not extract var ' + name);
  const lit = sliceBalanced(SRC, m.index + m[0].length, open, close);
  if (!lit) throw new Error('could not slice literal of ' + name);
  return 'var ' + name + ' = ' + lit + ';';
}

// Extract a `var NAME = <expression>;` up to the terminating semicolon (scalars).
function extractVarScalar(name) {
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*([^;]+);');
  const m = re.exec(SRC);
  if (!m) throw new Error('could not extract scalar var ' + name);
  return 'var ' + name + ' = ' + m[1].trim() + ';';
}

/* ---------- build sandbox from extracted source ---------- */

const pieces = [
  extractVarLiteral('PRESETS', '{', '}'),
  extractVarScalar('FX_LOT'),
  // contractValueFor now compares quote against ACCOUNT_CCY — must be in scope or it ReferenceErrors.
  extractVarScalar('ACCOUNT_CCY'),
  extractVarLiteral('SHEET_COLUMNS', '{', '}'),
  extractFn('parseNum'),
  extractFn('contractValueFor'),
  extractFn('currentPreset'),
  // parseNum's ambiguity resolution needs the instrument band: calcSize & co read
  // inputs through numOf → bandFor → currentPreset/presetForAsset.
  extractFn('presetForAsset'),
  extractFn('bandFor'),
  extractFn('numOf'),
  extractFn('stepFor'),
  extractFn('roundVol'),
  extractFn('stepDecimals'),
  extractFn('getAccount'),
  // getSizerRisk feeds calcSize (preset select vs. 'custom' free-text field);
  // it MUST be extracted or calcSize throws ReferenceError when evaluated.
  extractFn('getSizerRisk'),
  extractFn('calcSize'),
  extractVarScalar('TIGHT_SL_FRACTION'),
  extractFn('sizeChecks'),
  extractFn('riskForVol'),
  // Trade Log side: R:R side check, custom-risk fallback, auto direction.
  extractFn('logRR'),
  extractFn('getLogRisk'),
  extractFn('maybeAutoDirection'),
  // Sizer → Log transfer + "New trade" field lists + sheet risk cell + band warning.
  extractVarLiteral('TRADE_FIELDS', '[', ']'),
  extractVarLiteral('TRANSFER_FIELDS', '[', ']'),
  extractFn('sheetRisk'),
  extractFn('outsideBand'),
  extractFn('sendToLog'),
  // The REAL sheet export, so a regression at the call site (not just in a helper) fails.
  extractFn('today'),
  extractFn('copyForSheet')
];

// Mutable field map standing in for the DOM inputs/selects.
const fields = {};
function setFields(obj) { for (const k in fields) delete fields[k]; Object.assign(fields, obj); }
// `$` stub: one persistent element per id whose .value reads/writes the (string)
// field map, so functions that WRITE inputs (sendToLog) can be asserted too.
const els = {};
const $ = (id) => els[id] || (els[id] = {
  get value() { return id in fields ? fields[id] : ''; },
  set value(v) { fields[id] = String(v); },
  style: {}, className: ''
});

// Minimal stand-in for the app's `state` object (only what the extracted Log functions read).
const state = { direction: 'Long', dirManual: false, mode: 'live' };

// DOM-side effects sendToLog triggers; recorded, not executed.
const calls = [];
const win = { confirmAnswer: true, confirmAsked: 0, confirm() { this.confirmAsked++; return this.confirmAnswer; } };

const factory = new Function('$', 'fields', 'state', 'window', 'calls', `
  function setTab(t){ calls.push('setTab:' + t); }
  function update(){ calls.push('update'); }
  function toast(m){ calls.push('toast:' + m); }
  function copyText(t){ calls.push({ copied: t }); }
  ${pieces.join('\n')}
  return { PRESETS, FX_LOT, ACCOUNT_CCY, SHEET_COLUMNS, parseNum, contractValueFor, currentPreset, presetForAsset, bandFor, numOf, stepFor, roundVol, stepDecimals, getAccount, getSizerRisk, calcSize, sizeChecks, riskForVol, logRR, getLogRisk, maybeAutoDirection, TRADE_FIELDS, TRANSFER_FIELDS, sheetRisk, outsideBand, sendToLog, copyForSheet };
`);
const M = factory($, fields, state, win, calls);

/* ---------- preset lookups (by display name, from extracted PRESETS) ---------- */

const presetByName = (name) => M.PRESETS.ftmo.find((p) => p.s === name);
const EURUSD = presetByName('EUR/USD');
const USDJPY = presetByName('USD/JPY');
const USDCAD = presetByName('USD/CAD');
const EURGBP = presetByName('EUR/GBP');

/* ---------- tiny assertion harness ---------- */

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; process.exitCode = 1; console.error('FAIL: ' + msg); }
}
function approx(actual, expected, tol, msg) {
  const d = Math.abs(actual - expected);
  ok(d <= tol, msg + ` (got ${actual}, want ${expected} +/-${tol}, diff ${d})`);
}
function eq(actual, expected, msg) {
  ok(actual === expected, msg + ` (got ${actual}, want ${expected})`);
}

/* =================== ASSERTIONS =================== */

// 1. SHEET_COLUMNS lengths — Live = 23, Backtest = 28 (byte-identical sheet layout).
eq(M.SHEET_COLUMNS.live.length, 23, 'SHEET_COLUMNS.live length must be 23');
eq(M.SHEET_COLUMNS.backtest.length, 28, 'SHEET_COLUMNS.backtest length must be 28');

// 1b. Formula columns M/N/O/P (PnL %, Risk/Reward, R Ergebnis, Kumulatives R) must
//     stay EMPTY — anything pasted there overwrites the sheet's own formula. N used
//     to carry the computed rr; that was the regression this pins down.
const LIVE = M.SHEET_COLUMNS.live;
const colIdx = (letter) => letter.charCodeAt(0) - 'A'.charCodeAt(0);
for (const letter of ['A', 'M', 'N', 'O', 'P']) {
  eq(LIVE[colIdx(letter)], '', `live column ${letter} must stay '' (sheet-filled / formula)`);
}
ok(!LIVE.includes('rr'), 'live mapping must NOT export a computed rr into any column');

// 1c. Every live column key sits at its documented spreadsheet letter.
const LIVE_MAP = {
  B: 'dt', C: 'asset', D: 'screenshot', E: 'entry', F: 'exit', G: 'sl', H: 'tp',
  I: 'vol', J: 'risk', K: 'riskUsd', L: 'pnlUsd', Q: 'dir', R: 'session',
  S: 'result', T: 'note', U: 'management', V: 'emotions', W: 'feedback'
};
for (const [letter, key] of Object.entries(LIVE_MAP)) {
  eq(LIVE[colIdx(letter)], key, `live column ${letter} must map to '${key}'`);
}

// 1d. Backtest = 5 prepended BT columns + the 23 live columns, aligned 1:1. If the
//     two mappings ever drift apart the same row would land in different columns.
eq(M.SHEET_COLUMNS.backtest.slice(5).join('|'), LIVE.join('|'),
   'backtest columns 6..28 must equal the live mapping verbatim');
eq(M.SHEET_COLUMNS.backtest.slice(0, 5).join('|'), 'btId|pool|date||',
   'backtest must prepend [btId, pool, date, "", ""]');

// sanity: presets were actually found
ok(!!EURUSD && !!USDJPY, 'EUR/USD and USD/JPY presets must exist in PRESETS.ftmo');
ok(!!USDCAD && !!EURGBP, 'USD/CAD and EUR/GBP presets must exist in PRESETS.ftmo');

// ACCOUNT_CCY drives the cv classification; pin it so an accidental change is caught.
eq(M.ACCOUNT_CCY, 'USD', "ACCOUNT_CCY must be 'USD'");

// FX_LOT is the standard-lot notional and the basis for JPY cv derivation. Pin it
// EXACTLY (integer, no tolerance) — a small drift (e.g. 100000->100001) is otherwise
// invisible to the loose cv/vol tolerances and would slip through unnoticed.
eq(M.FX_LOT, 100000, 'FX_LOT must be 100000 (standard-lot notional)');

// 2. contractValueFor — quote≠ACCOUNT_CCY derives cv = FX_LOT/entry; quote===ACCOUNT_CCY is static.
//    Expect the EXACT 100000/150 at tol 1e-6 so FX_LOT drift also fails through the cv
//    path, not only via the direct pin above. Rounded 666.67 +/-0.01 was too loose.
approx(M.contractValueFor(USDJPY, '150'), 100000 / 150, 1e-6, 'contractValueFor(USD/JPY,"150") == 100000/150');
eq(M.contractValueFor(EURUSD, '1.085'), 100000, 'contractValueFor(EUR/USD,"1.085") == 100000 (quote=USD → static)');
// USD/CAD: USD is the base ⇒ exact entry-derive (the fix; previously mis-treated as static 100000).
approx(M.contractValueFor(USDCAD, '1.37'), 100000 / 1.37, 1e-6, 'contractValueFor(USD/CAD,"1.37") == 100000/1.37');
// EUR/GBP: USD is neither base nor quote ⇒ best-effort entry-derive (flagged approx in the UI).
approx(M.contractValueFor(EURGBP, '0.85'), 100000 / 0.85, 1e-6, 'contractValueFor(EUR/GBP,"0.85") == 100000/0.85 (cross approx)');

// 3. Sizing of known trades via the REAL calcSize (account 100000, risk 0.25 => riskAmt 250).
//    EUR/USD 1.08500 -> 1.08200, cv 100000 => vol ~= 0.8333.
setFields({
  accPreset: '100000', szRisk: '0.25',
  szEntry: '1.08500', szSL: '1.08200', szTP: '', cv: '100000'
});
let r = M.calcSize();
ok(r !== null, 'calcSize EUR/USD case returns a result');
approx(r.riskAmt, 250, 1e-9, 'EUR/USD riskAmt == 250');
approx(r.vol, 0.8333, 0.0005, 'EUR/USD vol ~= 0.8333');
// non-custom select feeds getSizerRisk verbatim (0.25), so riskAmt stayed 250 above.
eq(M.getSizerRisk(), 0.25, 'getSizerRisk() reads the preset select value (0.25)');

// 3b. Custom risk path: szRisk='custom' => getSizerRisk reads szRiskCustom (0.33),
//     so riskAmt = 100000 * 0.0033 = 330 and vol scales accordingly (same levels).
setFields({
  accPreset: '100000', szRisk: 'custom', szRiskCustom: '0.33',
  szEntry: '1.08500', szSL: '1.08200', szTP: '', cv: '100000'
});
eq(M.getSizerRisk(), 0.33, 'getSizerRisk() reads szRiskCustom when szRisk==custom (0.33)');
r = M.calcSize();
ok(r !== null, 'calcSize custom-risk case returns a result');
approx(r.riskAmt, 330, 1e-9, 'custom-risk riskAmt == 100000*0.0033 == 330');
approx(r.vol, 1.1, 0.001, 'custom-risk vol ~= 1.1 (330 / (0.003*100000))');

//    JPY 150.000 -> 149.000, cv = contractValueFor(USD/JPY,"150") => vol ~= 0.375.
const jpyCv = M.contractValueFor(USDJPY, '150');
setFields({
  accPreset: '100000', szRisk: '0.25',
  szEntry: '150.000', szSL: '149.000', szTP: '', cv: String(jpyCv)
});
r = M.calcSize();
ok(r !== null, 'calcSize JPY case returns a result');
approx(r.vol, 0.375, 0.001, 'JPY vol ~= 0.375');

// 4. roundVol — floors to tradeable step; +1e-9 epsilon must save 0.29/0.01.
//    stepFor() reads the current preset via $ -> set brk/inst so step = 0.01.
setFields({ brk: 'ftmo', inst: 'EUR/USD' });
approx(M.roundVol(0.833), 0.83, 1e-9, 'roundVol(0.833)@0.01 == 0.83');
approx(M.roundVol(0.29), 0.29, 1e-9, 'roundVol(0.29)@0.01 == 0.29 (epsilon guard)');
eq(M.stepDecimals(), 2, 'stepDecimals()@0.01 == 2');
//    1.2345 @ step 0.001 => 1.234 (breakout BTC has step 0.001).
setFields({ brk: 'breakout', inst: 'BTC' });
approx(M.roundVol(1.2345), 1.234, 1e-9, 'roundVol(1.2345)@0.001 == 1.234');
eq(M.stepDecimals(), 3, 'stepDecimals()@0.001 == 3');

// 5. tpWrongSide / R:R via calcSize. Long e=1.10 s=1.09 (dist .01).
//    TP 1.08 is below entry on a long => wrong side => rr null.
setFields({ accPreset: '100000', szRisk: '0.25', szEntry: '1.10', szSL: '1.09', szTP: '1.08', cv: '100000' });
r = M.calcSize();
ok(r !== null && r.tpWrongSide === true, 'Long TP below entry flagged tpWrongSide');
eq(r.rr, null, 'wrong-side TP yields rr == null');
//    TP 1.12 above entry => valid, reward dist .02 / risk dist .01 => rr ~= 2.
setFields({ accPreset: '100000', szRisk: '0.25', szEntry: '1.10', szSL: '1.09', szTP: '1.12', cv: '100000' });
r = M.calcSize();
ok(r !== null && r.tpWrongSide === false, 'Long TP above entry is not wrong-side');
approx(r.rr, 2, 1e-9, 'rr ~= 2 for TP 1.12 vs entry 1.10, stop 1.09');

// 6. parseNum — never a silent mis-read. The old parseNum turned '20,150' into 20.15
//    (US100 sized 1000x too large). Unambiguous formats parse; ambiguous/garbage → NaN.
const nan = (v, msg) => ok(Number.isNaN(v), msg + ` (got ${v}, want NaN)`);
eq(M.parseNum('1.08500'), 1.085, "parseNum('1.08500') == 1.085");
eq(M.parseNum('1,08500'), 1.085, "parseNum('1,08500') == 1.085 (comma decimal)");
eq(M.parseNum('20150'), 20150, "parseNum('20150') == 20150");
eq(M.parseNum('20,150.5'), 20150.5, "parseNum('20,150.5') == 20150.5 (US thousands)");
eq(M.parseNum('20.150,5'), 20150.5, "parseNum('20.150,5') == 20150.5 (EU thousands)");
eq(M.parseNum('1 234,5'), 1234.5, "parseNum('1 234,5') == 1234.5 (space thousands)");
eq(M.parseNum("1'234.5"), 1234.5, "parseNum(\"1'234.5\") == 1234.5 (apostrophe thousands)");
eq(M.parseNum('1,234,567'), 1234567, "parseNum('1,234,567') == 1234567");
eq(M.parseNum('0,125'), 0.125, "parseNum('0,125') == 0.125 (leading 0 → decimal, not ambiguous)");
eq(M.parseNum('2650,5'), 2650.5, "parseNum('2650,5') == 2650.5");
nan(M.parseNum('20,150'), "parseNum('20,150') without band is ambiguous → NaN");
nan(M.parseNum('1,085'), "parseNum('1,085') without band is ambiguous → NaN");
nan(M.parseNum('1.2.3'), "parseNum('1.2.3') → NaN");
nan(M.parseNum('20abc'), "parseNum('20abc') → NaN (old parseFloat read 20)");
nan(M.parseNum('1,08,500'), "parseNum('1,08,500') → NaN (bad grouping)");
nan(M.parseNum(''), "parseNum('') → NaN");
nan(M.parseNum('0x10'), "parseNum('0x10') → NaN");

// 6b. Ambiguous '1,234' resolved by the instrument's price band (exactly one reading inside).
const presetFtmo = (n) => M.PRESETS.ftmo.find((p) => p.s === n);
eq(M.parseNum('150,125', presetFtmo('USD/JPY').band), 150.125, "USD/JPY band: '150,125' → 150.125");
eq(M.parseNum('20,150', presetFtmo('US100 (NDX)').band), 20150, "US100 band: '20,150' → 20150");
eq(M.parseNum('1,085', presetFtmo('EUR/USD').band), 1.085, "EUR/USD band: '1,085' → 1.085");
eq(M.parseNum('2,650', presetFtmo('XAU/USD').band), 2650, "XAU band: '2,650' → 2650");
eq(M.parseNum('32,125', presetFtmo('XAG/USD').band), 32.125, "XAG band: '32,125' → 32.125");
nan(M.parseNum('500,000', [1, 1e9]), "band containing both readings → still NaN");
// Band never changes an UNambiguous number, even outside the band.
eq(M.parseNum('20.15', presetFtmo('US100 (NDX)').band), 20.15, 'band does not touch unambiguous input');

// 6c. End to end through the real calcSize: US100 '20,150.5'/'20,100' sizes like 20150.5/20100,
//     and the bare ambiguous '20,150' resolves via the band to the same size as '20150'.
setFields({ brk: 'ftmo', inst: 'US100 (NDX)', accPreset: '100000', szRisk: '0.25',
            szEntry: '20,150', szSL: '20,100', szTP: '', cv: '1' });
r = M.calcSize();
ok(r !== null, 'calcSize US100 with comma thousands returns a result');
approx(r.vol, 250 / 50, 1e-9, "US100 '20,150'/'20,100' → 5 lots (was 5000 with the old parseNum)");
setFields({ brk: 'custom', inst: 'Custom', accPreset: '100000', szRisk: '0.25',
            szEntry: '20,150', szSL: '20,100', szTP: '', cv: '1' });
eq(M.calcSize(), null, 'custom instrument (no band) + ambiguous entry → no result, never a guess');
//    Log side: band comes from the typed asset.
setFields({ ast: 'US100' });
eq(M.bandFor('ent'), presetFtmo('US100 (NDX)').band, "bandFor('ent') follows the Log asset (US100)");
setFields({ ast: 'BTC' });
ok(Array.isArray(M.bandFor('ent')), "bandFor('ent') finds Breakout 'BTC'");
setFields({ ast: 'FOO' });
eq(M.bandFor('ent'), null, 'unknown asset → no band');
//    Account custom '100,000' → 100000 (band [1000,1e9]).
setFields({ accPreset: 'custom', accCustom: '100,000' });
eq(M.getAccount(), 100000, "custom account '100,000' → 100000");

// 7. Trade Log R:R — same wrong-side rule as the sizer (was a positive 1.67R on the card).
setFields({ ast: 'EUR/USD', ent: '1.085', slo: '1.082', tpr: '1.080' });
eq(M.logRR(), null, 'Log: Long with TP below entry → no R:R');
setFields({ ast: 'EUR/USD', ent: '1.085', slo: '1.082', tpr: '1.091' });
eq(M.logRR(), '2.00', 'Log: Long TP 1.091 / entry 1.085 / SL 1.082 → 2.00R');
setFields({ ast: 'EUR/USD', ent: '1.085', slo: '1.088', tpr: '1.079' });
eq(M.logRR(), '2.00', 'Log: Short TP below entry → 2.00R');
setFields({ ast: 'EUR/USD', ent: '1.085', slo: '1.088', tpr: '1.090' });
eq(M.logRR(), null, 'Log: Short with TP above entry → no R:R');
setFields({ ast: 'EUR/USD', ent: '1.085', slo: '1.082', tpr: '1.085' });
eq(M.logRR(), null, 'Log: TP == entry → no R:R');

// 8. Log custom risk: empty/unreadable → '' (never 'NaN%' in column J).
setFields({ rsk: 'custom', rskCustom: '' });
eq(M.getLogRisk(), '', 'getLogRisk custom empty → ""');
setFields({ rsk: 'custom', rskCustom: 'abc' });
eq(M.getLogRisk(), '', 'getLogRisk custom garbage → ""');
setFields({ rsk: 'custom', rskCustom: '0,33' });
eq(M.getLogRisk(), 0.33, "getLogRisk custom '0,33' → 0.33");
setFields({ rsk: '0.25' });
eq(M.getLogRisk(), '0.25', 'getLogRisk preset → select value verbatim');

// 9. Auto direction from Entry vs SL (used by the Log inputs and by sendToLog).
state.dirManual = false; state.direction = 'Long';
setFields({ ast: 'EUR/USD', ent: '1.085', slo: '1.088' });
M.maybeAutoDirection();
eq(state.direction, 'Short', 'Entry < SL → Short');
setFields({ ast: 'US100', ent: '20,150', slo: '20,100' });
M.maybeAutoDirection();
eq(state.direction, 'Long', "US100 '20,150' > '20,100' → Long (band-resolved)");
state.dirManual = true;
setFields({ ast: 'EUR/USD', ent: '1.085', slo: '1.088' });
M.maybeAutoDirection();
eq(state.direction, 'Long', 'manual pin is respected by maybeAutoDirection');
state.dirManual = false;

// 10. Plausibility checks (warnings only). EUR/USD 8.33 lots @1.085 on 100k → 9.04x.
let c = M.sizeChecks(8.33, 1.085, 0.0003, 100000, 100000, 100);
approx(c.lev, 8.33 * 100000 * 1.085 / 100000, 1e-9, 'EUR/USD notional leverage');
ok(!c.levOver && !c.tightSl, 'normal 3-pip EUR/USD trade: no warning');
//     Typo: SL 1.0849 for entry 1.0850 → 1 pip → tight-SL warning.
c = M.sizeChecks(25, 1.085, 0.0001, 100000, 100000, 100);
ok(c.tightSl, '1-pip SL on EUR/USD flagged as tight');
//     USD/JPY derived cv: notional = lots × FX_LOT regardless of price.
c = M.sizeChecks(2, 150, 0.5, 100000 / 150, 100000, 100);
approx(c.lev, 2, 1e-9, 'USD/JPY 2 lots on 100k → 2x');
//     FTMO BTC at 1:3.3: 8.33 lots × 60000 = 500k on 100k → 5x → over.
c = M.sizeChecks(8.33, 60000, 30, 1, 100000, 3.3);
ok(c.levOver, 'FTMO BTC 5x exposure exceeds 1:3.3');
//     No maxLev (custom) → never levOver.
c = M.sizeChecks(1000, 60000, 30, 1, 100000, undefined);
ok(!c.levOver, 'custom instrument without maxLev: no leverage warning');
//     Every FTMO/Breakout preset except Custom carries band + maxLev.
for (const [brk, list] of Object.entries(M.PRESETS)) {
  for (const p of list) {
    if (/^Custom/.test(p.s)) continue;
    ok(Array.isArray(p.band) && p.band[0] < p.band[1], `${brk}/${p.s} has a valid band`);
    ok(p.maxLev > 0, `${brk}/${p.s} has maxLev`);
  }
}

// 11. Risk $ handed to the log = real risk of the floored volume (≤ target).
setFields({ brk: 'ftmo', inst: 'EUR/USD', accPreset: '100000', szRisk: '0.25',
            szEntry: '1.08500', szSL: '1.08200', szTP: '', cv: '100000' });
r = M.calcSize();
const rvEur = M.roundVol(r.vol);
approx(M.riskForVol(rvEur, r.dist, 100000), 0.83 * 0.003 * 100000, 1e-6, 'EUR/USD 0.83 lots × 30 pips → $249');
ok(M.riskForVol(rvEur, r.dist, 100000) <= r.riskAmt + 1e-9, 'floored risk never exceeds target');

// 12. Parser: space/apostrophe thousands must group by 3 (no '20150 20100' → 2015020100).
nan(M.parseNum('20150 20100'), "parseNum('20150 20100') → NaN (two numbers)");
nan(M.parseNum('12 5'), "parseNum('12 5') → NaN");
nan(M.parseNum("1'2.5"), "parseNum(\"1'2.5\") → NaN");
nan(M.parseNum('1 2345'), "parseNum('1 2345') → NaN");
nan(M.parseNum('1,23.5'), "parseNum('1,23.5') → NaN (bad US grouping)");
nan(M.parseNum('1234 567'), "parseNum('1234 567') → NaN (first group > 3 digits)");
eq(M.parseNum('1 234 567.89'), 1234567.89, "parseNum('1 234 567.89') == 1234567.89");
eq(M.parseNum('1\u00a0234,5'), 1234.5, 'parseNum with NBSP thousands == 1234.5');

// 13. Price levels outside the instrument band ('20.150' on US100 = 20.15 → 1000× size).
const us100Band = presetFtmo('US100 (NDX)').band;
eq(M.outsideBand([['Entry', 20.15], ['SL', 20.1]], us100Band).join('|'), 'Entry 20.15|SL 20.1', 'US100 20.15/20.1 flagged outside band');
eq(M.outsideBand([['Entry', 20150], ['SL', NaN]], us100Band).length, 0, 'in-band / NaN levels not flagged');
eq(M.outsideBand([['Entry', 1]], null).length, 0, 'no band → no flag');
eq(M.outsideBand([['Entry', 1085]], [0.5, 2]).length, 1, 'above the band is flagged too (EUR/USD 1085)');

// 14. Sheet column J helper.
eq(M.sheetRisk('0.25'), '0.25%', "sheetRisk('0.25') == '0.25%'");
eq(M.sheetRisk(''), '', "sheetRisk('') == '' (never 'NaN%')");

// 15. "New trade" clears exactly the trade fields; stable settings are never in the list.
eq(M.TRADE_FIELDS.join(','), 'ast,ent,slo,tpr,vol,nte,shot,exi,rskUsd,pnl,res,mgmt,emo,fbk', 'TRADE_FIELDS = the 14 trade-specific ids');
for (const keep of ['ses', 'rsk', 'rskCustom', 'stp', 'btId', 'pl']) ok(!M.TRADE_FIELDS.includes(keep), `TRADE_FIELDS must not clear '${keep}'`);
ok(M.TRANSFER_FIELDS.every((id) => M.TRADE_FIELDS.includes(id)), 'TRANSFER_FIELDS ⊂ TRADE_FIELDS');

// 16. sendToLog end to end (real function, DOM stubbed).
//     Previous trade: Long pinned, old extras filled. New sizer trade: EUR/USD SHORT.
const sizerShort = { brk: 'ftmo', inst: 'EUR/USD', accPreset: '100000', szRisk: '0.25', szRiskCustom: '',
  szEntry: '1.08500', szSL: '1.08800', szTP: '1.07900', cv: '100000', rsk: '0.25' };
setFields({ ...sizerShort, ast: 'OLD', vol: '9.99', rskUsd: '999', exi: '1.07', pnl: '-250', res: 'Lose', nte: 'old note', emo: 'tilt', ses: 'NY', stp: 'Other' });
state.dirManual = true; state.direction = 'Long'; win.confirmAnswer = true; win.confirmAsked = 0; calls.length = 0;
M.sendToLog();
eq(state.direction, 'Short', 'sendToLog derives Short from the transferred levels');
eq(state.dirManual, false, 'sendToLog drops the previous Long pin');
eq(fields.ast, 'EUR/USD', 'asset transferred');
eq(fields.vol, '0.83', 'volume = floored 0.8333 → 0.83');
eq(fields.rskUsd, '249.00', 'Risk $ = 0.83 × 0.003 × 100000');
eq(win.confirmAsked, 1, 'leftover extras → one confirm');
ok(['exi', 'pnl', 'res', 'nte', 'emo'].every((id) => fields[id] === ''), 'confirmed: previous trade extras cleared');
eq(fields.ses + '|' + fields.stp, 'NY|Other', 'session/setup untouched');
ok(calls.includes('setTab:log'), 'switches to the Log tab');
//     Cancel keeps the extras (re-sizing the same trade).
setFields({ ...sizerShort, nte: 'keep me', exi: '1.07' });
win.confirmAnswer = false; M.sendToLog();
eq(fields.nte + '|' + fields.exi, 'keep me|1.07', 'cancelled confirm keeps note/extras');
//     No leftovers → no confirm.
setFields({ ...sizerShort }); win.confirmAsked = 0; M.sendToLog();
eq(win.confirmAsked, 0, 'no leftovers → no confirm');
//     Fields the transfer overwrites itself are never "leftovers".
setFields({ ...sizerShort, ast: 'OLD', ent: '1', slo: '2', tpr: '3', vol: '9.99', rskUsd: '999' }); win.confirmAsked = 0; M.sendToLog();
eq(win.confirmAsked, 0, 'only transfer fields filled → no confirm');
//     No sizer result → previous volume / Risk $ are cleared, not carried.
setFields({ ...sizerShort, szSL: '', vol: '9.99', rskUsd: '999' }); M.sendToLog();
eq(fields.vol + '|' + fields.rskUsd, '|', 'no result → vol and Risk $ cleared');
win.confirmAnswer = true; state.dirManual = false;

// 17. copyForSheet — the real row (live 23 / backtest 28), column J never 'NaN%' / '%'.
const lastCopy = () => { for (let i = calls.length - 1; i >= 0; i--) if (calls[i] && calls[i].copied != null) return calls[i].copied.split('\t'); return null; };
const logBase = { ast: 'EUR/USD', ent: '1.085', slo: '1.082', tpr: '1.091', vol: '0.83', ses: 'London', stp: 'Other', nte: '', btId: 'BT-1', pl: 'P' };
state.mode = 'live'; state.direction = 'Long';
setFields({ ...logBase, rsk: '0.25' }); M.copyForSheet();
let row = lastCopy();
eq(row.length, 23, 'copyForSheet live row has 23 cells');
eq(row[9], '0.25%', 'copyForSheet live J = 0.25%');
eq(row.slice(12, 16).join(''), '', 'copyForSheet live M–P empty');
eq(row[16], 'Long', 'copyForSheet live Q = direction');
setFields({ ...logBase, rsk: 'custom', rskCustom: '' }); M.copyForSheet();
row = lastCopy();
eq(row[9], '', "copyForSheet custom risk empty → J '' (not 'NaN%' / '%')");
ok(!row.join('|').includes('NaN'), 'copyForSheet row never contains NaN');
state.mode = 'backtest';
setFields({ ...logBase, rsk: 'custom', rskCustom: '0,33' }); M.copyForSheet();
row = lastCopy();
eq(row.length, 28, 'copyForSheet backtest row has 28 cells');
eq(row[14], '0.33%', 'copyForSheet backtest J (index 14) = 0.33%');
eq(row[0] + '|' + row[1], 'BT-1|P', 'copyForSheet backtest A/B = btId/pool');
state.mode = 'live';

/* =================== SUMMARY =================== */

const total = pass + fail;
if (fail === 0) console.log(`PASS ${pass}/${total}`);
else console.log(`FAIL ${pass}/${total} passed (${fail} failed)`);
