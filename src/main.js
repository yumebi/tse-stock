import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";

import { ALL_COLS, TOGGLE_LABELS, SORT_KEYS, DENSITY_LABELS, DENSITY_NEXT, SPARK_LABELS, SIG_CATEGORIES, MARKET_SESSION_DEFAULT } from "./lib/constants.js";
import {
  state, priceFlash,
  saveAll, loadAll, saveColState, saveColWidths, saveAlerts, saveNotes, savePortfolio, saveSigCats, saveMarketSession,
  getNameCache, saveNameCache,
  stocks, setStocks,
  hash, detectSignalChange,
} from "./lib/state.js";
import { signalBeep, alertBeep, initNotifications, sendOsNotification } from "./lib/audio.js";
import { scoreSignals, scoreText } from "./lib/indicators.js";
import { visibleCols, getGroupOrder, moveGroup } from "./lib/columns.js";
import { initSticky, applySticky, scheduleNameAutoSize } from "./lib/sticky.js";
import { initTabs, renderTabs, addTab, deleteTab } from "./lib/tabs.js";
import { initRender, initRenderHelpers, render, renderCell, updateSigScroll } from "./lib/render.js";

// ===== DOM =====
const stockList      = document.getElementById("stock-list");
const stockCodeInput = document.getElementById("stock-code-input");
const addBtn         = document.getElementById("add-btn");
const pauseBtn       = document.getElementById("pause-btn");
const refreshBtn     = document.getElementById("refresh-btn");
const exportBtn      = document.getElementById("export-btn");
const importBtn      = document.getElementById("import-btn");
const intervalSel    = document.getElementById("interval-sel");
const statusMsg      = document.getElementById("status-msg");
const tableHeader    = document.querySelector(".table-header");
const tabsEl         = document.getElementById("tabs");
const colPanelBtn    = document.getElementById("col-panel-btn");
const sigCatBtn      = document.getElementById("sig-cat-btn");
const addTabBtn      = document.getElementById("add-tab-btn");
const idxN225        = document.getElementById("idx-n225");
const marketStatus   = document.getElementById("market-status");
const densityBtn     = document.getElementById("density-btn");
const pinBtn         = document.getElementById("pin-btn");
const sparkSel       = document.getElementById("spark-sel");

// ===== ヘルパー =====
function setStatus(m, e) { statusMsg.textContent = m; statusMsg.style.color = e ? "#f85149" : "#8b949e"; }

// ===== ウィンドウ =====
const win = getCurrentWindow();
const WIN_KEY = "tse-stock-window";
async function restoreWindow() { try { const r = localStorage.getItem(WIN_KEY); if (!r) return; const { x, y, w, h } = JSON.parse(r); if (x != null) await win.setPosition({ x, y }); if (w > 400) await win.setSize({ width: w, height: h }); } catch (_) {} }
function saveWindowPos() { Promise.all([win.outerPosition(), win.outerSize()]).then(([p, s]) => { localStorage.setItem(WIN_KEY, JSON.stringify({ x: p.x, y: p.y, w: s.width, h: s.height })); }).catch(() => {}); }

getVersion().then(v => {
  const title = `YMB TSE Stock v${v} - 東証株価`;
  win.setTitle(title);
  document.title = title;
  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = `YMB TSE Stock v${v}`;
}).catch(() => {});

// ===== invokeParams ヘルパー =====
function stockInvokeParams(code) {
  const nc = getNameCache();
  return { code, knownName: nc[code] ?? null, needIntradayCloses: state.sparkPeriod === "1d" };
}

// ===== ソート =====
function sortArr(arr) {
  if (!state.sortKey) return arr;
  const k = state.sortKey, asc = state.sortAsc;
  if (k === "_score") {
    return [...arr].sort((a, b) => {
      const { buy: ba, sell: sa } = scoreSignals(a.signals);
      const { buy: bb, sell: sb } = scoreSignals(b.signals);
      return asc ? (ba - sa) - (bb - sb) : (bb - sb) - (ba - sa);
    });
  }
  if (k === "_w52hi") {
    return [...arr].sort((a, b) => {
      const va = a.week52High ? (a.price / a.week52High - 1) * 100 : null;
      const vb = b.week52High ? (b.price / b.week52High - 1) * 100 : null;
      if (va == null && vb == null) return 0; if (va == null) return asc ? 1 : -1; if (vb == null) return asc ? -1 : 1;
      return asc ? va - vb : vb - va;
    });
  }
  if (k === "_w52lo") {
    return [...arr].sort((a, b) => {
      const va = a.week52Low ? (a.price / a.week52Low - 1) * 100 : null;
      const vb = b.week52Low ? (b.price / b.week52Low - 1) * 100 : null;
      if (va == null && vb == null) return 0; if (va == null) return asc ? 1 : -1; if (vb == null) return asc ? -1 : 1;
      return asc ? va - vb : vb - va;
    });
  }
  if (k === "_pnl") {
    return [...arr].sort((a, b) => {
      const pfa = state.portfolio[a.code], pfb = state.portfolio[b.code];
      const va = pfa?.cost && pfa?.qty ? (a.price - pfa.cost) * pfa.qty : null;
      const vb = pfb?.cost && pfb?.qty ? (b.price - pfb.cost) * pfb.qty : null;
      if (va == null && vb == null) return 0; if (va == null) return asc ? 1 : -1; if (vb == null) return asc ? -1 : 1;
      return asc ? va - vb : vb - va;
    });
  }
  return [...arr].sort((a, b) => {
    let va = a[k], vb = b[k];
    if (va == null) va = asc ? "￿" : ""; if (vb == null) vb = asc ? "￿" : "";
    if (typeof va === "string") return asc ? va.localeCompare(vb, "ja") : vb.localeCompare(va, "ja");
    return asc ? va - vb : vb - va;
  });
}

// ===== 列パネル =====
const colPanel = (() => { const el = document.createElement("div"); el.id = "col-panel"; document.body.appendChild(el); return el; })();

function renderColPanel() {
  const groupOrder = getGroupOrder();
  const labelMap = new Map(TOGGLE_LABELS);
  colPanel.innerHTML = groupOrder.map((key, i) => {
    const isFirst = i === 0, isLast = i === groupOrder.length - 1;
    return `<div class="col-toggle-item">
      <input type="checkbox" data-toggle="${key}"${state.hiddenToggles.has(key) ? "" : " checked"}>
      <span class="col-toggle-label">${labelMap.get(key) || key}</span>
      <span class="col-toggle-arrows">
        <button class="col-move-btn" data-key="${key}" data-dir="-1"${isFirst ? " disabled" : ""}>▲</button>
        <button class="col-move-btn" data-key="${key}" data-dir="1"${isLast ? " disabled" : ""}>▼</button>
      </span>
    </div>`;
  }).join("");
  colPanel.querySelectorAll("input[data-toggle]").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) state.hiddenToggles.delete(cb.dataset.toggle);
      else state.hiddenToggles.add(cb.dataset.toggle);
      saveColState(); render();
    });
  });
  colPanel.querySelectorAll(".col-move-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      moveGroup(btn.dataset.key, parseInt(btn.dataset.dir), saveColState, render, renderColPanel);
    });
  });
}

colPanelBtn.addEventListener("click", e => {
  e.stopPropagation();
  if (colPanel.classList.contains("open")) { colPanel.classList.remove("open"); return; }
  sigCatPanel.classList.remove("open");
  marketSessionPanel.classList.remove("open");
  renderColPanel();
  const r = colPanelBtn.getBoundingClientRect();
  colPanel.style.top = (r.bottom + 4) + "px";
  colPanel.style.right = (window.innerWidth - r.right) + "px";
  colPanel.classList.add("open");
});

// ===== シグナル種別パネル =====
const sigCatPanel = (() => { const el = document.createElement("div"); el.id = "sig-cat-panel"; document.body.appendChild(el); return el; })();

function renderSigCatPanel() {
  const allOn = SIG_CATEGORIES.every(c => state.sigCats[c.key] !== false);
  const allOff = SIG_CATEGORIES.every(c => state.sigCats[c.key] === false);
  sigCatPanel.innerHTML = `
    <div class="sig-cat-header">
      <span>表示シグナルの種類</span>
      <span class="sig-cat-ctrl">
        <button class="sig-cat-all-btn"${allOn ? " disabled" : ""}>全ON</button>
        <button class="sig-cat-none-btn"${allOff ? " disabled" : ""}>全OFF</button>
      </span>
    </div>
    ${SIG_CATEGORIES.map(c => `
      <label class="sig-cat-item">
        <input type="checkbox" data-cat="${c.key}"${state.sigCats[c.key] !== false ? " checked" : ""}>
        <span>${c.label}</span>
      </label>`).join("")}
  `;
  sigCatPanel.querySelectorAll("input[data-cat]").forEach(cb => {
    cb.addEventListener("change", () => {
      state.sigCats[cb.dataset.cat] = cb.checked;
      saveSigCats(); render();
    });
  });
  sigCatPanel.querySelector(".sig-cat-all-btn").addEventListener("click", () => {
    SIG_CATEGORIES.forEach(c => { state.sigCats[c.key] = true; });
    saveSigCats(); render(); renderSigCatPanel();
  });
  sigCatPanel.querySelector(".sig-cat-none-btn").addEventListener("click", () => {
    SIG_CATEGORIES.forEach(c => { state.sigCats[c.key] = false; });
    saveSigCats(); render(); renderSigCatPanel();
  });
}

sigCatBtn.addEventListener("click", e => {
  e.stopPropagation();
  if (sigCatPanel.classList.contains("open")) { sigCatPanel.classList.remove("open"); return; }
  colPanel.classList.remove("open");
  marketSessionPanel.classList.remove("open");
  renderSigCatPanel();
  const r = sigCatBtn.getBoundingClientRect();
  sigCatPanel.style.top = (r.bottom + 4) + "px";
  sigCatPanel.style.right = (window.innerWidth - r.right) + "px";
  sigCatPanel.classList.add("open");
});

// ===== 市場時間設定パネル =====
const marketSessionBtn   = document.getElementById("market-session-btn");
const marketSessionPanel = (() => { const el = document.createElement("div"); el.id = "market-session-panel"; document.body.appendChild(el); return el; })();

function renderMarketSessionPanel() {
  const ms = state.marketSession;
  marketSessionPanel.innerHTML = `
    <div class="ms-header">取引時間設定</div>
    <label class="ms-row">開場<input type="time" id="ms-open"  value="${ms.open}"  step="60"></label>
    <label class="ms-row">閉場<input type="time" id="ms-close" value="${ms.close}" step="60"></label>
    <label class="ms-row ms-lunch-toggle">
      <input type="checkbox" id="ms-lunch"${ms.lunch ? " checked" : ""}> 昼休みあり
    </label>
    <div id="ms-lunch-range" style="${ms.lunch ? "" : "display:none"}">
      <label class="ms-row">昼休み開始<input type="time" id="ms-lunch-start" value="${ms.lunchStart}" step="60"></label>
      <label class="ms-row">昼休み終了<input type="time" id="ms-lunch-end"   value="${ms.lunchEnd}"   step="60"></label>
    </div>
    <div class="ms-btns">
      <button id="ms-reset-btn">リセット</button>
      <button id="ms-apply-btn">適用</button>
    </div>`;

  document.getElementById("ms-lunch").addEventListener("change", e => {
    document.getElementById("ms-lunch-range").style.display = e.target.checked ? "" : "none";
  });
  document.getElementById("ms-reset-btn").addEventListener("click", () => {
    const { MARKET_SESSION_DEFAULT: d } = { MARKET_SESSION_DEFAULT };
    state.marketSession = { ...MARKET_SESSION_DEFAULT };
    saveMarketSession();
    renderMarketSessionPanel();
    updateMarketStatus();
  });
  document.getElementById("ms-apply-btn").addEventListener("click", () => {
    state.marketSession = {
      open:       document.getElementById("ms-open").value || MARKET_SESSION_DEFAULT.open,
      close:      document.getElementById("ms-close").value || MARKET_SESSION_DEFAULT.close,
      lunch:      document.getElementById("ms-lunch").checked,
      lunchStart: document.getElementById("ms-lunch-start").value || MARKET_SESSION_DEFAULT.lunchStart,
      lunchEnd:   document.getElementById("ms-lunch-end").value || MARKET_SESSION_DEFAULT.lunchEnd,
    };
    saveMarketSession();
    marketSessionPanel.classList.remove("open");
    updateMarketStatus();
  });
}

marketSessionBtn.addEventListener("click", e => {
  e.stopPropagation();
  if (marketSessionPanel.classList.contains("open")) { marketSessionPanel.classList.remove("open"); return; }
  colPanel.classList.remove("open");
  sigCatPanel.classList.remove("open");
  renderMarketSessionPanel();
  const r = marketSessionBtn.getBoundingClientRect();
  marketSessionPanel.style.top   = (r.bottom + 4) + "px";
  marketSessionPanel.style.right = (window.innerWidth - r.right) + "px";
  marketSessionPanel.classList.add("open");
});

// ===== アラートパネル =====
const alertPanel = (() => { const el = document.createElement("div"); el.id = "alert-panel"; document.body.appendChild(el); return el; })();
let _alertCode = null;

function openAlertPanel(code, anchorEl) {
  _alertCode = code;
  const al = state.alerts[code] || {};
  alertPanel.innerHTML = `
    <div class="alert-panel-title">🔔 アラート設定 <span class="alert-code">${code}</span></div>
    <label>上値アラート<input type="number" id="alert-hi" placeholder="設定なし" value="${al.hi ?? ""}" min="0" step="1"></label>
    <label>下値アラート<input type="number" id="alert-lo" placeholder="設定なし" value="${al.lo ?? ""}" min="0" step="1"></label>
    <div class="alert-panel-btns">
      <button id="alert-save-btn">保存</button>
      <button id="alert-clear-btn">クリア</button>
    </div>`;
  const r = anchorEl.getBoundingClientRect();
  alertPanel.style.top = (r.bottom + 4) + "px";
  alertPanel.style.left = Math.min(r.left, window.innerWidth - 230) + "px";
  alertPanel.classList.add("open");
  alertPanel.querySelector("#alert-save-btn").addEventListener("click", () => {
    const hi = parseFloat(alertPanel.querySelector("#alert-hi").value);
    const lo = parseFloat(alertPanel.querySelector("#alert-lo").value);
    state.alerts[_alertCode] = { hi: isNaN(hi) ? null : hi, lo: isNaN(lo) ? null : lo };
    saveAlerts(); alertPanel.classList.remove("open"); render();
  });
  alertPanel.querySelector("#alert-clear-btn").addEventListener("click", () => {
    delete state.alerts[_alertCode];
    saveAlerts(); alertPanel.classList.remove("open"); render();
  });
}
alertPanel.addEventListener("click", e => e.stopPropagation());

// ===== メモパネル =====
const notePanel = (() => { const el = document.createElement("div"); el.id = "note-panel"; document.body.appendChild(el); return el; })();
let _noteCode = null;

function openNotePanel(code, anchorEl) {
  _noteCode = code;
  const note = state.notes[code] || "";
  notePanel.innerHTML = `
    <div class="note-panel-title">📝 メモ <span class="note-code">${code}</span></div>
    <textarea id="note-text" rows="4" placeholder="メモを入力...">${note}</textarea>
    <div class="note-panel-btns">
      <button id="note-save-btn">保存</button>
      <button id="note-clear-btn">クリア</button>
    </div>`;
  const r = anchorEl.getBoundingClientRect();
  notePanel.style.top = (r.bottom + 4) + "px";
  notePanel.style.left = Math.min(r.left, window.innerWidth - 260) + "px";
  notePanel.classList.add("open");
  notePanel.querySelector("#note-text").focus();
  notePanel.querySelector("#note-save-btn").addEventListener("click", () => {
    const text = notePanel.querySelector("#note-text").value.trim();
    if (text) state.notes[_noteCode] = text; else delete state.notes[_noteCode];
    saveNotes(); notePanel.classList.remove("open"); render();
  });
  notePanel.querySelector("#note-clear-btn").addEventListener("click", () => {
    delete state.notes[_noteCode];
    saveNotes(); notePanel.classList.remove("open"); render();
  });
}
notePanel.addEventListener("click", e => e.stopPropagation());

// ===== ポートフォリオパネル =====
const portfolioPanel = (() => { const el = document.createElement("div"); el.id = "portfolio-panel"; document.body.appendChild(el); return el; })();
let _portfolioCode = null;

function openPortfolioPanel(code, anchorEl) {
  _portfolioCode = code;
  const pf = state.portfolio[code] || {};
  const s = stocks().find(x => x.code === code);
  const curPrice = s?.price;
  let previewHtml = "";
  if (pf.cost && pf.qty && curPrice) {
    const pnl = (curPrice - pf.cost) * pf.qty;
    const pnlPct = ((curPrice - pf.cost) / pf.cost) * 100;
    const cls = pnl >= 0 ? "up" : "down";
    previewHtml = `<div class="pf-preview">
      <div>評価額: <b>¥${(curPrice * pf.qty).toLocaleString()}</b></div>
      <div>含み損益: <span class="pf-${cls}">${pnl >= 0 ? "+" : ""}¥${Math.round(pnl).toLocaleString()} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)</span></div>
    </div>`;
  }
  portfolioPanel.innerHTML = `
    <div class="pf-panel-title">💼 ポートフォリオ <span class="pf-code">${code}</span></div>
    <label>取得単価（円）<input type="number" id="pf-cost" placeholder="例: 2500" value="${pf.cost ?? ""}" min="0" step="1"></label>
    <label>保有株数<input type="number" id="pf-qty" placeholder="例: 100" value="${pf.qty ?? ""}" min="0" step="100"></label>
    ${previewHtml}
    <div class="pf-panel-btns">
      <button id="pf-save-btn">保存</button>
      <button id="pf-clear-btn">クリア</button>
    </div>`;
  const r = anchorEl.getBoundingClientRect();
  portfolioPanel.style.top = (r.bottom + 4) + "px";
  portfolioPanel.style.left = Math.min(r.left, window.innerWidth - 240) + "px";
  portfolioPanel.classList.add("open");
  portfolioPanel.querySelector("#pf-cost").focus();
  portfolioPanel.querySelector("#pf-save-btn").addEventListener("click", () => {
    const cost = parseFloat(portfolioPanel.querySelector("#pf-cost").value);
    const qty  = parseInt(portfolioPanel.querySelector("#pf-qty").value, 10);
    if (!isNaN(cost) && !isNaN(qty) && cost > 0 && qty > 0) {
      state.portfolio[_portfolioCode] = { cost, qty };
    } else {
      delete state.portfolio[_portfolioCode];
    }
    savePortfolio(); portfolioPanel.classList.remove("open"); render();
  });
  portfolioPanel.querySelector("#pf-clear-btn").addEventListener("click", () => {
    delete state.portfolio[_portfolioCode];
    savePortfolio(); portfolioPanel.classList.remove("open"); render();
  });
}
portfolioPanel.addEventListener("click", e => e.stopPropagation());

// ===== インポートモーダル =====
const importModal = (() => { const el = document.createElement("div"); el.id = "import-modal"; document.body.appendChild(el); return el; })();

function openImportModal() {
  importModal.innerHTML = `
    <div class="import-box">
      <div class="import-title">📋 銘柄を一括インポート</div>
      <div class="import-desc">銘柄コードをカンマ・改行・スペース区切りで入力してください</div>
      <textarea id="import-text" rows="6" placeholder="7203, 8306, 9984&#10;6758&#10;4755 2413"></textarea>
      <div class="import-btns">
        <button id="import-exec-btn">追加</button>
        <button id="import-cancel-btn">キャンセル</button>
      </div>
      <div id="import-status"></div>
    </div>`;
  importModal.classList.add("open");
  importModal.addEventListener("click", () => importModal.classList.remove("open"));
  importModal.querySelector(".import-box").addEventListener("click", e => e.stopPropagation());
  importModal.querySelector("#import-text").focus();
  importModal.querySelector("#import-cancel-btn").addEventListener("click", () => importModal.classList.remove("open"));
  importModal.querySelector("#import-exec-btn").addEventListener("click", async () => {
    const raw = importModal.querySelector("#import-text").value;
    const codes = [...new Set(raw.split(/[\s,、\n]+/).map(s => s.trim()).filter(s => /^\d{4}$/.test(s)))];
    const statusEl = importModal.querySelector("#import-status");
    if (codes.length === 0) { statusEl.textContent = "有効な4桁コードが見つかりません"; return; }
    statusEl.textContent = `0 / ${codes.length} 追加中...`;
    let ok = 0; const ng = [];
    for (const code of codes) {
      if (stocks().find(s => s.code === code)) { ok++; statusEl.textContent = `${ok} / ${codes.length} 処理中...`; continue; }
      try {
        const data = await invoke("fetch_stock_cmd", stockInvokeParams(code));
        const nc = getNameCache(); if (data.nameJa && !nc[code]) { nc[code] = data.nameJa; saveNameCache(nc); }
        data._volAvg = data.volume; stocks().push(data); state.prevSignals[code] = hash(data.signals);
        ok++; statusEl.textContent = `${ok} / ${codes.length} 処理中...`;
      } catch (_) { ng.push(code); }
    }
    saveAll(); render();
    scheduleNameAutoSize(tableHeader, stockList, saveColWidths, visibleCols, applySticky);
    statusEl.textContent = `完了: ${ok}件追加${ng.length ? `、取得失敗: ${ng.join(", ")}` : ""}`;
  });
}

importBtn.addEventListener("click", openImportModal);

// ===== 指数 =====
async function fetchIndices() {
  try {
    const n225 = await invoke("fetch_index_cmd", { symbol: "^N225" });
    idxN225.innerHTML = `日経 ${n225.price.toLocaleString()} <span class="${n225.change >= 0 ? "up" : "down"}">${n225.change >= 0 ? "+" : ""}${n225.changePercent.toFixed(2)}%</span>`;
  } catch (_) { idxN225.innerHTML = "日経 ---"; }
}

// ===== CSV =====
function exportCSV() {
  const arr = stocks(); if (arr.length === 0) return;
  const headers = ["コード", "企業名", "現在株価", "前日比%", "前日比", "前日終値", "始値", "高値", "安値", "出来高", "MA5", "MA25", "MA75", "MACD", "Sig", "RSI", "判定", "52週高値", "52週安値", "52高乖離%", "52安乖離%"];
  const rows = arr.map(s => {
    const w52hDev = s.week52High ? ((s.price / s.week52High - 1) * 100).toFixed(1) : "";
    const w52lDev = s.week52Low  ? ((s.price / s.week52Low  - 1) * 100).toFixed(1) : "";
    return [s.code, s.nameJa || s.name, s.price, s.changePercent?.toFixed(2), s.change, s.prevClose, s.open, s.high, s.low, s.volume, s.ma5?.toFixed(2), s.ma25?.toFixed(2), s.ma75?.toFixed(2), s.macd?.toFixed(4), s.macdSignal?.toFixed(4), s.rsi?.toFixed(1), scoreText(s.signals), s.week52High, s.week52Low, w52hDev, w52lDev];
  });
  const csv = [headers, ...rows].map(r => r.map(c => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  const filename = `tse-stock-${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`CSVエクスポート完了: ${filename}`, false);
}

// ===== ソートヘッダーイベント =====
tableHeader.addEventListener("click", e => {
  const sp = e.target.closest("span"); if (!sp) return;
  const cls = [...sp.classList].find(c => SORT_KEYS[c]); if (!cls || !SORT_KEYS[cls].key) return;
  const sk = SORT_KEYS[cls];
  if (state.sortKey === sk.key) state.sortAsc = !state.sortAsc; else { state.sortKey = sk.key; state.sortAsc = true; }
  render();
});

// ===== 銘柄操作 =====
async function addStock(code) {
  code = code.trim(); if (!code) return;
  const arr = stocks(); if (arr.find(s => s.code === code)) { setStatus(`${code} は既に追加済み`, true); return; }
  setStatus(`${code} 取得中...`, false);
  try {
    const data = await invoke("fetch_stock_cmd", stockInvokeParams(code));
    const nc = getNameCache(); if (data.nameJa && !nc[code]) { nc[code] = data.nameJa; saveNameCache(nc); }
    data._volAvg = data.volume; arr.push(data); setStocks(arr); saveAll(); render();
    scheduleNameAutoSize(tableHeader, stockList, saveColWidths, visibleCols, applySticky);
    setStatus(`${code} 追加完了`, false);
  } catch (e) { setStatus(`${code} の取得に失敗: ${e}`, true); }
}
function removeStock(code) {
  const arr = stocks(); setStocks(arr.filter(s => s.code !== code));
  delete state.prevSignals[code]; delete state.priceDirs[code];
  delete state.alerts[code]; delete state.notes[code];
  saveAll(); saveAlerts(); saveNotes(); render();
  scheduleNameAutoSize(tableHeader, stockList, saveColWidths, visibleCols, applySticky);
}

// ===== 一時停止 =====
pauseBtn.addEventListener("click", () => {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? "▶" : "⏸";
  pauseBtn.classList.toggle("paused", state.paused);
  setStatus(state.paused ? "自動更新停止中" : "自動更新再開", false);
});

// ===== 密度 =====
function applyDensity() {
  document.body.classList.remove("density-compact", "density-large");
  if (state.density !== "normal") document.body.classList.add("density-" + state.density);
  if (densityBtn) densityBtn.textContent = DENSITY_LABELS[state.density] || "標準";
}

if (densityBtn) {
  densityBtn.addEventListener("click", () => {
    state.density = DENSITY_NEXT[state.density] || "normal";
    localStorage.setItem("tse-stock-density", state.density);
    applyDensity();
  });
}

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    state.signalFilter = btn.dataset.filter;
    localStorage.setItem("tse-stock-filter", state.signalFilter);
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === state.signalFilter));
    render();
  });
});

if (pinBtn) {
  pinBtn.addEventListener("click", () => {
    state.pinCols = !state.pinCols;
    localStorage.setItem("tse-stock-pin", state.pinCols);
    pinBtn.classList.toggle("active", state.pinCols);
    applySticky();
  });
}

if (sparkSel) {
  sparkSel.value = state.sparkPeriod;
  sparkSel.addEventListener("change", () => {
    state.sparkPeriod = sparkSel.value;
    localStorage.setItem("tse-stock-spark", state.sparkPeriod);
    render();
  });
}

// ===== 一括更新 =====
async function fetchAll() {
  if (state.paused || stocks().length === 0) return;
  const arr = stocks();
  let sigBuy = false, sigSell = false, anyOk = false;
  for (const s of arr) {
    try {
      const op = s.price;
      const data = await invoke("fetch_stock_cmd", stockInvokeParams(s.code));
      const pj = s.nameJa; Object.assign(s, data); if (!s.nameJa && pj) s.nameJa = pj;
      if (!s._volAvg) s._volAvg = s.volume; else s._volAvg = s._volAvg * 0.9 + s.volume * 0.1;
      if (data.price > op) { priceFlash[s.code] = "up"; state.priceDirs[s.code] = "up"; }
      else if (data.price < op) { priceFlash[s.code] = "down"; state.priceDirs[s.code] = "down"; }
      else { delete state.priceDirs[s.code]; }
      const ch = detectSignalChange(s.code, data.signals);
      if (ch === "buy") sigBuy = true; else if (ch === "sell") sigSell = true;
      const al = state.alerts[s.code];
      if (al && op != null) {
        if (al.hi != null && op < al.hi && data.price >= al.hi) {
          alertBeep(true);
          const msg = `🔔 ${s.code} 上値アラート ¥${al.hi.toLocaleString()} 到達`;
          setStatus(msg, false);
          sendOsNotification(`TSE Stock: ${s.code} 上値アラート`, `現在価格 ¥${data.price.toLocaleString()} が ¥${al.hi.toLocaleString()} に到達`);
        }
        if (al.lo != null && op > al.lo && data.price <= al.lo) {
          alertBeep(false);
          const msg = `🔔 ${s.code} 下値アラート ¥${al.lo.toLocaleString()} 到達`;
          setStatus(msg, false);
          sendOsNotification(`TSE Stock: ${s.code} 下値アラート`, `現在価格 ¥${data.price.toLocaleString()} が ¥${al.lo.toLocaleString()} に到達`);
        }
      }
      anyOk = true;
    } catch (_) {}
  }
  render(); fetchIndices();
  if (anyOk && (sigBuy || sigSell)) signalBeep(sigBuy);
  if (state.signalFilter === "all") setStatus(`更新完了 ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`, false);
}

// ===== 市場時間・更新間隔 =====
function toMins(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function isMarketOpen() {
  const jst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  if ([0, 6].includes(jst.getDay())) return false;
  const mins = jst.getHours() * 60 + jst.getMinutes();
  const { open, close, lunch, lunchStart, lunchEnd } = state.marketSession;
  if (mins < toMins(open) || mins >= toMins(close)) return false;
  if (lunch && mins >= toMins(lunchStart) && mins < toMins(lunchEnd)) return false;
  return true;
}
function getEffectiveInterval() { return isMarketOpen() ? state.interval : Math.max(state.interval, 300); }

function updateMarketStatus() {
  const open = isMarketOpen();
  const eff = getEffectiveInterval();
  marketStatus.textContent = open ? "開場中" : "時間外";
  marketStatus.className = "market-status " + (open ? "open" : "closed");
  const m = Math.floor(eff / 60), s = eff % 60;
  marketStatus.title = `更新間隔: ${m > 0 ? m + "分" : ""}${s > 0 ? s + "秒" : ""}`;
}

let _intervalId = null;

async function scheduleTick() {
  await fetchAll();
  updateMarketStatus();
  _intervalId = setTimeout(scheduleTick, getEffectiveInterval() * 1000);
}

function restartInterval() {
  if (_intervalId) { clearTimeout(_intervalId); _intervalId = null; }
  updateMarketStatus();
  _intervalId = setTimeout(scheduleTick, getEffectiveInterval() * 1000);
}

intervalSel.value = String(state.interval);
intervalSel.addEventListener("change", () => {
  state.interval = parseInt(intervalSel.value);
  localStorage.setItem("tse-stock-interval", state.interval);
  restartInterval();
});

refreshBtn.addEventListener("click", async () => {
  if (stocks().length === 0) return;
  setStatus("更新中...", false);
  await fetchAll();
});

addBtn.addEventListener("click", async () => { const c = stockCodeInput.value.trim(); if (!c) return; stockCodeInput.value = ""; await addStock(c); });
stockCodeInput.addEventListener("keydown", e => { if (e.key === "Enter") addBtn.click(); });
addTabBtn.addEventListener("click", addTab);
exportBtn.addEventListener("click", exportCSV);

// ===== イベント =====
stockList.addEventListener("click", e => {
  const upB = e.target.closest(".reorder-btn.up"), dnB = e.target.closest(".reorder-btn.down");
  const delB = e.target.closest(".del-btn");
  const alertEl = e.target.closest(".cell-alert"), noteEl = e.target.closest(".cell-note"), pnlEl = e.target.closest(".cell-pnl");
  const arr = stocks();
  if (upB && !upB.disabled) {
    const i = arr.findIndex(s => s.code === upB.dataset.code);
    if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; setStocks(arr); saveAll(); render(); }
  } else if (dnB && !dnB.disabled) {
    const i = arr.findIndex(s => s.code === dnB.dataset.code);
    if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; setStocks(arr); saveAll(); render(); }
  } else if (delB) {
    removeStock(delB.dataset.code);
  } else if (alertEl) {
    e.stopPropagation();
    alertPanel.classList.remove("open"); notePanel.classList.remove("open"); portfolioPanel.classList.remove("open");
    openAlertPanel(alertEl.dataset.code, alertEl);
  } else if (noteEl) {
    e.stopPropagation();
    notePanel.classList.remove("open"); alertPanel.classList.remove("open"); portfolioPanel.classList.remove("open");
    openNotePanel(noteEl.dataset.code, noteEl);
  } else if (pnlEl) {
    e.stopPropagation();
    portfolioPanel.classList.remove("open"); alertPanel.classList.remove("open"); notePanel.classList.remove("open");
    openPortfolioPanel(pnlEl.dataset.code, pnlEl);
  }
});

document.addEventListener("click", () => {
  colPanel.classList.remove("open");
  sigCatPanel.classList.remove("open");
  marketSessionPanel.classList.remove("open");
  alertPanel.classList.remove("open");
  notePanel.classList.remove("open");
  portfolioPanel.classList.remove("open");
});

stockList.addEventListener("mouseover", e => {
  const cell = e.target.closest(".cell-sig");
  if (cell && !cell.contains(e.relatedTarget)) cell.querySelector(".sig-inner")?.getAnimations()[0]?.pause();
});
stockList.addEventListener("mouseout", e => {
  const cell = e.target.closest(".cell-sig");
  if (cell && !cell.contains(e.relatedTarget)) cell.querySelector(".sig-inner")?.getAnimations()[0]?.play();
});

// ===== 初期化 =====
const DEFAULT_STOCKS = ["7203", "8306", "9984"];

async function init() {
  // モジュールのDOMref初期化
  initSticky(tableHeader, stockList);
  initRender(tableHeader, stockList);
  initRenderHelpers(setStatus, sortArr);
  initTabs(tabsEl, render, saveAll);

  restoreWindow();
  applyDensity();
  if (pinBtn) pinBtn.classList.toggle("active", state.pinCols);
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.toggle("active", b.dataset.filter === state.signalFilter));
  if (sparkSel) sparkSel.value = state.sparkPeriod;

  const td = loadAll();
  state.tabs = td.map(t => ({ name: t.name, stocks: [] }));
  state.activeTabIdx = Math.min(parseInt(localStorage.getItem("tse-stock-active") || 0), state.tabs.length - 1);
  renderTabs();
  const codes = td[state.activeTabIdx]?.codes || DEFAULT_STOCKS;
  for (const code of codes) {
    try {
      const data = await invoke("fetch_stock_cmd", stockInvokeParams(code));
      const nc = getNameCache(); if (data.nameJa && !nc[code]) { nc[code] = data.nameJa; saveNameCache(nc); }
      data._volAvg = data.volume; stocks().push(data); state.prevSignals[code] = hash(data.signals);
    } catch (e) { setStatus(`${code} 失敗: ${e}`, true); }
  }
  saveAll(); render();
  scheduleNameAutoSize(tableHeader, stockList, saveColWidths, visibleCols, applySticky);
  setStatus(stocks().length > 0 ? "完了" : "取得できませんでした", stocks().length === 0);
  fetchIndices();
  restartInterval();
  await initNotifications();
}

// ===== ウィンドウ保存 =====
let saveT;
win.onResized(() => { clearTimeout(saveT); saveT = setTimeout(saveWindowPos, 500); });
win.onMoved(() => { clearTimeout(saveT); saveT = setTimeout(saveWindowPos, 500); });

// ===== 進捗イベント =====
listen("stock-progress", e => { const { code, step } = e.payload; setStatus(`${code}: ${step}`, false); });

// ===== 凡例ツールチップ =====
const legTip = document.getElementById("leg-tip");
if (legTip) {
  document.querySelectorAll(".leg-item[data-tip]").forEach(el => {
    el.addEventListener("mouseenter", e => {
      legTip.textContent = el.dataset.tip;
      legTip.style.display = "block";
      placeLegTip(e);
    });
    el.addEventListener("mousemove", placeLegTip);
    el.addEventListener("mouseleave", () => { legTip.style.display = "none"; });
  });
  function placeLegTip(e) {
    const tw = legTip.offsetWidth, th = legTip.offsetHeight;
    const x = Math.max(8, Math.min(e.clientX - tw / 2, window.innerWidth - tw - 8));
    const y = e.clientY - th - 14;
    legTip.style.left = x + "px";
    legTip.style.top = (y < 8 ? e.clientY + 16 : y) + "px";
  }
}

// ===== 起動 =====
init();

// ===== シグナル列のリサイズ監視 =====
let _sigResizeT;
new ResizeObserver(() => { clearTimeout(_sigResizeT); _sigResizeT = setTimeout(updateSigScroll, 100); }).observe(stockList);
