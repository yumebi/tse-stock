import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ===== 状態 =====
const state = {
  tabs: [], activeTabIdx: 0, sortKey: null, sortAsc: true, paused: false, prevSignals: {},
  hiddenCols: new Set(JSON.parse(localStorage.getItem("tse-stock-cols") || "[]")),
};

function saveColState() {
  localStorage.setItem("tse-stock-cols", JSON.stringify([...state.hiddenCols]));
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
const colsBtn = document.getElementById("cols-btn");
const colsMenu = document.getElementById("cols-menu");
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

// ===== カラム可視性 =====
const COL_MAP = {
  spark: 4, change: 5, prev: 6, hl: 8, volume: 10, ma: 11, ind: 14, rsi: 16, score: 17,
  hl2: 9, ma2: 12, ma3: 13, ind2: 15,
};

function applyColVisibility() {
  const idxs = new Set();
  for (const key of state.hiddenCols) {
    if (COL_MAP[key] != null) idxs.add(COL_MAP[key]);
    // hl covers both 8 and 9
    if (key === "hl") { idxs.add(8); idxs.add(9); }
    if (key === "ma") { idxs.add(11); idxs.add(12); idxs.add(13); }
    if (key === "ind") { idxs.add(14); idxs.add(15); }
  }
  // header (20 cols)
  const hSpans = tableHeader.querySelectorAll("span");
  hSpans.forEach((sp, i) => { sp.style.display = idxs.has(i) ? "none" : ""; });
  // rows
  stockList.querySelectorAll(".stock-row").forEach(row => {
    const cells = row.querySelectorAll("span");
    cells.forEach((cell, i) => { cell.style.display = idxs.has(i) ? "none" : ""; });
  });
}

// ===== stocks参照 =====
function stocks() { return state.tabs[state.activeTabIdx]?.stocks || []; }
function setStocks(arr) { if (state.tabs[state.activeTabIdx]) state.tabs[state.activeTabIdx].stocks = arr; }

// ===== 指数 =====
async function fetchIndices() {
  try { const n225 = await invoke("fetch_index_cmd", { symbol: "^N225" }); idxN225.innerHTML = `日経 ${n225.price.toLocaleString()} <span class="${n225.change >= 0 ? 'up' : 'down'}">${n225.change >= 0 ? '+' : ''}${n225.changePercent.toFixed(2)}%</span>`; } catch (_) { idxN225.innerHTML = "日経 ---"; }
  try { const topx = await invoke("fetch_index_cmd", { symbol: "^TOPX" }); idxTopx.innerHTML = `TOPIX ${topx.price.toLocaleString()} <span class="${topx.change >= 0 ? 'up' : 'down'}">${topx.change >= 0 ? '+' : ''}${topx.changePercent.toFixed(2)}%</span>`; } catch (_) { idxTopx.innerHTML = "TOPIX ---"; }
}

// ===== CSVエクスポート =====
function exportCSV() {
  const arr = stocks(); if (arr.length === 0) return;
  const headers = ["コード", "企業名", "現在株価", "前日比%", "前日比", "前日終値", "始値", "高値", "安値", "出来高", "MA5", "MA25", "MA75", "MACD", "Sig", "RSI", "判定"];
  const rows = arr.map(s => [s.code, s.nameJa || s.name, s.price, s.changePercent?.toFixed(2), s.change, s.prevClose, s.open, s.high, s.low, s.volume, s.ma5?.toFixed(2), s.ma25?.toFixed(2), s.ma75?.toFixed(2), s.macd?.toFixed(4), s.macdSignal?.toFixed(4), s.rsi?.toFixed(1), scoreText(s.signals)]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `tse-stock-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setStatus("CSVエクスポート完了", false);
}

// ===== カラム切替 + DnD並び替え =====
colsBtn.addEventListener("click", () => {
  colsMenu.classList.toggle("hidden");
  if (!colsMenu.classList.contains("hidden")) {
    // sync checkboxes
    colsMenu.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.checked = !state.hiddenCols.has(cb.dataset.col);
    });
  }
});

colsMenu.addEventListener("change", e => {
  if (e.target.type === "checkbox" && e.target.dataset.col) {
    const col = e.target.dataset.col;
    if (e.target.checked) state.hiddenCols.delete(col);
    else state.hiddenCols.add(col);
    saveColState();
    applyColVisibility();
  }
});

document.addEventListener("click", e => { if (!colsBtn.contains(e.target) && !colsMenu.contains(e.target)) colsMenu.classList.add("hidden"); });

// ===== ソート =====
const SORT_KEYS = { "col-code": { key: "code" }, "col-name": { key: "nameJa" }, "col-price": { key: "price" }, "col-change": { key: "change" }, "col-open": { key: "open" }, "col-volume": { key: "volume" }, "col-rsi": { key: "rsi" } };
tableHeader.addEventListener("click", e => {
  const sp = e.target.closest("span"); if (!sp) return;
  const cls = [...sp.classList].find(c => SORT_KEYS[c]); if (!cls || !SORT_KEYS[cls].key) return;
  const sk = SORT_KEYS[cls];
  state.sortKey = state.sortKey === sk.key ? state.sortKey : sk.key;
  state.sortAsc = state.sortKey === sk.key ? !state.sortAsc : true;
  render();
});
function sortArr(arr) { if (!state.sortKey) return arr; const k = state.sortKey, asc = state.sortAsc; return [...arr].sort((a, b) => { let va = a[k], vb = b[k]; if (va == null) va = asc ? "\uffff" : ""; if (vb == null) vb = asc ? "\uffff" : ""; if (typeof va === "string") return asc ? va.localeCompare(vb, "ja") : vb.localeCompare(va, "ja"); return asc ? va - vb : vb - va; }); }

// ===== タブ =====
function renderTabs() { tabsEl.innerHTML = state.tabs.map((t, i) => `<button class="tab-btn${i === state.activeTabIdx ? " active" : ""}" data-idx="${i}">${t.name}${state.tabs.length > 1 ? `<span class="tab-del" data-idx="${i}">×</span>` : ""}</button>`).join(""); tabsEl.querySelectorAll(".tab-btn").forEach(b => { b.addEventListener("click", e => { if (e.target.classList.contains("tab-del")) { deleteTab(parseInt(e.target.dataset.idx)); return; } switchTab(parseInt(b.dataset.idx)); }); }); }
function switchTab(idx) { state.activeTabIdx = idx; state.sortKey = null; state.sortAsc = true; saveAll(); renderTabs(); render(); applyColVisibility(); }
function addTab() { const name = `リスト${state.tabs.length + 1}`; state.tabs.push({ name, stocks: [] }); state.activeTabIdx = state.tabs.length - 1; saveAll(); renderTabs(); render(); applyColVisibility(); }
function deleteTab(idx) { if (state.tabs.length <= 1) return; state.tabs.splice(idx, 1); if (state.activeTabIdx >= state.tabs.length) state.activeTabIdx = state.tabs.length - 1; saveAll(); renderTabs(); render(); applyColVisibility(); }

// ===== レンダリング =====
const priceFlash = {};

function rowHtml(s, i, sorted) {
  const up = s.change >= 0, rsiC = s.rsi != null ? (s.rsi > 70 ? "over" : s.rsi < 30 ? "under" : "") : "";
  const nameCache = getNameCache();
  const nameJa = nameCache[s.code] || s.nameJa;
  const nm = nameJa ? `<span class="ja">${nameJa}</span><span class="en">${s.name}</span>` : s.name;
  const isF = i === 0, isL = i === sorted.length - 1, fl = priceFlash[s.code] || "";

  const cells = [
    `<span class="cell-reorder"><button class="reorder-btn up" data-code="${s.code}" ${isF ? "disabled" : ""}>▲</button><button class="reorder-btn down" data-code="${s.code}" ${isL ? "disabled" : ""}>▼</button></span>`,
    `<span class="cell-code">${s.code}</span>`,
    `<span class="cell-name" title="${nameJa || s.name}">${nm}</span>`,
    `<span class="cell-price ${fl ? "flash-" + fl : ""}">¥${fmt(s.price)}</span>`,
    `<span class="cell-spark">${sparkline(s.recentCloses)}</span>`,
    `<span class="cell-change ${up ? "up" : "down"} ${gradClass(s.changePercent)}">${fmtPct(s.changePercent)} (${fmt(s.change)})</span>`,
    `<span class="cell-prev">¥${fmt(s.prevClose)}</span>`,
    `<span class="cell-open">¥${fmt(s.open)}</span>`,
    `<span class="cell-hl">¥${fmt(s.high)}${s.highTime ? `<span class="time">${s.highTime}</span>` : ""}</span>`,
    `<span class="cell-hl">¥${fmt(s.low)}${s.lowTime ? `<span class="time">${s.lowTime}</span>` : ""}</span>`,
    `<span class="cell-volume ${volClass(s)}">${fmt(s.volume)}</span>`,
    `<span class="cell-ma ma5">${fmtOpt(s.ma5)}</span>`,
    `<span class="cell-ma ma25">${fmtOpt(s.ma25)}</span>`,
    `<span class="cell-ma ma75">${fmtOpt(s.ma75)}</span>`,
    `<span class="cell-ind">${fmtOpt(s.macd)}</span>`,
    `<span class="cell-ind">${fmtOpt(s.macdSignal)}</span>`,
    `<span class="cell-rsi ${rsiC}">${fmtOpt(s.rsi)}</span>`,
    `<span class="cell-score ${scoreClass(s.signals)}">${scoreText(s.signals)}</span>`,
    `<span class="cell-sig">${s.signals?.length ? `<span class="sig-inner">${s.signals.join(" ⏺ ")} ⏺ ${s.signals.join(" ⏺ ")}</span>` : ""}</span>`,
    `<span class="cell-del"><button class="del-btn" data-code="${s.code}">×</button></span>`,
  ];
  return `<div class="stock-row" data-code="${s.code}">${cells.join("")}</div>`;
}

function render() {
  const stks = stocks();
  if (stks.length === 0) { stockList.innerHTML = `<div class="empty-state">銘柄がありません。上の入力欄からコードを追加してください。</div>`; return; }
  const sorted = sortArr(stks);
  stockList.innerHTML = sorted.map((s, i) => rowHtml(s, i, sorted)).join("");
  for (const c of Object.keys(priceFlash)) delete priceFlash[c];
  applyColVisibility();
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
function removeStock(code) { const arr = stocks(); setStocks(arr.filter(s => s.code !== code)); delete state.prevSignals[code]; saveAll(); render(); applyColVisibility(); }

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
