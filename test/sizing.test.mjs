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
  extractVarLiteral('SHEET_COLUMNS', '{', '}'),
  extractFn('parseNum'),
  extractFn('contractValueFor'),
  extractFn('currentPreset'),
  extractFn('stepFor'),
  extractFn('roundVol'),
  extractFn('stepDecimals'),
  extractFn('getAccount'),
  // getSizerRisk feeds calcSize (preset select vs. 'custom' free-text field);
  // it MUST be extracted or calcSize throws ReferenceError when evaluated.
  extractFn('getSizerRisk'),
  extractFn('calcSize')
];

// Mutable field map standing in for the DOM inputs/selects.
const fields = {};
function setFields(obj) { for (const k in fields) delete fields[k]; Object.assign(fields, obj); }
// `$` stub: returns an object whose .value is the (string) field, matching real inputs.
const $ = (id) => ({ value: id in fields ? fields[id] : '' });

const factory = new Function('$', 'fields', `
  ${pieces.join('\n')}
  return { PRESETS, FX_LOT, SHEET_COLUMNS, parseNum, contractValueFor, currentPreset, stepFor, roundVol, stepDecimals, getAccount, getSizerRisk, calcSize };
`);
const M = factory($, fields);

/* ---------- preset lookups (by display name, from extracted PRESETS) ---------- */

const presetByName = (name) => M.PRESETS.ftmo.find((p) => p.s === name);
const EURUSD = presetByName('EUR/USD');
const USDJPY = presetByName('USD/JPY');

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

// sanity: presets were actually found
ok(!!EURUSD && !!USDJPY, 'EUR/USD and USD/JPY presets must exist in PRESETS.ftmo');

// FX_LOT is the standard-lot notional and the basis for JPY cv derivation. Pin it
// EXACTLY (integer, no tolerance) — a small drift (e.g. 100000->100001) is otherwise
// invisible to the loose cv/vol tolerances and would slip through unnoticed.
eq(M.FX_LOT, 100000, 'FX_LOT must be 100000 (standard-lot notional)');

// 2. contractValueFor — JPY derives cv = FX_LOT / entry; non-JPY is static.
//    Expect the EXACT 100000/150 at tol 1e-6 so FX_LOT drift also fails through the cv
//    path, not only via the direct pin above. Rounded 666.67 +/-0.01 was too loose.
approx(M.contractValueFor(USDJPY, '150'), 100000 / 150, 1e-6, 'contractValueFor(USD/JPY,"150") == 100000/150');
eq(M.contractValueFor(EURUSD, '1.085'), 100000, 'contractValueFor(EUR/USD,"1.085") == 100000');

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

/* =================== SUMMARY =================== */

const total = pass + fail;
if (fail === 0) console.log(`PASS ${pass}/${total}`);
else console.log(`FAIL ${pass}/${total} passed (${fail} failed)`);
