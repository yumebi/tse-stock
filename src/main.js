import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ===== カラム定義 =====
const ALL_COLS = [
  { k: "reorder", w: "48px", label: "", fixed: true },
  { k: "code", w: "70px", label: "コード", fixed: true },
  { k: "name", w: "0.7fr", label: "企業名", fixed: true },
  { k: "price", w: "105px", label: "現在株価", fixed: true },
  { k: "spark", w: "70px", label: "5日", toggle: "spark" },
  { k: "change", w: "120px", label: "前日比", toggle: "change" },
  { k: "prev", w: "105px", label: "前日終値", toggle: "prev" },
  { k: "open", w: "100px", label: "始値", fixed: true },
  { k: "high", w: "95px", label: "高値", toggle: "hl" },
  { k: "low", w: "95px", label: "安値", toggle: "hl" },
  { k: "volume", w: "80px", label: "出来高", toggle: "volume" },
  { k: "ma5", w: "72px", label: "MA5", toggle: "ma" },
  { k: "ma25", w: "72px", label: "MA25", toggle: "ma" },
  { k: "ma75", w: "72px", label: "MA75", toggle: "ma" },
  { k: "macd", w: "68px", label: "MACD", toggle: "ind" },
  { k: "sig", w: "55px", label: "Sig", toggle: "ind" },
  { k: "rsi", w: "52px", label: "RSI", toggle: "rsi" },
  { k: "score", w: "58px", label: "判定", toggle: "score" },
  { k: "signals", w: "1fr", label: "シグナル", fixed: true },
  { k: "del", w: "28px", label: "", fixed: true },
];

// ===== 状態 =====
const state = {
  tabs: [], activeTabIdx: 0, sortKey: null, sortAsc: true, paused: false, prevSignals: {},
  hiddenToggles: new Set(JSON.parse(localStorage.getItem("tse-stock-hide") || "[]")),
  toggleOrder: JSON.parse(localStorage.getItem("tse-stock-tgl-order") || '["spark","change","prev","hl","volume","ma","ind","rsi","score"]'),
};

function saveColState() {
  localStorage.setItem("tse-stock-hide", JSON.stringify([...state.hiddenToggles]));
  localStorage.setItem("tse-stock-tgl-order", JSON.stringify(state.toggleOrder));
}

function visibleCols() {
  // Build ordered list of visible columns
  const result = [];
  const tgOrder = new Map(state.toggleOrder.map((t, i) => [t, i]));
  for (const col of ALL_COLS) {
    if (col.fixed) { result.push(col); continue; }
    if (!state.hiddenToggles.has(col.toggle)) result.push(col);
  }
  // Reorder toggleable columns according to toggleOrder
  const fixed = result.filter(c => c.fixed);
  const tg = result.filter(c => !c.fixed);
  tg.sort((a, b) => (tgOrder.get(a.toggle) ?? 99) - (tgOrder.get(b.toggle) ?? 99));
  return [...fixed, ...tg];
}

// ===== ウィンドウ =====
const win = getCurrentWindow();
const WIN_KEY = "tse-stock-window";
async function restoreWindow() { try { const r = localStorage.getItem(WIN_KEY); if (!r) return; const { x, y, w, h } = JSON.parse(r); if (x != null) await win.setPosition({ x, y }); if (w > 400) await win.setSize({ width: w, height: h }); } catch (_) {} }
function saveWindowPos() { Promise.all([win.outerPosition(), win.outerSize()]).then(([p, s]) => { localStorage.setItem(WIN_KEY, JSON.stringify({ x: p.x, y: p.y, w: s.width, h: s.height })); }).catch(() => {}); }

// ===== 音声 =====
let audioCtx = null;
function beep(f, d, t = "sine") { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = t; o.frequency.value = f; g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + d); } catch (_) {} }
function signalBeep(buy) { if (buy) { beep(880, 0.15); setTimeout(() => beep(1100, 0.2), 150); } else { beep(440, 0.15); setTimeout(() => beep(330, 0.25), 150); } }
const hash = ss => (ss || []).join("|") || "_empty";
function detectSignals(code, ns) { const oh = state.prevSignals[code] || "_init", nh = hash(ns); if (oh === "_init") { state.prevSignals[code] = nh; return; } if (oh === nh) return; state.prevSignals[code] = nh; signalBeep(ns.some(s => s.includes("買い") || s.includes("GC") || s.includes("上抜"))); }

// ===== DOM =====
const stockList = document.getElementById("stock-list");
const stockCodeInput = document.getElementById("stock-code-input");
const addBtn = document.getElementById("add-btn");
const pauseBtn = document.getElementById("pause-btn");
const exportBtn = document.getElementById("export-btn");
const toggleAllBtn = document.getElementById("toggle-all-btn");
const statusMsg = document.getElementById("status-msg");
const tableHeader = document.querySelector(".table-header");
const tabsEl = document.getElementById("tabs");
const addTabBtn = document.getElementById("add-tab-btn");
const idxN225 = document.getElementById("idx-n225");
const idxTopx = document.getElementById("idx-topx");

// ===== 永続化 =====
const DEFAULT_STOCKS = ["7203", "8306", "9984"];
function saveAll() { localStorage.setItem("tse-stock-tabs", JSON.stringify(state.tabs.map(t => ({ name: t.name, codes: t.stocks.map(s => s.code) })))); localStorage.setItem("tse-stock-active", state.activeTabIdx); }
function loadAll() { try { const r = localStorage.getItem("tse-stock-tabs"); if (r) { const td = JSON.parse(r); if (Array.isArray(td) && td.length > 0) return td; } } catch (_) {} return [{ name: "デイトレ", codes: DEFAULT_STOCKS }, { name: "長期", codes: [] }]; }
const NAME_CACHE_KEY = "tse-stock-names";
function getNameCache() { try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || "{}"); } catch (_) { return {}; } }
function saveNameCache(c) { localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(c)); }

// ===== ヘルパー =====
function setStatus(m, e) { statusMsg.textContent = m; statusMsg.style.color = e ? "#f85149" : "#8b949e"; }
const fmt = n => n != null ? n.toLocaleString() : "-";
const fmtPct = n => n != null ? (n >= 0 ? "+" : "") + n.toFixed(2) + "%" : "-";
const fmtOpt = (n, s) => n != null ? n.toLocaleString() + (s || "") : "-";
function sparkline(cl) { if (!cl || cl.length < 2) return ""; const w = 64, h = 22, p = 2, mn = Math.min(...cl), mx = Math.max(...cl), r = mx - mn || 1; const pts = cl.map((v, i) => { const x = p + (i / (cl.length - 1)) * (w - p * 2), y = p + (1 - (v - mn) / r) * (h - p * 2); return `${x.toFixed(1)},${y.toFixed(1)}`; }).join(" "); const up = cl[cl.length - 1] >= cl[0]; return `<svg width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${up ? "#3fb950" : "#f85149"}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function volClass(s) { if (!s._volAvg || s._volAvg <= 0) return ""; const r = s.volume / s._volAvg; if (r >= 3) return "vol-hot3"; if (r >= 2) return "vol-hot2"; if (r >= 1.5) return "vol-hot1"; if (r >= 1) return "vol-normal"; return "vol-cold"; }
function gradClass(pct) { const a = Math.abs(pct); if (a >= 5) return pct > 0 ? "g-up4" : "g-down4"; if (a >= 3) return pct > 0 ? "g-up3" : "g-down3"; if (a >= 1) return pct > 0 ? "g-up2" : "g-down2"; if (a > 0) return pct > 0 ? "g-up1" : "g-down1"; return ""; }
function scoreSignals(sigs) { let buy = 0, sell = 0; for (const s of sigs || []) { if (s.includes("GC") || s.includes("買い") || s.includes("上抜") || s.includes("続騰")) buy++; if (s.includes("DC") || s.includes("売り") || s.includes("下抜") || s.includes("続落") || s.includes("買われ")) sell++; } return { buy, sell }; }
function scoreClass(sigs) { const { buy, sell } = scoreSignals(sigs); const net = buy - sell; if (net > 0) return "bullish"; if (net < 0) return "bearish"; return "neutral"; }
function scoreText(sigs) { const { buy, sell } = scoreSignals(sigs); if (buy === 0 && sell === 0) return "-"; return `🟢${buy} 🔴${sell}`; }

// ===== セル生成 =====
function renderCell(s, k, fl) {
  const up = s.change >= 0, rsiC = s.rsi != null ? (s.rsi > 70 ? "over" : s.rsi < 30 ? "under" : "") : "";
  switch (k) {
    case "reorder": return `<span class="cell-reorder"><button class="reorder-btn up" data-code="${s.code}">▲</button><button class="reorder-btn down" data-code="${s.code}">▼</button></span>`;
    case "code": return `<span class="cell-code">${s.code}</span>`;
    case "name": {
      const nc = getNameCache(); const nJ = nc[s.code] || s.nameJa;
      const nm = nJ ? `<span class="ja">${nJ}</span><span class="en">${s.name}</span>` : s.name;
      return `<span class="cell-name" title="${nJ || s.name}">${nm}</span>`;
    }
    case "price": return `<span class="cell-price ${fl}">¥${fmt(s.price)}</span>`;
    case "spark": return `<span class="cell-spark">${sparkline(s.recentCloses)}</span>`;
    case "change": return `<span class="cell-change ${up ? "up" : "down"} ${gradClass(s.changePercent)}">${fmtPct(s.changePercent)} (${fmt(s.change)})</span>`;
    case "prev": return `<span class="cell-prev">¥${fmt(s.prevClose)}</span>`;
    case "open": return `<span class="cell-open">¥${fmt(s.open)}</span>`;
    case "high": return `<span class="cell-hl">¥${fmt(s.high)}${s.highTime ? `<span class="time">${s.highTime}</span>` : ""}</span>`;
    case "low": return `<span class="cell-hl">¥${fmt(s.low)}${s.lowTime ? `<span class="time">${s.lowTime}</span>` : ""}</span>`;
    case "volume": return `<span class="cell-volume ${volClass(s)}">${fmt(s.volume)}</span>`;
    case "ma5": return `<span class="cell-ma ma5">${fmtOpt(s.ma5)}</span>`;
    case "ma25": return `<span class="cell-ma ma25">${fmtOpt(s.ma25)}</span>`;
    case "ma75": return `<span class="cell-ma ma75">${fmtOpt(s.ma75)}</span>`;
    case "macd": return `<span class="cell-ind">${fmtOpt(s.macd)}</span>`;
    case "sig": return `<span class="cell-ind">${fmtOpt(s.macdSignal)}</span>`;
    case "rsi": return `<span class="cell-rsi ${rsiC}">${fmtOpt(s.rsi)}</span>`;
    case "score": return `<span class="cell-score ${scoreClass(s.signals)}">${scoreText(s.signals)}</span>`;
    case "signals": return `<span class="cell-sig">${s.signals?.length ? `<span class="sig-inner">${s.signals.join(" ⏺ ")} ⏺ ${s.signals.join(" ⏺ ")}</span>` : ""}</span>`;
    case "del": return `<span class="cell-del"><button class="del-btn" data-code="${s.code}">×</button></span>`;
  }
  return "";
}

// ===== stocks =====
function stocks() { return state.tabs[state.activeTabIdx]?.stocks || []; }
function setStocks(arr) { if (state.tabs[state.activeTabIdx]) state.tabs[state.activeTabIdx].stocks = arr; }

// ===== 指数 =====
async function fetchIndices() {
  try { const n225 = await invoke("fetch_index_cmd", { symbol: "^N225" }); idxN225.innerHTML = `日経 ${n225.price.toLocaleString()} <span class="${n225.change >= 0 ? 'up' : 'down'}">${n225.change >= 0 ? '+' : ''}${n225.changePercent.toFixed(2)}%</span>`; } catch (_) { idxN225.innerHTML = "日経 ---"; }
  idxTopx.remove(); // TOPIX not available on Yahoo Finance
}

// ===== CSV =====
function exportCSV() {
  const arr = stocks(); if (arr.length === 0) return;
  const headers = ["コード", "企業名", "現在株価", "前日比%", "前日比", "前日終値", "始値", "高値", "安値", "出来高", "MA5", "MA25", "MA75", "MACD", "Sig", "RSI", "判定"];
  const rows = arr.map(s => [s.code, s.nameJa || s.name, s.price, s.changePercent?.toFixed(2), s.change, s.prevClose, s.open, s.high, s.low, s.volume, s.ma5?.toFixed(2), s.ma25?.toFixed(2), s.ma75?.toFixed(2), s.macd?.toFixed(4), s.macdSignal?.toFixed(4), s.rsi?.toFixed(1), scoreText(s.signals)]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tse-stock-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setStatus("CSVエクスポート完了", false);
}

// ===== 全カラム切替 =====
toggleAllBtn.addEventListener("click", () => {
  const allHidden = state.hiddenToggles.size === state.toggleOrder.length;
  if (allHidden) { state.hiddenToggles.clear(); } else { state.toggleOrder.forEach(t => state.hiddenToggles.add(t)); }
  saveColState();
  render();
});

// ===== ソート / カラム移動 =====
const SORT_KEYS = { "col-code": { key: "code" }, "col-name": { key: "nameJa" }, "col-price": { key: "price" }, "col-change": { key: "change" }, "col-open": { key: "open" }, "col-volume": { key: "volume" }, "col-rsi": { key: "rsi" } };
tableHeader.addEventListener("click", e => {
  // ◀▶ column reorder
  const arw = e.target.closest(".col-arrow");
  if (arw) {
    const tgl = arw.dataset.tgl, dir = arw.dataset.dir, i = state.toggleOrder.indexOf(tgl);
    if (dir === "left" && i > 0) { [state.toggleOrder[i - 1], state.toggleOrder[i]] = [state.toggleOrder[i], state.toggleOrder[i - 1]]; saveColState(); render(); }
    if (dir === "right" && i < state.toggleOrder.length - 1) { [state.toggleOrder[i], state.toggleOrder[i + 1]] = [state.toggleOrder[i + 1], state.toggleOrder[i]]; saveColState(); render(); }
    return;
  }
  const sp = e.target.closest("span"); if (!sp) return;
  const cls = [...sp.classList].find(c => SORT_KEYS[c]); if (!cls || !SORT_KEYS[cls].key) return;
  const sk = SORT_KEYS[cls];
  if (state.sortKey === sk.key) state.sortAsc = !state.sortAsc;
  else { state.sortKey = sk.key; state.sortAsc = true; }
  render();
});
function sortArr(arr) { if (!state.sortKey) return arr; const k = state.sortKey, asc = state.sortAsc; return [...arr].sort((a, b) => { let va = a[k], vb = b[k]; if (va == null) va = asc ? "\uffff" : ""; if (vb == null) vb = asc ? "\uffff" : ""; if (typeof va === "string") return asc ? va.localeCompare(vb, "ja") : vb.localeCompare(va, "ja"); return asc ? va - vb : vb - va; }); }

// ===== タブ =====
function renderTabs() { tabsEl.innerHTML = state.tabs.map((t, i) => `<button class="tab-btn${i === state.activeTabIdx ? " active" : ""}" data-idx="${i}">${t.name}${state.tabs.length > 1 ? `<span class="tab-del" data-idx="${i}">×</span>` : ""}</button>`).join(""); tabsEl.querySelectorAll(".tab-btn").forEach(b => { b.addEventListener("click", e => { if (e.target.classList.contains("tab-del")) { deleteTab(parseInt(e.target.dataset.idx)); return; } switchTab(parseInt(b.dataset.idx)); }); }); }
function switchTab(idx) { state.activeTabIdx = idx; state.sortKey = null; state.sortAsc = true; saveAll(); renderTabs(); render(); }
function addTab() { const name = `リスト${state.tabs.length + 1}`; state.tabs.push({ name, stocks: [] }); state.activeTabIdx = state.tabs.length - 1; saveAll(); renderTabs(); render(); }
function deleteTab(idx) { if (state.tabs.length <= 1) return; state.tabs.splice(idx, 1); if (state.activeTabIdx >= state.tabs.length) state.activeTabIdx = state.tabs.length - 1; saveAll(); renderTabs(); render(); }

// ===== レンダリング =====
const priceFlash = {};

function render() {
  const stks = stocks();
  if (stks.length === 0) { stockList.innerHTML = `<div class="empty-state">銘柄がありません。上の入力欄からコードを追加してください。</div>`; tableHeader.style.gridTemplateColumns = ""; return; }

  const cols = visibleCols();
  const gridTpl = cols.map(c => c.w).join(" ");
  tableHeader.style.gridTemplateColumns = gridTpl;

  // header with ◀▶ for toggleable cols
  tableHeader.innerHTML = cols.map((c, ci) => {
    const sortCls = c.k === "code" ? " col-code sortable" : c.k === "name" ? " col-name sortable" : c.k === "price" ? " col-price sortable" : c.k === "change" ? " col-change sortable" : c.k === "open" ? " col-open sortable" : c.k === "volume" ? " col-volume sortable" : c.k === "rsi" ? " col-rsi sortable" : "";
    const tgBtns = c.toggle ? `<button class="col-arrow col-left" data-tgl="${c.toggle}" data-dir="left">◀</button><button class="col-arrow col-right" data-tgl="${c.toggle}" data-dir="right">▶</button>` : "";
    return `<span class="${c.k === "reorder" ? "col-reorder" : ""}${sortCls}">${tgBtns}${c.label}</span>`;
  }).join("");

  // rows
  const sorted = sortArr(stks);
  stockList.innerHTML = sorted.map((s, i) => {
    const fl = priceFlash[s.code] ? "flash-" + priceFlash[s.code] : "";
    const isF = i === 0, isL = i === sorted.length - 1;
    // temporarily modify for first/last reorder buttons
    const codeBackup = s.code;
    const cells = cols.map(c => renderCell(s, c.k, fl)).join("");
    // Fix: disable up/down for first/last
    const rowDiv = document.createElement("div");
    rowDiv.innerHTML = cells;
    const upBtn = rowDiv.querySelector(".reorder-btn.up");
    const downBtn = rowDiv.querySelector(".reorder-btn.down");
    if (upBtn && isF) upBtn.setAttribute("disabled", "");
    if (downBtn && isL) downBtn.setAttribute("disabled", "");
    return `<div class="stock-row" data-code="${codeBackup}" style="grid-template-columns:${gridTpl}">${rowDiv.innerHTML}</div>`;
  }).join("");

  for (const c of Object.keys(priceFlash)) delete priceFlash[c];

  // sort indicator
  tableHeader.querySelectorAll("span").forEach(s => s.classList.remove("sort-asc", "sort-desc"));
  if (state.sortKey) {
    for (const [cls, sk] of Object.entries(SORT_KEYS)) {
      if (sk.key === state.sortKey) { const sp = tableHeader.querySelector(`.${cls}`); if (sp) sp.classList.add(state.sortAsc ? "sort-asc" : "sort-desc"); break; }
    }
  }
}

stockList.addEventListener("click", e => {
  const upB = e.target.closest(".reorder-btn.up"), dnB = e.target.closest(".reorder-btn.down"), delB = e.target.closest(".del-btn");
  const arr = stocks();
  if (upB && !upB.disabled) { const c = upB.dataset.code, i = arr.findIndex(s => s.code === c); if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; setStocks(arr); saveAll(); render(); } }
  else if (dnB && !dnB.disabled) { const c = dnB.dataset.code, i = arr.findIndex(s => s.code === c); if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; setStocks(arr); saveAll(); render(); } }
  else if (delB) { removeStock(delB.dataset.code); }
});

// ===== 銘柄操作 =====
async function addStock(code) { code = code.trim(); if (!code) return; const arr = stocks(); if (arr.find(s => s.code === code)) { setStatus(`${code} は既に追加済み`, true); return; } setStatus(`${code} 取得中...`, false); try { const data = await invoke("fetch_stock_cmd", { code }); const nc = getNameCache(); if (data.nameJa && !nc[code]) { nc[code] = data.nameJa; saveNameCache(nc); } data._volAvg = data.volume; arr.push(data); setStocks(arr); saveAll(); render(); setStatus(`${code} 追加完了`, false); } catch (e) { setStatus(`${code} の取得に失敗: ${e}`, true); } }
function removeStock(code) { const arr = stocks(); setStocks(arr.filter(s => s.code !== code)); delete state.prevSignals[code]; saveAll(); render(); }

// ===== 一時停止 =====
pauseBtn.addEventListener("click", () => { state.paused = !state.paused; pauseBtn.textContent = state.paused ? "▶" : "⏸"; pauseBtn.classList.toggle("paused", state.paused); setStatus(state.paused ? "自動更新停止中" : "自動更新再開", false); });

// ===== イベント =====
addBtn.addEventListener("click", async () => { const c = stockCodeInput.value.trim(); if (!c) return; stockCodeInput.value = ""; await addStock(c); });
stockCodeInput.addEventListener("keydown", e => { if (e.key === "Enter") addBtn.click(); });
addTabBtn.addEventListener("click", addTab);
exportBtn.addEventListener("click", exportCSV);

// ===== 初期化 =====
async function init() {
  restoreWindow();
  const td = loadAll();
  state.tabs = td.map(t => ({ name: t.name, stocks: [] }));
  state.activeTabIdx = Math.min(parseInt(localStorage.getItem("tse-stock-active") || 0), state.tabs.length - 1);
  renderTabs();
  const codes = td[state.activeTabIdx]?.codes || DEFAULT_STOCKS;
  for (const code of codes) {
    try { const data = await invoke("fetch_stock_cmd", { code }); const nc = getNameCache(); if (data.nameJa && !nc[code]) { nc[code] = data.nameJa; saveNameCache(nc); } data._volAvg = data.volume; stocks().push(data); state.prevSignals[code] = hash(data.signals); } catch (e) { setStatus(`${code} 失敗: ${e}`, true); }
  }
  saveAll();
  render();
  setStatus(stocks().length > 0 ? "完了" : "取得できませんでした", stocks().length === 0);
  fetchIndices();
}

// ===== 定期更新 =====
setInterval(async () => {
  if (state.paused || stocks().length === 0) return;
  const arr = stocks();
  for (const s of arr) {
    try { const op = s.price; const data = await invoke("fetch_stock_cmd", { code: s.code }); const pj = s.nameJa; Object.assign(s, data); if (!s.nameJa && pj) s.nameJa = pj; if (!s._volAvg) s._volAvg = s.volume; else s._volAvg = s._volAvg * 0.9 + s.volume * 0.1; if (data.price > op) priceFlash[s.code] = "up"; else if (data.price < op) priceFlash[s.code] = "down"; detectSignals(s.code, data.signals); } catch (_) {}
  }
  render();
  fetchIndices();
  setStatus(`更新完了 ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`, false);
}, 30000);

// ===== ウィンドウ保存 =====
let saveT; async function onWC() { clearTimeout(saveT); saveT = setTimeout(saveWindowPos, 500); }
win.onResized(onWC); win.onMoved(onWC);

// ===== 進捗イベント =====
listen("stock-progress", e => { const { code, step } = e.payload; setStatus(`${code}: ${step}`, false); });

// ===== 起動 =====
init();
