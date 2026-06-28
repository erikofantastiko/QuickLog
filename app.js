(function(){
'use strict';

/* ============================================================
   QuickLog — Position Sizer + Trade Log
   Single-file app. Sections: Constants · State · Utils ·
   Sizer · Log card · Log actions · Chart · Persistence · Wiring
   ============================================================ */

var $ = function(id){ return document.getElementById(id); };

/* ---------- Constants ---------- */

// Instrument presets per broker.
// cv = account-currency (USD) value per 1.0 price move, per lot.
// quote:'JPY' marks pairs whose cv must be derived from entry (cv = 100000 / price).
var PRESETS = {
  ftmo:[
    {s:'EUR/USD',cv:100000,unit:'lots',step:0.01,hint:'1 lot = 100,000 units',tv:'OANDA:EURUSD'},
    {s:'GBP/USD',cv:100000,unit:'lots',step:0.01,hint:'1 lot = 100,000 units',tv:'OANDA:GBPUSD'},
    {s:'USD/JPY',cv:100000,unit:'lots',step:0.01,quote:'JPY',hint:'1 lot = 100,000 units (÷ JPY price)',tv:'OANDA:USDJPY'},
    {s:'EUR/JPY',cv:100000,unit:'lots',step:0.01,quote:'JPY',hint:'1 lot = 100,000 units (÷ JPY price)',tv:'OANDA:EURJPY'},
    {s:'GBP/JPY',cv:100000,unit:'lots',step:0.01,quote:'JPY',hint:'1 lot = 100,000 units (÷ JPY price)',tv:'OANDA:GBPJPY'},
    {s:'EUR/GBP',cv:100000,unit:'lots',step:0.01,hint:'1 lot = 100,000 units',tv:'OANDA:EURGBP'},
    {s:'AUD/USD',cv:100000,unit:'lots',step:0.01,hint:'1 lot = 100,000 units',tv:'OANDA:AUDUSD'},
    {s:'USD/CAD',cv:100000,unit:'lots',step:0.01,hint:'1 lot = 100,000 units',tv:'OANDA:USDCAD'},
    {s:'US100 (NDX)',cv:1,unit:'lots',step:0.01,hint:'≈ $1 / point / lot',tv:'OANDA:NAS100USD'},
    {s:'US500 (SPX)',cv:1,unit:'lots',step:0.01,hint:'≈ $1 / point / lot',tv:'OANDA:SPX500USD'},
    {s:'XAU/USD',cv:100,unit:'lots',step:0.01,hint:'1 lot = 100 oz → $100 / $1 move',tv:'OANDA:XAUUSD'},
    {s:'XAG/USD',cv:5000,unit:'lots',step:0.01,hint:'1 lot = 5000 oz → $5000 / $1 move',tv:'OANDA:XAGUSD'},
    {s:'BTC/USD',cv:1,unit:'lots',step:0.01,hint:'≈ 1 unit per lot',tv:'BITSTAMP:BTCUSD'},
    {s:'ETH/USD',cv:1,unit:'lots',step:0.01,hint:'≈ 1 unit per lot',tv:'BITSTAMP:ETHUSD'},
    {s:'Custom…',cv:'',unit:'lots',step:0.01,hint:'enter contract value manually',tv:''}
  ],
  breakout:[
    {s:'BTC',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:BTCUSD'},
    {s:'ETH',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:ETHUSD'},
    {s:'SOL',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:SOLUSD'},
    {s:'XRP',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:XRPUSD'},
    {s:'ADA',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:ADAUSD'},
    {s:'AVAX',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:AVAXUSD'},
    {s:'LINK',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:LINKUSD'},
    {s:'DOGE',cv:1,unit:'coins',step:0.001,hint:'size in coins · Risk$ ÷ SL-dist',tv:'KRAKEN:DOGEUSD'},
    {s:'Custom…',cv:1,unit:'coins',step:0.001,hint:'perp · size in coins',tv:''}
  ],
  custom:[{s:'Custom',cv:'',unit:'units',step:0.01,hint:'enter contract value manually',tv:''}]
};

// FX standard lot notional — basis for JPY-quoted cv derivation.
var FX_LOT = 100000;

// Column order for the Google Sheet export. Must stay byte-identical to
// the downstream sheet layout — '' marks a column the sheet fills itself.
var SHEET_COLUMNS = {
  // live: [_, datetime, asset, _, entry, _, sl, tp, vol, risk, _, _, _, rr, _, _, dir, session, _, setup+note, _, _, _]
  live:      ['', 'dt', 'asset', '', 'entry', '', 'sl', 'tp', 'vol', 'risk', '', '', '', 'rr', '', '', 'dir', 'session', '', 'note', '', '', ''],
  // backtest: [btId, pool, date, _, _, _, datetime, asset, _, entry, _, sl, tp, vol, risk, _, _, _, rr, _, _, dir, session, _, setup+note, _, _, _]
  backtest:  ['btId', 'pool', 'date', '', '', '', 'dt', 'asset', '', 'entry', '', 'sl', 'tp', 'vol', 'risk', '', '', '', 'rr', '', '', 'dir', 'session', '', 'note', '', '', '']
};

var STORAGE_KEY = 'quicklog';

// Inputs/selects whose raw value is persisted verbatim.
var PERSISTED_FIELDS = [
  'brk','accPreset','accCustom','inst','szRisk','szRiskCustom','cv','szEntry','szSL','szTP','feedInput',
  'btId','pl','ast','ses','rsk','rskCustom','ent','slo','tpr','vol','stp','nte'
];

/* ---------- State ---------- */

var state = {
  direction:'Long',   // 'Long' | 'Short'
  mode:'live',        // 'live' | 'backtest'
  tab:'size',         // 'size' | 'log'
  chartOpen:false,
  feedOverride:'',
  cvManual:false,     // true once the user types into the Contract Value field
  dirManual:false,    // true once the user clicks Long/Short; auto-detect from entry vs SL until then
  chartInterval:'1h', // LWC timeframe ('15m'|'1h'|'4h'|'1d'); maps to Kraken minutes / TD strings
  lwc:null            // active Lightweight Charts crypto chart {chart,series,lines:[],resize} or null
};

/* ---------- Utils ---------- */

function parseNum(v){ return parseFloat(String(v).replace(',','.')); }
function today(){ return new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}); }

// Escape free user text before it goes into innerHTML (Preview + PNG share cardHtml).
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtVol(v){
  if(v>=100) return v.toFixed(1);
  if(v>=1)   return v.toFixed(2);
  return v.toFixed(3);
}

function toast(msg){
  var t=$('tst'); t.textContent=msg; t.classList.add('vis');
  setTimeout(function(){ t.classList.remove('vis'); },2200);
}

function copyText(txt){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){toast('Copied ✓')}).catch(function(){legacyCopy(txt)});
  } else {
    legacyCopy(txt);
  }
}
function legacyCopy(txt){
  var a=document.createElement('textarea');
  a.value=txt; a.style.cssText='position:fixed;left:-9999px';
  document.body.appendChild(a); a.select();
  try{ document.execCommand('copy'); toast('Copied ✓'); }catch(e){ toast('Copy failed'); }
  document.body.removeChild(a);
}

function currentPreset(){
  var list=PRESETS[$('brk').value]||[];
  var name=$('inst').value;
  return list.find(function(x){return x.s===name;});
}

/* ---------- Sizer ---------- */

// Tradeable volume step for the current instrument (lots/coins).
// Per-preset assumption (floor-safe, correctable via preset edit). Fallback 0.01.
function stepFor(){
  var p=currentPreset();
  return (p && p.step>0) ? p.step : 0.01;
}
// Round the raw sizing volume DOWN to the tradeable step so risk never exceeds target.
// +1e-9 absorbs IEEE-754 floor error (e.g. 0.29/0.01 = 28.999…); too small to over-size.
function roundVol(v){ var st=stepFor(); return Math.floor(v/st + 1e-9)*st; }
// Decimal places of the current step, so the displayed/logged value isn't re-truncated.
function stepDecimals(){ var st=String(stepFor()); var i=st.indexOf('.'); return i<0?0:st.length-i-1; }

// Resolve the contract value for a preset given the current entry.
// JPY-quoted pairs derive cv = FX_LOT / entry; everything else is static.
function contractValueFor(preset, entryStr){
  if(preset && preset.quote==='JPY'){
    var e=parseNum(entryStr);
    if(isNaN(e)||e<=0) return NaN;
    return FX_LOT/e;
  }
  return preset?parseNum(preset.cv):NaN;
}

// Keep the Contract Value field + hint in sync with instrument & entry.
// For JPY pairs the field is auto-derived from entry unless the user overrode it.
function syncContractValue(){
  var p=currentPreset();
  var hintEl=$('cvHint'), cvEl=$('cv');
  if(p && p.quote==='JPY' && !state.cvManual){
    var derived=contractValueFor(p,$('szEntry').value);
    cvEl.value=isNaN(derived)?'':derived.toFixed(2);
    hintEl.textContent='(≈ 100,000 ÷ entry — auto from entry price)';
  } else if(p && p.quote==='JPY' && state.cvManual){
    hintEl.textContent='(manual override — JPY auto-derive off)';
  } else if(p){
    hintEl.textContent='('+p.hint+')';
  }
}

// Sizer risk %: 'custom' select value falls back to the free-text field,
// mirroring getAccount()'s preset/custom split.
function getSizerRisk(){
  if($('szRisk').value==='custom') return parseNum($('szRiskCustom').value);
  return parseFloat($('szRisk').value);
}

function calcSize(){
  var acc=getAccount(),
      risk=getSizerRisk(),
      e=parseNum($('szEntry').value),
      s=parseNum($('szSL').value),
      t=parseNum($('szTP').value),
      cv=parseNum($('cv').value);
  if(isNaN(acc)||isNaN(risk)||isNaN(e)||isNaN(s)||isNaN(cv)||e===s||cv<=0) return null;
  var riskAmt=acc*(risk/100);
  var dist=Math.abs(e-s);
  var vol=riskAmt/(dist*cv);
  var rr=null, rewardAmt=null, tpWrongSide=false;
  // Direction is implicit: Entry>SL ⇒ Long, Entry<SL ⇒ Short.
  // A TP on the wrong side (e.g. Long with TP below entry) would otherwise
  // still show a plausible positive R:R via Math.abs — flag it instead.
  if(!isNaN(t)&&t!==e){
    tpWrongSide = Math.sign(e-s) !== Math.sign(t-e);
    if(!tpWrongSide){ rr=Math.abs(t-e)/dist; rewardAmt=riskAmt*rr; }
  }
  return {riskAmt:riskAmt,dist:dist,vol:vol,rr:rr,rewardAmt:rewardAmt,tpWrongSide:tpWrongSide};
}

function renderSize(){
  syncContractValue();
  var p=currentPreset();
  var unit=p?p.unit:'lots';
  var r=calcSize();
  var out=$('szOut');
  if(!r){ out.innerHTML='<div style="color:var(--tx3);text-align:center;padding:8px">Enter account, entry, stop &amp; contract value</div>'; return; }
  // Floor the raw volume to the tradeable step before display/transfer; raw
  // sizing math (calcSize) stays untouched. rv==0 means vol < one step.
  var rv=roundVol(r.vol), st=stepFor();
  // Warnings, in precedence order: invalid size, then below-minimum size,
  // then wrong-side TP (no R:R shown), then advisory R:R<1. Wrong-side wins
  // over R:R<1 because rr is null when the TP sits on the wrong side.
  var warn = '';
  if(r.vol<=0){
    warn = '<div class="sz-warn">Invalid size — check inputs</div>';
  } else if(rv<=0){
    warn = '<div class="sz-warn">Below minimum size (step '+st+') — increase risk or account</div>';
  } else if(r.tpWrongSide){
    warn = '<div class="sz-warn">Take Profit on wrong side for this entry/stop — check direction</div>';
  } else if(r.rr!=null && r.rr<1){
    warn = '<div class="sz-warn soft">R:R below 1 — reward smaller than risk</div>';
  }
  out.innerHTML=
    '<div class="sz-big"><div><span class="sz-vol">'+rv.toFixed(stepDecimals())+'</span><span class="sz-unit">'+unit+' · step '+st+'</span></div>'
    +(r.rr?'<div style="text-align:right"><div class="cpl">R:R</div><div class="cbv" style="color:var(--gn);font-size:22px">'+r.rr.toFixed(2)+'R</div></div>':'')+'</div>'
    +'<div class="sz-grid">'
    +'<div class="sz-cell"><div class="cpl">Risk</div><div class="cpv">$'+r.riskAmt.toFixed(0)+'</div></div>'
    +'<div class="sz-cell"><div class="cpl">SL Distance</div><div class="cpv">'+r.dist.toFixed(5).replace(/0+$/,'').replace(/\.$/,'')+'</div></div>'
    +'<div class="sz-cell"><div class="cpl">Reward</div><div class="cpv">'+(r.rewardAmt?'$'+r.rewardAmt.toFixed(0):'—')+'</div></div>'
    +'</div>'+warn;
}

function getAccount(){
  var v=$('accPreset').value;
  if(v==='custom') return parseNum($('accCustom').value)||0;
  return parseFloat(v);
}

// Log risk %: 'custom' select value falls back to the free-text field. Returns
// the bare value (no '%') — copyForSheet/cardHtml append the unit. The sheet
// column ORDER is unchanged; only the value source switches for custom.
function getLogRisk(){
  if($('rsk').value==='custom') return parseNum($('rskCustom').value);
  return $('rsk').value;
}

/* ---------- Log card (shared by live Preview + PNG export) ---------- */

// Read the Trade Log fields into a plain data object.
function readCard(){
  return {
    asset:   $('ast').value||'—',
    session: $('ses').value,
    setup:   $('stp').value,
    risk:    getLogRisk(),
    entry:   $('ent').value||'—',
    sl:      $('slo').value||'—',
    tp:      $('tpr').value||'—',
    note:    $('nte').value,
    rr:      logRR(),
    isLong:  state.direction==='Long',
    date:    today()
  };
}

function logRR(){
  var e=parseNum($('ent').value), s=parseNum($('slo').value), t=parseNum($('tpr').value);
  if(isNaN(e)||isNaN(s)||isNaN(t)||s===e) return null;
  return (Math.abs(t-e)/Math.abs(e-s)).toFixed(2);
}

// Inline-styled trade card (no CSS-var dependency) so the same markup
// renders identically in the live preview box and in the detached
// html2canvas node used for the PNG export.
function cardHtml(d){
  var rrColor = d.rr ? (d.isLong?'#3ecf8e':'#e5484d') : '#56565c';
  var badgeBg = d.isLong?'rgba(62,207,142,.12)':'rgba(229,72,77,.12)';
  var badgeFg = d.isLong?'#3ecf8e':'#e5484d';
  var badgeTx = d.isLong?'↑ Long':'↓ Short';
  function cell(label,val){
    return '<div style="background:#0c0c0e;border-radius:8px;padding:10px 12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#56565c;margin-bottom:4px">'+label+'</div><div style="font-size:14px;font-weight:600;font-family:monospace;color:#e4e4e7">'+val+'</div></div>';
  }
  function big(label,val,color){
    return '<div style="background:#0c0c0e;border-radius:8px;padding:12px 14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#56565c;margin-bottom:4px">'+label+'</div><div style="font-size:24px;font-weight:600;font-family:monospace;color:'+color+'">'+val+'</div></div>';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">'
    +'<div><div style="font-size:24px;font-weight:600;color:#e4e4e7">'+esc(d.asset)+'</div><div style="font-size:13px;color:#8a8a90;margin-top:4px">'+d.session+' · '+d.setup+'</div></div>'
    +'<div style="text-align:right"><span style="display:inline-block;padding:4px 12px;border-radius:10px;font-size:13px;font-weight:600;background:'+badgeBg+';color:'+badgeFg+'">'+badgeTx+'</span><div style="font-size:11px;color:#56565c;margin-top:6px">'+d.date+'</div></div></div>'
    +'<div style="height:1px;background:#2a2a2e;margin:14px 0"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'+cell('Entry',esc(d.entry))+cell('Stop loss',esc(d.sl))+cell('Take profit',esc(d.tp))+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+big('R:R',d.rr?d.rr+'R':'—',rrColor)+big('Risk',d.risk+'%','#e4e4e7')+'</div>'
    +(d.note?'<div style="margin-top:12px;padding:10px 12px;background:#0c0c0e;border-radius:8px;font-size:13px;color:#8a8a90;font-style:italic">'+esc(d.note)+'</div>':'');
}

/* ---------- Sizer card (PNG export) ---------- */

// Read the Sizer fields + calcSize() result into a plain data object for the
// PNG card. Returns null when inputs are incomplete (calcSize null) so the
// export can bail with a hint instead of rendering an empty image.
function readSizer(){
  var r=calcSize();
  if(!r) return null;
  var p=currentPreset();
  var brkEl=$('brk'), brkLabel=(brkEl && brkEl.selectedIndex>=0) ? brkEl.options[brkEl.selectedIndex].text : brkEl.value;
  var e=parseNum($('szEntry').value), s=parseNum($('szSL').value);
  return {
    instrument: $('inst').value||'—',
    broker:     brkLabel,
    account:    getAccount(),
    risk:       getSizerRisk(),
    entry:      $('szEntry').value||'—',
    sl:         $('szSL').value||'—',
    tp:         $('szTP').value||'—',
    vol:        roundVol(r.vol).toFixed(stepDecimals()),
    unit:       p?p.unit:'lots',
    rr:         r.rr,
    riskAmt:    r.riskAmt,
    isLong:     e>s,
    date:       today()
  };
}

// Inline-styled sizer card (no CSS-var dependency), same dark idiom as
// cardHtml, so it renders identically in the detached html2canvas node.
// Instrument/broker come from the preset selects → already safe; routed
// through esc() defensively in case a free-text value ever flows in.
function sizerCardHtml(d){
  var rrColor = d.rr!=null ? (d.isLong?'#3ecf8e':'#e5484d') : '#56565c';
  var badgeBg = d.isLong?'rgba(62,207,142,.12)':'rgba(229,72,77,.12)';
  var badgeFg = d.isLong?'#3ecf8e':'#e5484d';
  var badgeTx = d.isLong?'↑ Long':'↓ Short';
  function cell(label,val){
    return '<div style="background:#0c0c0e;border-radius:8px;padding:10px 12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#56565c;margin-bottom:4px">'+label+'</div><div style="font-size:14px;font-weight:600;font-family:monospace;color:#e4e4e7">'+val+'</div></div>';
  }
  function big(label,val,color){
    return '<div style="background:#0c0c0e;border-radius:8px;padding:12px 14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#56565c;margin-bottom:4px">'+label+'</div><div style="font-size:24px;font-weight:600;font-family:monospace;color:'+color+'">'+val+'</div></div>';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">'
    +'<div><div style="font-size:24px;font-weight:600;color:#e4e4e7">'+esc(d.instrument)+'</div><div style="font-size:13px;color:#8a8a90;margin-top:4px">'+esc(d.broker)+' · $'+d.account.toLocaleString('en-US')+' · '+d.risk+'%</div></div>'
    +'<div style="text-align:right"><span style="display:inline-block;padding:4px 12px;border-radius:10px;font-size:13px;font-weight:600;background:'+badgeBg+';color:'+badgeFg+'">'+badgeTx+'</span><div style="font-size:11px;color:#56565c;margin-top:6px">'+d.date+'</div></div></div>'
    +'<div style="background:#0c0c0e;border-radius:8px;padding:14px 16px;margin-bottom:14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#56565c;margin-bottom:4px">Position size</div><div style="font-size:32px;font-weight:700;font-family:monospace;color:#e4e4e7">'+d.vol+'<span style="font-size:15px;font-weight:600;color:#8a8a90;margin-left:8px">'+d.unit+'</span></div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'+cell('Entry',esc(d.entry))+cell('Stop loss',esc(d.sl))+cell('Take profit',esc(d.tp))+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+big('R:R',d.rr!=null?d.rr.toFixed(2)+'R':'—',rrColor)+big('Risk',' $'+d.riskAmt.toFixed(0),'#e4e4e7')+'</div>';
}

// Export the sizer result as a PNG via the shared exportNodePng helper.
// Bails with a hint toast when inputs are incomplete (no empty image).
function exportSizerPng(){
  var b=$('szExb');
  var d=readSizer();
  if(!d){ toast('Enter sizer inputs first'); return; }
  b.textContent='Rendering...'; b.style.pointerEvents='none';
  var tmp=document.createElement('div');
  tmp.style.cssText='position:absolute;left:-9999px;top:0;width:520px;padding:24px;background:#0c0c0e;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Inter,sans-serif;color:#e4e4e7;font-size:15px;line-height:1.5';
  tmp.innerHTML='<div style="background:#151517;border:1px solid #2a2a2e;border-radius:12px;padding:20px">'+sizerCardHtml(d)+'</div>';
  exportNodePng(tmp, (d.instrument!=='—'?d.instrument:'sizer'), b, 'Copy Sizer PNG');
}

/* ---------- Log actions ---------- */

function copyForSheet(){
  var n=new Date();
  var datetime=n.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+n.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  var setup=$('stp').value, note=$('nte').value;
  var values={
    btId:    $('btId').value,
    pool:    $('pl').value,
    date:    today(),
    dt:      datetime,
    asset:   $('ast').value,
    entry:   $('ent').value,
    sl:      $('slo').value,
    tp:      $('tpr').value,
    vol:     $('vol').value,
    risk:    getLogRisk()+'%',
    rr:      logRR()||'',
    dir:     state.direction,
    session: $('ses').value,
    note:    setup+(note?' – '+note:'')
  };
  var cols=SHEET_COLUMNS[state.mode];
  var row=cols.map(function(key){ return key?(values[key]||''):''; });
  copyText(row.join('\t'));
}

// Shared html2canvas → clipboard-or-download core. Renders the detached node
// `tmp` (already styled by the caller), copies the PNG via ClipboardItem with
// the synchronous Promise pattern Safari needs, or downloads it as a fallback.
// `tmp` is removed on EVERY path; `btn` is restored to `btnLabel` + pointer
// events on every outcome. filenameBase gets the date + .png suffix appended.
// Behaviour (toasts, filename, clipboard/download split) is identical to the
// original inline exportPng body, so existing callers are unchanged.
function exportNodePng(tmp, filenameBase, btn, btnLabel){
  document.body.appendChild(tmp);

  function filename(){ return filenameBase.replace(/\//g,'-')+'_'+today().replace(/\//g,'-')+'.png'; }
  function restore(){ btn.textContent=btnLabel; btn.style.pointerEvents='auto'; }
  function downloadBlob(bl){ var url=URL.createObjectURL(bl); var l=document.createElement('a'); l.download=filename(); l.href=url; l.click(); URL.revokeObjectURL(url); restore(); toast('PNG saved ✓'); }

  var canClip=navigator.clipboard && window.ClipboardItem && window.isSecureContext;

  if(canClip){
    // Safari requires the ClipboardItem to be constructed synchronously in the
    // click handler with a Promise of the blob — do NOT await then write.
    var blobPromise=html2canvas(tmp,{backgroundColor:'#0c0c0e',scale:2,useCORS:true,logging:false})
      .then(function(c){ if(tmp.parentNode) document.body.removeChild(tmp); return new Promise(function(res){ c.toBlob(function(bl){res(bl);}, 'image/png'); }); });
    navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})])
      .then(function(){ restore(); toast('Bild kopiert — in X einfügen ✓'); })
      .catch(function(){
        blobPromise.then(function(bl){ if(!bl){ restore(); toast('Copy failed'); return; } downloadBlob(bl); })
          .catch(function(e){ if(tmp.parentNode) document.body.removeChild(tmp); restore(); toast('Error: '+e.message); });
      });
  } else {
    html2canvas(tmp,{backgroundColor:'#0c0c0e',scale:2,useCORS:true,logging:false}).then(function(c){
      if(tmp.parentNode) document.body.removeChild(tmp);
      c.toBlob(function(bl){ if(!bl){ restore(); toast('Copy failed'); return; } downloadBlob(bl); }, 'image/png');
    }).catch(function(e){
      if(tmp.parentNode) document.body.removeChild(tmp); restore(); toast('Error: '+e.message);
    });
  }
}

function exportPng(){
  var b=$('exb');
  b.textContent='Rendering...'; b.style.pointerEvents='none';
  var tmp=document.createElement('div');
  tmp.style.cssText='position:absolute;left:-9999px;top:0;width:520px;padding:24px;background:#0c0c0e;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Inter,sans-serif;color:#e4e4e7;font-size:15px;line-height:1.5';
  var d=readCard();
  tmp.innerHTML='<div style="background:#151517;border:1px solid #2a2a2e;border-radius:12px;padding:20px">'+cardHtml(d)+'</div>';
  exportNodePng(tmp, (d.asset!=='—'?d.asset:'trade'), b, 'PNG for X');
}

// Transfer the Sizer result into the Trade Log fields.
function sendToLog(){
  var r=calcSize();
  var instName=$('inst').value.replace(/\s*\(.*\)/,''); // strip "(NDX)"
  $('ast').value=instName.toUpperCase();
  $('ent').value=$('szEntry').value;
  $('slo').value=$('szSL').value;
  $('tpr').value=$('szTP').value;
  // Carry risk %, including a custom free-text value, into the log.
  $('rsk').value=$('szRisk').value;
  if($('szRisk').value==='custom') $('rskCustom').value=$('szRiskCustom').value;
  $('rskCustomWrap').style.display=$('rsk').value==='custom'?'block':'none';
  if(r) $('vol').value=roundVol(r.vol).toFixed(stepDecimals());
  setTab('log');
  update();
  toast('Sent to Trade Log ✓');
}

/* ---------- View switching ---------- */

function setTab(t){
  state.tab=t;
  $('tab-size').className='mb'+(t==='size'?' on':'');
  $('tab-log').className='mb'+(t==='log'?' on':'');
  $('size-view').style.display=t==='size'?'block':'none';
  $('log-view').style.display=t==='log'?'block':'none';
  update();
}
function setMode(m){
  state.mode=m;
  $('bl').className='mb'+(m==='live'?' on':'');
  $('bb').className='mb'+(m==='backtest'?' on':'');
  $('btf').style.display=m==='backtest'?'block':'none';
  saveState();
}
function setDirection(d, manual){
  if(manual===true) state.dirManual=true;
  state.direction=d;
  $('blo').className='db'+(d==='Long'?' lo':'');
  $('bsh').className='db'+(d==='Short'?' so':'');
  update();
}

// Derive Long/Short from entry vs SL unless the user has pinned a choice.
// Entry > SL => Long, Entry < SL => Short. Entry == SL or invalid: leave as-is.
// Does NOT touch dirManual and does NOT call update() — the caller updates.
function maybeAutoDirection(){
  if(state.dirManual) return;
  var e=parseNum($('ent').value), s=parseNum($('slo').value);
  if(isNaN(e)||isNaN(s)||e===s) return;
  var d=e>s?'Long':'Short';
  state.direction=d;
  $('blo').className='db'+(d==='Long'?' lo':'');
  $('bsh').className='db'+(d==='Short'?' so':'');
}

function fillInstruments(){
  var sel=$('inst');
  var keep=sel.value;
  sel.innerHTML='';
  (PRESETS[$('brk').value]||[]).forEach(function(p){
    var o=document.createElement('option'); o.textContent=p.s; sel.appendChild(o);
  });
  // preserve current selection if still valid (used on restore)
  if(keep && Array.prototype.some.call(sel.options,function(o){return o.value===keep;})) sel.value=keep;
}

function onBrokerChange(){
  fillInstruments();
  onInstrumentChange();
}
function onInstrumentChange(){
  state.cvManual=false;
  var p=currentPreset();
  if(p && p.quote!=='JPY') $('cv').value=p.cv;   // JPY value is derived in syncContractValue()
  if(state.chartOpen){
    state.feedOverride='';
    var fi=$('feedInput'); if(fi) fi.value=currentTV();
    renderChart();
  }
  update();
}
function onAccPresetChange(){
  $('accCustomWrap').style.display=$('accPreset').value==='custom'?'block':'none';
  update();
}
function onSzRiskChange(){
  $('szRiskCustomWrap').style.display=$('szRisk').value==='custom'?'block':'none';
  update();
}
function onRskChange(){
  $('rskCustomWrap').style.display=$('rsk').value==='custom'?'block':'none';
  update();
}

/* ---------- Main update ---------- */

function update(){
  if(state.tab==='size') renderSize();
  $('prv').innerHTML=cardHtml(readCard());
  // Crypto chart active → move the real price lines (and keep chips cleared);
  // otherwise refresh the TV-widget chips overlay.
  if(state.lwc){ updateCryptoLevels(); var lv=$('chartLevels'); if(lv) lv.innerHTML=''; }
  else renderChartLevels();
  saveState();
}

/* ---------- TradingView chart ---------- */

function currentTV(){
  var p=currentPreset();
  return p?p.tv:'';
}

// Map a preset symbol string to a Kraken OHLC pair, or null for non-crypto.
// Covers the Breakout coins (BTC, ETH, …) and the FTMO crypto CFDs (BTC/USD,
// ETH/USD). FX / indices / metals (EUR/USD, US100, XAU/USD) → null → the caller
// keeps the existing TradingView widget + chips path. Kraken's request pairs use
// XBT (not BTC) and XDG (not DOGE); the canonical key in the response can differ
// again (e.g. XXBTZUSD) — we read it back, never assume it.
var KRAKEN_PAIRS = {
  BTC:'XBTUSD', ETH:'ETHUSD', SOL:'SOLUSD', XRP:'XRPUSD',
  ADA:'ADAUSD', AVAX:'AVAXUSD', LINK:'LINKUSD', DOGE:'XDGUSD'
};
function cryptoKrakenPair(presetSymbol){
  if(!presetSymbol) return null;
  var s=String(presetSymbol).toUpperCase().trim();
  // Breakout presets are the bare coin ('BTC'); FTMO crypto is 'BTC/USD'.
  var base=s.indexOf('/')>=0 ? s.split('/')[0] : s;
  base=base.trim();
  return Object.prototype.hasOwnProperty.call(KRAKEN_PAIRS, base) ? KRAKEN_PAIRS[base] : null;
}

// Render Entry/SL/TP as colored chips overlaid on the sizer chart. The free
// TradingView widget can't draw real price lines, so this is a static overlay
// read off the sizer's szEntry/szSL/szTP fields. Only filled values get a chip;
// empty → clears the overlay. Values are esc()'d (free-text inputs). Cheap to
// call even when the chart is hidden.
function renderChartLevels(){
  var box=$('chartLevels'); if(!box) return;
  var defs=[
    {id:'szEntry',label:'E',cls:'lvl-e'},
    {id:'szSL',   label:'SL',cls:'lvl-sl'},
    {id:'szTP',   label:'TP',cls:'lvl-tp'}
  ];
  var html='';
  defs.forEach(function(d){
    var el=$(d.id); if(!el) return;
    var v=el.value.trim(); if(!v) return;
    html+='<span class="lvl '+d.cls+'">'+d.label+' '+esc(v)+'</span>';
  });
  box.innerHTML=html;
}

// Load tv.js; invoke cb(ok). Falls back on error or timeout.
function loadTVScript(cb){
  if(window.TradingView){ cb(true); return; }
  var done=false;
  function finish(ok){ if(!done){ done=true; cb(ok); } }
  var s=document.createElement('script');
  s.src='https://s3.tradingview.com/tv.js';
  var timer=setTimeout(function(){ finish(false); },6000);
  s.onload=function(){ clearTimeout(timer); finish(true); };
  s.onerror=function(){ clearTimeout(timer); finish(false); };
  document.body.appendChild(s);
}

// Show/hide the LWC timeframe button row and, when shown, mark the active
// button from state.chartInterval. The TV widget has its own timeframes, so the
// row is hidden on the widget path. Cheap; safe if #chartTf is absent.
function setChartTf(visible){
  var box=$('chartTf'); if(!box) return;
  box.style.display=visible?'flex':'none';
  if(!visible) return;
  var btns=box.querySelectorAll('.tf');
  for(var i=0;i<btns.length;i++){
    btns[i].className='tf'+(btns[i].getAttribute('data-tf')===state.chartInterval?' on':'');
  }
}

function renderChart(){
  // Dispatch, in priority order:
  //   a) Crypto with NO manual override → Lightweight Charts + Kraken candles.
  //   b) FX / metals with NO override AND a Twelve Data key → LWC + TD candles.
  //   c) Everything else (indices, FX-without-key, override, custom) →
  //      existing TradingView widget + chips path.
  // A manual feed override is a deliberate power-user choice → always TV widget.
  // The LWC timeframe row (#chartTf) shows only on the two LWC branches (a/b).
  var p=currentPreset();
  var krakenPair = state.feedOverride ? null : cryptoKrakenPair(p ? p.s : '');
  if(krakenPair){ setChartTf(true); renderCryptoChart(krakenPair); return; }

  var tdSym = state.feedOverride ? null : twelveDataSymbol(p ? p.s : '');
  if(tdSym && tdKey()){ setChartTf(true); destroyCryptoChart(); renderTwelveDataChart(tdSym); return; }

  // Non-crypto (or overridden): existing TradingView widget + chips path,
  // unchanged. Tear down any live crypto chart first so we don't leak/double.
  setChartTf(false);
  destroyCryptoChart();
  var sym=state.feedOverride||currentTV();
  var el=$('tvChart');
  el.style.display=''; el.style.flexDirection='';
  if(!sym){ el.innerHTML='<div style="color:var(--tx3);padding:24px;text-align:center;font-size:13px">No chart for custom symbol — enter levels manually</div>'; renderChartLevels(); return; }
  el.innerHTML='';
  loadTVScript(function(ok){
    if(ok && window.TradingView){
      el.style.display=''; el.style.flexDirection='';
      el.innerHTML='';
      new TradingView.widget({
        container_id:'tvChart',
        symbol:sym, interval:'60', timezone:'Europe/Vienna',
        theme:'dark', style:'1', locale:'en',
        toolbar_bg:'#0c0c0e', hide_side_toolbar:true,
        allow_symbol_change:true, autosize:true
      });
    } else {
      renderChartFallback(sym);
    }
  });
}

// tv.js blocked (CSP/network): use the embed iframe, which survives many
// setups that block third-party script injection — plus an external link
// as the ultimate fallback if the iframe itself is blank.
function renderChartFallback(sym){
  var el=$('tvChart');
  var embed='https://s.tradingview.com/widgetembed/?frameElementId=tvIframe&symbol='+encodeURIComponent(sym)
    +'&interval=60&theme=dark&style=1&timezone=Europe/Vienna&locale=en&toolbarbg=0c0c0e&hideideas=1&hidesidetoolbar=1';
  var link='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(sym);
  el.style.display='flex'; el.style.flexDirection='column';
  el.innerHTML='<iframe src="'+embed+'" title="TradingView chart" style="flex:1;width:100%;border:0" loading="lazy"></iframe>'
    +'<a href="'+link+'" target="_blank" rel="noopener" style="display:block;padding:6px;text-align:center;font-size:12px;color:#8a8a90;background:#0c0c0e;text-decoration:none;border-top:1px solid #2a2a2e">Chart blocked here? Open on TradingView ↗</a>';
}

/* ---------- Crypto chart (Lightweight Charts + Kraken OHLC) ---------- */
// For crypto instruments we draw real candles with horizontal Entry/SL/TP
// price lines (createPriceLine) that move live as the levels are typed. The
// FX/indices/metals path above (TV widget + chips) is untouched.

// Load the vendored Lightweight Charts lib; cb(true) once window.LightweightCharts
// exists, cb(false) if both vendored file and CDN fail. Idempotent (single tag).
function loadLWC(cb){
  if(window.LightweightCharts){ cb(true); return; }
  var done=false;
  function finish(ok){ if(!done){ done=true; cb(ok); } }
  function inject(src, onFail){
    var s=document.createElement('script');
    s.src=src;
    s.onload=function(){ finish(!!window.LightweightCharts); };
    s.onerror=onFail;
    document.body.appendChild(s);
  }
  inject('./vendor/lightweight-charts.standalone.production.js', function(){
    // Vendored copy unreachable (e.g. opened from a path without it) → CDN.
    inject('https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js', function(){ finish(false); });
  });
}

// Tear down the active crypto chart and drop its refs. Safe to call when none
// is active. Removes the resize listener so closed charts don't keep resizing.
function destroyCryptoChart(){
  var l=state.lwc;
  if(!l) return;
  state.lwc=null;
  if(l.resize) try{ window.removeEventListener('resize', l.resize); }catch(e){}
  if(l.chart) try{ l.chart.remove(); }catch(e){}
}

// Which symbol the dispatch would currently bind to an LWC chart (Kraken crypto
// or — with a key — a Twelve Data FX/metal), or null. Used as the post-load
// staleness guard so a chart that finished loading after the instrument changed
// bails instead of drawing the wrong symbol. Mirrors renderChart's a/b branches.
function currentLWCSym(){
  if(state.feedOverride) return null;
  var p=currentPreset(), s=p?p.s:'';
  var kr=cryptoKrakenPair(s);
  if(kr) return kr;
  var td=twelveDataSymbol(s);
  if(td && tdKey()) return td;
  return null;
}

// Shared Lightweight Charts core. `displaySym` is the symbol this chart is bound
// to (Kraken request pair OR Twelve Data symbol) — used only for the staleness
// guard and fallback. `fetchFn()` returns Promise<Array<{time,open,high,low,close}>>
// (time in seconds, ascending). Builds the dark candlestick chart, draws the
// Entry/SL/TP price lines, and falls back to the TV widget + chips on ANY
// lib-load / fetch / shape failure so levels never vanish.
function renderLWCChart(displaySym, fetchFn){
  // Tear down a prior chart first (e.g. BTC→ETH or EURUSD switch) — no double chart.
  destroyCryptoChart();
  var el=$('tvChart');
  el.style.display=''; el.style.flexDirection='';
  el.innerHTML='<div style="color:var(--tx3);padding:24px;text-align:center;font-size:13px">Loading chart…</div>';
  // The LWC path uses real price lines, not the chips overlay.
  var lv=$('chartLevels'); if(lv) lv.innerHTML='';

  function fallback(){
    destroyCryptoChart();
    // Hand back to the TV widget using the preset's own tv symbol (does NOT
    // touch state.feedOverride — that stays a deliberate user choice).
    var tv=currentTV();
    if(tv){ var e2=$('tvChart'); e2.innerHTML=''; loadTVScript(function(ok){
      if(ok && window.TradingView){ e2.innerHTML=''; new TradingView.widget({
        container_id:'tvChart', symbol:tv, interval:'60', timezone:'Europe/Vienna',
        theme:'dark', style:'1', locale:'en', toolbar_bg:'#0c0c0e',
        hide_side_toolbar:true, allow_symbol_change:true, autosize:true });
      } else { renderChartFallback(tv); }
    }); } else { renderChartFallback(displaySym); }
    renderChartLevels();
  }

  loadLWC(function(ok){
    if(!ok || !window.LightweightCharts){ fallback(); return; }
    // Guard: instrument/chart may have changed while the lib loaded.
    if(!state.chartOpen || currentLWCSym()!==displaySym){ return; }
    el.innerHTML='';
    var w=el.clientWidth||el.offsetWidth||520;
    var chart, series;
    try{
      chart=window.LightweightCharts.createChart(el,{
        width:w, height:360,
        layout:{ background:{ color:'#0c0c0e' }, textColor:'#8a8a90' },
        grid:{ vertLines:{ color:'#1d1d20' }, horzLines:{ color:'#1d1d20' } },
        rightPriceScale:{ borderColor:'#2a2a2e' },
        timeScale:{ borderColor:'#2a2a2e' }
      });
      series=chart.addCandlestickSeries({
        upColor:'#3ecf8e', downColor:'#e5484d',
        borderUpColor:'#3ecf8e', borderDownColor:'#e5484d',
        wickUpColor:'#3ecf8e', wickDownColor:'#e5484d'
      });
    }catch(e){ fallback(); return; }

    function onResize(){ try{ chart.applyOptions({ width: el.clientWidth||w }); }catch(e){} }
    window.addEventListener('resize', onResize);
    state.lwc={ chart:chart, series:series, lines:[], resize:onResize, sym:displaySym };

    fetchFn()
      .then(function(data){
        // Stale guard: a newer chart may have replaced this one mid-fetch.
        if(!(state.lwc && state.lwc.chart===chart)) return;
        if(!data || !data.length){ fallback(); return; }
        series.setData(data);
        chart.timeScale().fitContent();
        applyCryptoLevels();
      })
      .catch(function(){ if(state.lwc && state.lwc.chart===chart) fallback(); });
  });
}

// Kraken OHLC `interval` is in MINUTES → map the UI timeframe to Kraken's
// candle granularity. tdFetch uses TD_INTERVAL (string codes) instead.
var KRAKEN_INTERVAL={'15m':15,'1h':60,'4h':240,'1d':1440};

// Fetch OHLC (timeframe from state.chartInterval) from Kraken for `sym`
// (request pair) and normalise to the LWC candle shape. Throws on HTTP error /
// Kraken error envelope / empty result so renderLWCChart falls back to the TV
// widget + chips.
function krakenFetch(sym){
  return fetch('https://api.kraken.com/0/public/OHLC?pair='+sym+'&interval='+(KRAKEN_INTERVAL[state.chartInterval]||60))
    .then(function(res){ if(!res.ok) throw new Error('HTTP '+res.status); return res.json(); })
    .then(function(json){
      // Kraken error envelope: { error:[...], result:{ <canonicalPair>:[[t,o,h,l,c,vwap,vol,cnt]...], last } }.
      if(json && json.error && json.error.length) throw new Error('kraken error');
      var result=json && json.result;
      if(!result) throw new Error('no result');
      // The canonical key (e.g. 'XXBTZUSD') is whatever Kraken returns — take
      // the first non-'last' key rather than guessing the normalised name.
      var keys=Object.keys(result).filter(function(k){ return k!=='last'; });
      var rows=keys.length ? result[keys[0]] : null;
      if(!rows || !rows.length) throw new Error('empty rows');
      // Kraken time is already seconds; o/h/l/c are strings → coerce with +.
      return rows.map(function(r){ return { time:r[0], open:+r[1], high:+r[2], low:+r[3], close:+r[4] }; });
    });
}

// Crypto chart = shared LWC core fed by Kraken. Behaviour is unchanged from the
// pre-refactor inline version.
function renderCryptoChart(sym){
  renderLWCChart(sym, function(){ return krakenFetch(sym); });
}

/* ---------- Twelve Data chart (FX + metals, real lines) ---------- */
// FX pairs + metals (XAU/XAG) get real candles + Entry/SL/TP lines via Twelve
// Data (free tier, user-supplied API key). Indices (US100/US500) have no TD
// free coverage → they stay on the TV widget. Crypto stays on Kraken.
//
// SECURITY: the API key lives ONLY in localStorage under its own key
// ('quicklog_td_key'). It is deliberately NOT in PERSISTED_FIELDS / the
// 'quicklog' blob, NOT in cardHtml / sizerCardHtml / PNG export / copyForSheet,
// and never logged. The only place it leaves the browser is the TD request URL.

var TD_KEY_STORAGE = 'quicklog_td_key';
function tdKey(){
  try{ return localStorage.getItem(TD_KEY_STORAGE)||''; }catch(e){ return ''; }
}
function setTdKey(v){
  try{ localStorage.setItem(TD_KEY_STORAGE, v||''); }catch(e){ /* storage unavailable — non-fatal */ }
}

// Map a sizer preset symbol to its Twelve Data symbol for FX + metals, else
// null. Crypto (BTC/USD, ETH/USD) → null (Kraken). Indices (US100/US500) →
// null (no TD free coverage → TV widget). Custom/empty → null.
var TWELVE_DATA_SYMBOLS = {
  'EUR/USD':'EUR/USD','GBP/USD':'GBP/USD','USD/JPY':'USD/JPY','EUR/GBP':'EUR/GBP',
  'AUD/USD':'AUD/USD','USD/CAD':'USD/CAD','EUR/JPY':'EUR/JPY','GBP/JPY':'GBP/JPY',
  'XAU/USD':'XAU/USD','XAG/USD':'XAG/USD'
};
function twelveDataSymbol(presetSymbol){
  if(!presetSymbol) return null;
  return Object.prototype.hasOwnProperty.call(TWELVE_DATA_SYMBOLS, presetSymbol)
    ? TWELVE_DATA_SYMBOLS[presetSymbol] : null;
}

// Twelve Data `interval` takes string codes ('15min','1h','4h','1day') → map
// the UI timeframe to them. krakenFetch uses KRAKEN_INTERVAL (minutes) instead.
var TD_INTERVAL={'15m':'15min','1h':'1h','4h':'4h','1d':'1day'};

// Fetch OHLC (timeframe from state.chartInterval) from Twelve Data for `sym`
// and normalise to the LWC candle shape (time in seconds, ascending). Throws on
// TD error status / missing values so renderLWCChart falls back to the TV
// widget + chips.
function tdFetch(sym){
  return fetch('https://api.twelvedata.com/time_series?symbol='+encodeURIComponent(sym)
      +'&interval='+(TD_INTERVAL[state.chartInterval]||'1h')+'&outputsize=300&apikey='+encodeURIComponent(tdKey()))
    .then(function(res){ return res.json(); })
    .then(function(json){
      // TD error envelope: { status:'error', code, message }. Free-tier limits /
      // bad key / unsupported symbol all surface here → fall back.
      if(!json || json.status==='error' || !Array.isArray(json.values)) throw new Error('td error');
      // values are NEWEST-first → map then sort ascending by time (LWC needs that).
      var data=json.values.map(function(v){
        // datetime is 'YYYY-MM-DD HH:MM:SS' in UTC.
        return {
          time:Math.floor(new Date(v.datetime.replace(' ','T')+'Z').getTime()/1000),
          open:+v.open, high:+v.high, low:+v.low, close:+v.close
        };
      });
      data.sort(function(a,b){ return a.time-b.time; });
      return data;
    });
}

// FX/metal chart = shared LWC core fed by Twelve Data.
function renderTwelveDataChart(sym){
  renderLWCChart(sym, function(){ return tdFetch(sym); });
}

// Read szEntry/szSL/szTP and draw a dashed price line per valid value. Line
// objects are tracked in state.lwc.lines so updateCryptoLevels can clear them.
function applyCryptoLevels(){
  var l=state.lwc; if(!l || !l.series) return;
  var defs=[
    { id:'szEntry', title:'ENTRY', color:'#e4e4e7' },
    { id:'szSL',    title:'SL',    color:'#e5484d' },
    { id:'szTP',    title:'TP',    color:'#3ecf8e' }
  ];
  defs.forEach(function(d){
    var el=$(d.id); if(!el) return;
    var v=parseNum(el.value);
    if(isNaN(v)) return;
    try{
      var line=l.series.createPriceLine({
        price:v, color:d.color, lineWidth:1, lineStyle:2 /* dashed */,
        axisLabelVisible:true, title:d.title
      });
      l.lines.push(line);
    }catch(e){ /* line draw failed — non-fatal */ }
  });
}

// Redraw the level lines from the current inputs WITHOUT refetching candles.
// Called from update() so the lines track as Entry/SL/TP are typed.
function updateCryptoLevels(){
  var l=state.lwc; if(!l || !l.series) return;
  for(var i=0;i<l.lines.length;i++){ try{ l.series.removePriceLine(l.lines[i]); }catch(e){} }
  l.lines=[];
  applyCryptoLevels();
}

function applyFeed(){
  state.feedOverride=$('feedInput').value.trim().toUpperCase();
  renderChart();
  renderChartLevels();
}

// Switch the LWC chart timeframe. Updates state + the active button, persists,
// and — only when an LWC chart is live — re-dispatches renderChart so the chart
// is refetched at the new interval (destroyCryptoChart tears down the old one).
// On the TV-widget path there is no LWC chart, so nothing refetches.
function setChartInterval(tf){
  if(!KRAKEN_INTERVAL[tf]) return; // ignore unknown timeframe codes
  state.chartInterval=tf;
  var box=$('chartTf');
  if(box){
    var btns=box.querySelectorAll('.tf');
    for(var i=0;i<btns.length;i++){
      btns[i].className='tf'+(btns[i].getAttribute('data-tf')===tf?' on':'');
    }
  }
  saveState();
  if(state.lwc) renderChart();
}
function toggleChart(){
  state.chartOpen=!state.chartOpen;
  $('chartWrap').style.display=state.chartOpen?'block':'none';
  $('chartToggle').textContent=state.chartOpen?'Hide Chart ▴':'Show Chart ▾';
  if(state.chartOpen){
    var fi=$('feedInput'); if(fi && !fi.value) fi.value=currentTV();
    renderChart();
    if(!state.lwc) renderChartLevels();
  } else {
    destroyCryptoChart(); // closing the chart must not leak the LWC instance
  }
  saveState();
}

/* ---------- Persistence ---------- */

function saveState(){
  try{
    var fields={};
    PERSISTED_FIELDS.forEach(function(id){ var el=$(id); if(el) fields[id]=el.value; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v:1, fields:fields,
      state:{
        direction:state.direction, mode:state.mode, tab:state.tab,
        chartOpen:state.chartOpen, feedOverride:state.feedOverride,
        cvManual:state.cvManual, dirManual:state.dirManual,
        chartInterval:state.chartInterval
      }
    }));
  }catch(e){ /* storage unavailable / quota — non-fatal */ }
}

// Returns true if persisted data was found and applied.
function loadState(){
  var raw;
  try{ raw=localStorage.getItem(STORAGE_KEY); }catch(e){ return false; }
  if(!raw) return false;
  var data;
  try{ data=JSON.parse(raw); }catch(e){ return false; }
  if(!data||!data.fields) return false;

  // 1) Broker first, then rebuild instrument options so the saved
  //    instrument value exists before we apply it.
  if(data.fields.brk!=null && $('brk')) $('brk').value=data.fields.brk;
  fillInstruments();

  // 2) Restore every remaining field verbatim.
  PERSISTED_FIELDS.forEach(function(id){
    if(id==='brk') return;
    var el=$(id);
    if(el && data.fields[id]!=null) el.value=data.fields[id];
  });

  // 3) Restore UI state.
  var s=data.state||{};
  if(s.cvManual!=null) state.cvManual=!!s.cvManual;
  if(s.feedOverride!=null) state.feedOverride=s.feedOverride;
  // Restore the LWC timeframe BEFORE the chartOpen renderChart() below so the
  // first chart loads at the saved interval and the active .tf button matches.
  if(s.chartInterval) state.chartInterval=s.chartInterval;
  // Restore direction visually without pinning, then apply the saved pin flag
  // so dirManual ends up exactly as persisted.
  if(s.direction) setDirection(s.direction, false);
  state.dirManual = !!s.dirManual;
  if(s.mode) setMode(s.mode);
  if(s.tab) setTab(s.tab);
  $('accCustomWrap').style.display=$('accPreset').value==='custom'?'block':'none';
  $('szRiskCustomWrap').style.display=$('szRisk').value==='custom'?'block':'none';
  $('rskCustomWrap').style.display=$('rsk').value==='custom'?'block':'none';
  $('btf').style.display=state.mode==='backtest'?'block':'none';

  if(s.chartOpen){
    state.chartOpen=true;
    $('chartWrap').style.display='block';
    $('chartToggle').textContent='Hide Chart ▴';
    renderChart();
  }
  return true;
}

/* ---------- Trade history (logged trades, separate localStorage key) ---------- */
// Persisted in TRADES_KEY ('quicklog_trades'), independent of the form-state key
// ('quicklog'). Purely additive: does not touch copyForSheet/cardHtml/sizing.

var TRADES_KEY = 'quicklog_trades';
var trades = [];

function loadTrades(){
  var raw;
  try{ raw=localStorage.getItem(TRADES_KEY); }catch(e){ return []; }
  if(!raw) return [];
  try{ var a=JSON.parse(raw); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function saveTrades(arr){
  try{ localStorage.setItem(TRADES_KEY, JSON.stringify(arr)); }catch(e){ /* quota/unavailable — non-fatal */ }
}

// Snapshot the current Log form into a plain trade object.
function collectTrade(){
  return {
    mode:      state.mode,
    btId:      $('btId').value,
    pool:      $('pl').value,
    asset:     $('ast').value,
    direction: state.direction,
    session:   $('ses').value,
    risk:      getLogRisk(),
    entry:     $('ent').value,
    sl:        $('slo').value,
    tp:        $('tpr').value,
    vol:       $('vol').value,
    setup:     $('stp').value,
    note:      $('nte').value,
    ts:        new Date().toISOString()
  };
}

// R:R from a stored trade's levels, or '—' when not computable.
function tradeRR(t){
  var e=parseNum(t.entry), s=parseNum(t.sl), p=parseNum(t.tp);
  if(isNaN(e)||isNaN(s)||isNaN(p)||s===e) return '—';
  return (Math.abs(p-e)/Math.abs(e-s)).toFixed(2);
}

function renderTrades(){
  var box=$('tradeList'); if(!box) return;
  if(!trades.length){ box.innerHTML='<div class="tle">No logged trades yet</div>'; return; }
  var html='';
  for(var i=0;i<trades.length;i++){
    var t=trades[i];
    var isLong=t.direction==='Long';
    var asset=(t.asset&&t.asset.trim())?esc(t.asset):'—';
    var dateTxt='';
    var d=new Date(t.ts);
    if(t.ts && !isNaN(d.getTime())) dateTxt=esc(d.toLocaleDateString('en-GB'));
    var rr=esc(tradeRR(t));
    html+='<div class="tr">'
      +'<span class="tr-a">'+asset+'</span>'
      +'<span class="tr-b '+(isLong?'lo':'so')+'">'+(isLong?'Long':'Short')+'</span>'
      +'<span class="tr-m">'+dateTxt+(dateTxt?' · ':'')+'R:R '+rr+'</span>'
      +'<button class="tr-x" data-idx="'+i+'" data-act="edit">Edit</button>'
      +'<button class="tr-x" data-idx="'+i+'" data-act="del">×</button>'
      +'</div>';
  }
  box.innerHTML=html;
}

// Load a stored trade back into the Log form (for re-export via the existing
// Copy/PNG buttons). Re-export itself is unchanged — no copyForSheet refactor.
function loadTradeIntoForm(idx){
  var t=trades[idx]; if(!t) return;
  $('btId').value = t.btId!=null ? t.btId : '';
  $('pl').value   = t.pool!=null ? t.pool : '';
  $('ast').value  = t.asset!=null ? t.asset : '';
  $('ses').value  = t.session!=null ? t.session : '';
  $('ent').value  = t.entry!=null ? t.entry : '';
  $('slo').value  = t.sl!=null ? t.sl : '';
  $('tpr').value  = t.tp!=null ? t.tp : '';
  $('vol').value  = t.vol!=null ? t.vol : '';
  if(t.setup!=null) $('stp').value = t.setup;
  $('nte').value  = t.note!=null ? t.note : '';

  setMode(t.mode==='backtest'?'backtest':'live');           // also toggles #btf visibility
  setDirection(t.direction==='Short'?'Short':'Long', true); // pin the stored direction

  // Risk: match a preset option value, else fall back to the custom field.
  var rskEl=$('rsk'), preset=false, rv=String(t.risk);
  for(var i=0;i<rskEl.options.length;i++){
    if(rskEl.options[i].value!=='custom' && rskEl.options[i].value===rv){ preset=true; break; }
  }
  if(preset){
    rskEl.value=rv;
    $('rskCustomWrap').style.display='none';
  } else {
    rskEl.value='custom';
    $('rskCustom').value=rv;
    $('rskCustomWrap').style.display='block';
  }

  update();
  toast('Loaded into form ✓');
}

function onTradeListClick(e){
  var btn=e.target.closest ? e.target.closest('[data-act]') : null;
  if(!btn) return;
  var idx=parseInt(btn.getAttribute('data-idx'),10);
  if(isNaN(idx)) return;
  var act=btn.getAttribute('data-act');
  if(act==='edit'){
    loadTradeIntoForm(idx);
  } else if(act==='del'){
    if(confirm('Delete this logged trade?')){
      trades.splice(idx,1);
      saveTrades(trades);
      renderTrades();
    }
  }
}

function logTrade(){
  trades.push(collectTrade());
  saveTrades(trades);
  renderTrades();
  toast('Trade logged ✓');
}

/* ---------- Wiring ---------- */

function on(id, evt, fn){ var el=$(id); if(el) el.addEventListener(evt, fn); }

function bind(){
  // tabs
  on('tab-size','click',function(){ setTab('size'); });
  on('tab-log','click',function(){ setTab('log'); });

  // sizer
  on('brk','change',onBrokerChange);
  on('accPreset','change',onAccPresetChange);
  on('accCustom','input',update);
  on('inst','change',onInstrumentChange);
  on('szRisk','change',onSzRiskChange);
  on('szRiskCustom','input',update);
  on('cv','input',function(){ state.cvManual=true; update(); });
  on('szEntry','input',update);
  on('szSL','input',update);
  on('szTP','input',update);
  on('chartToggle','click',toggleChart);
  // LWC timeframe row: delegated click (no inline on*), reads data-tf.
  on('chartTf','click',function(e){
    var b=e.target.closest ? e.target.closest('.tf') : null;
    if(!b) return;
    var tf=b.getAttribute('data-tf');
    if(tf) setChartInterval(tf);
  });
  on('feedLoad','click',applyFeed);
  // Twelve Data key: localStorage-only (never in the 'quicklog' blob). Persist
  // on every keystroke, then re-render so the chart upgrades to real lines the
  // moment a valid key is present.
  on('tdKey','input',function(){ setTdKey(this.value.trim()); renderChart(); });
  on('toLogBtn','click',sendToLog);
  on('szExb','click',exportSizerPng);

  // log
  on('bl','click',function(){ setMode('live'); });
  on('bb','click',function(){ setMode('backtest'); });
  on('btId','input',update);
  on('pl','input',update);
  on('ast','input',function(){ this.value=this.value.toUpperCase(); state.dirManual=false; update(); });
  on('blo','click',function(){ setDirection('Long', true); });
  on('bsh','click',function(){ setDirection('Short', true); });
  on('ses','change',update);
  on('rsk','change',onRskChange);
  on('rskCustom','input',update);
  on('ent','input',function(){ maybeAutoDirection(); update(); });
  on('slo','input',function(){ maybeAutoDirection(); update(); });
  on('tpr','input',update);
  on('vol','input',update);
  on('stp','change',update);
  on('nte','input',update);
  on('cpb','click',copyForSheet);
  on('exb','click',exportPng);

  // trade history
  on('logTradeBtn','click',logTrade);
  on('tradeList','click',onTradeListClick);
}

/* ---------- Init ---------- */

function init(){
  bind();
  // Restore the Twelve Data key from its OWN localStorage key (never via the
  // 'quicklog' form-state blob). Field is type=password so it isn't shoulder-read.
  var tk=$('tdKey'); if(tk) tk.value=tdKey();
  fillInstruments();
  // Seed the default instrument's contract value on a fresh load;
  // loadState() supplies it when prior inputs exist.
  if(!loadState()) onInstrumentChange();
  update();
  trades = loadTrades();
  renderTrades();
  registerServiceWorker();
}

// Register the service worker for offline app-shell caching. No-op under
// file:// (double-click local use) where SW registration is unavailable.
function registerServiceWorker(){
  if('serviceWorker' in navigator && location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js').catch(function(){});
  }
}

init();
})();
