import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ===== 状態 =====
const state = {
  stocks: [],
  sortKey: null,
  sortAsc: true,
};

// ===== DOM =====
const stockList = document.getElementById("stock-list");
const stockCodeInput = document.getElementById("stock-code-input");
const addBtn = document.getElementById("add-btn");
const statusMsg = document.getElementById("status-msg");
const tableHeader = document.querySelector(".table-header");

// ===== 永続化 =====
const DEFAULT_STOCKS = ["7203", "8306", "9984"];
const STORAGE_KEY = "tse-stock-codes";
const NAME_CACHE_KEY = "tse-stock-names";

function saveStockCodes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.stocks.map(s => s.code)));
}
function loadStockCodes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const c = JSON.parse(raw); if (Array.isArray(c) && c.length > 0) return c; }
  } catch (_) {}
  return null;
}
function getNameCache() {
  try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || "{}"); } catch (_) { return {}; }
}
function saveNameCache(cache) {
  localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(cache));
}

// ===== ヘルパー =====
function setStatus(msg, isError) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? "#f85149" : "#8b949e";
}
const fmt = n => n != null ? n.toLocaleString() : "-";
const fmtPct = n => n != null ? (n >= 0 ? "+" : "") + n.toFixed(2) + "%" : "-";
const fmtOpt = (n, s) => n != null ? n.toLocaleString() + (s||"") : "-";

// ===== ソート =====
const SORT_KEYS = {
  "col-code":    { key: "code",         type: "string" },
  "col-name":    { key: "nameJa",       type: "string" },
  "col-price":   { key: "price",        type: "number" },
  "col-change":  { key: "change",       type: "number" },
  "col-open":    { key: "open",         type: "number" },
  "col-volume":  { key: "volume",       type: "number" },
  "col-rsi":     { key: "rsi",          type: "number" },
};

tableHeader.addEventListener("click", (e) => {
  const span = e.target.closest("span");
  if (!span) return;
  const cls = [...span.classList].find(c => SORT_KEYS[c]);
  if (!cls || !SORT_KEYS[cls].key) return;

  const sk = SORT_KEYS[cls];
  if (state.sortKey === sk.key) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortKey = sk.key;
    state.sortAsc = true;
  }
  render();
});

function sortStocks(arr) {
  if (!state.sortKey) return arr;
  const key = state.sortKey;
  const asc = state.sortAsc;
  return [...arr].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va == null) va = asc ? "\uffff" : "";
    if (vb == null) vb = asc ? "\uffff" : "";
    if (typeof va === "string") return asc ? va.localeCompare(vb, "ja") : vb.localeCompare(va, "ja");
    return asc ? va - vb : vb - va;
  });
}

// ===== レンダリング =====
function render() {
  if (state.stocks.length === 0) {
    stockList.innerHTML = `<div class="empty-state">銘柄がありません。上の入力欄からコードを追加してください。</div>`;
    return;
  }

  const nameCache = getNameCache();
  const sorted = sortStocks(state.stocks);

  stockList.innerHTML = sorted.map((s, i) => {
    const up = s.change >= 0;
    const rsiClass = s.rsi != null ? (s.rsi > 70 ? "over" : s.rsi < 30 ? "under" : "") : "";
    const nameJa = nameCache[s.code] || s.nameJa;
    const nameDisplay = nameJa
      ? `<span class="ja">${nameJa}</span><span class="en">${s.name}</span>`
      : s.name;
    const isFirst = i === 0;
    const isLast = i === sorted.length - 1;

    return `
      <div class="stock-row" data-code="${s.code}">
        <span class="cell-reorder">
          <button class="reorder-btn up" data-code="${s.code}" ${isFirst ? "disabled" : ""}>▲</button>
          <button class="reorder-btn down" data-code="${s.code}" ${isLast ? "disabled" : ""}>▼</button>
        </span>
        <span class="cell-code">${s.code}</span>
        <span class="cell-name" title="${nameJa || s.name}">${nameDisplay}</span>
        <span class="cell-price">¥${fmt(s.price)}</span>
        <span class="cell-change ${up ? "up" : "down"}">${fmtPct(s.changePercent)} (${fmt(s.change)})</span>
        <span class="cell-prev">¥${fmt(s.prevClose)}</span>
        <span class="cell-open">¥${fmt(s.open)}</span>
        <span class="cell-hl">¥${fmt(s.high)}${s.highTime ? `<span class="time">${s.highTime}</span>` : ""}</span>
        <span class="cell-hl">¥${fmt(s.low)}${s.lowTime ? `<span class="time">${s.lowTime}</span>` : ""}</span>
        <span class="cell-volume">${fmt(s.volume)}</span>
        <span class="cell-ma ma5">${fmtOpt(s.ma5)}</span>
        <span class="cell-ma ma25">${fmtOpt(s.ma25)}</span>
        <span class="cell-ma ma75">${fmtOpt(s.ma75)}</span>
        <span class="cell-ind">${fmtOpt(s.macd)}</span>
        <span class="cell-ind">${fmtOpt(s.macdSignal)}</span>
        <span class="cell-rsi ${rsiClass}">${fmtOpt(s.rsi)}</span>
        <span class="cell-sig">${s.signals?.join(" ") || ""}</span>
        <span class="cell-del"><button class="del-btn" data-code="${s.code}">×</button></span>
      </div>`;
  }).join("");

  // ソートインジケーター
  tableHeader.querySelectorAll("span").forEach(span => span.classList.remove("sort-asc", "sort-desc"));
  if (state.sortKey) {
    for (const [cls, sk] of Object.entries(SORT_KEYS)) {
      if (sk.key === state.sortKey) {
        const span = tableHeader.querySelector(`.${cls}`);
        if (span) span.classList.add(state.sortAsc ? "sort-asc" : "sort-desc");
        break;
      }
    }
  }
}

// ===== 並べ替え・削除（イベント委譲） =====
stockList.addEventListener("click", (e) => {
  const upBtn = e.target.closest(".reorder-btn.up");
  const downBtn = e.target.closest(".reorder-btn.down");
  const delBtn = e.target.closest(".del-btn");

  if (upBtn && !upBtn.disabled) {
    const code = upBtn.dataset.code;
    const idx = state.stocks.findIndex(s => s.code === code);
    if (idx > 0) {
      [state.stocks[idx - 1], state.stocks[idx]] = [state.stocks[idx], state.stocks[idx - 1]];
      saveStockCodes();
      render();
    }
  } else if (downBtn && !downBtn.disabled) {
    const code = downBtn.dataset.code;
    const idx = state.stocks.findIndex(s => s.code === code);
    if (idx < state.stocks.length - 1) {
      [state.stocks[idx], state.stocks[idx + 1]] = [state.stocks[idx + 1], state.stocks[idx]];
      saveStockCodes();
      render();
    }
  } else if (delBtn) {
    removeStock(delBtn.dataset.code);
  }
});

// ===== 銘柄操作 =====
async function addStock(code) {
  code = code.trim();
  if (!code) return;
  if (state.stocks.find(s => s.code === code)) {
    setStatus(`${code} は既に追加済み`, true);
    return;
  }
  setStatus(`${code} 取得中...`, false);
  try {
    const data = await invoke("fetch_stock_cmd", { code });
    const nameCache = getNameCache();
    if (data.nameJa && !nameCache[code]) {
      nameCache[code] = data.nameJa;
      saveNameCache(nameCache);
    }
    state.stocks.push(data);
    saveStockCodes();
    render();
    setStatus(`${code} 追加完了`, false);
  } catch (e) {
    setStatus(`${code} の取得に失敗: ${e}`, true);
  }
}

function removeStock(code) {
  state.stocks = state.stocks.filter(s => s.code !== code);
  saveStockCodes();
  render();
}

// ===== イベント =====
addBtn.addEventListener("click", async () => {
  const code = stockCodeInput.value.trim();
  if (!code) return;
  stockCodeInput.value = "";
  await addStock(code);
});
stockCodeInput.addEventListener("keydown", e => { if (e.key === "Enter") addBtn.click(); });

// ===== 初期化 =====
async function init() {
  const savedCodes = loadStockCodes();
  const codes = savedCodes || DEFAULT_STOCKS;
  for (const code of codes) {
    // 進捗はイベントで表示されるので、ここでは最小限に
    try {
      const data = await invoke("fetch_stock_cmd", { code });
      const nameCache = getNameCache();
      if (data.nameJa && !nameCache[code]) {
        nameCache[code] = data.nameJa;
        saveNameCache(nameCache);
      }
      state.stocks.push(data);
    } catch (e) { setStatus(`${code} 失敗: ${e}`, true); }
  }
  saveStockCodes();
  render();
  setStatus(state.stocks.length > 0 ? "完了" : "取得できませんでした", state.stocks.length === 0);
}

// ===== 定期更新（30秒） =====
setInterval(async () => {
  if (state.stocks.length === 0) return;
  for (const stock of state.stocks) {
    try {
      const data = await invoke("fetch_stock_cmd", { code: stock.code });
      const prevNameJa = stock.nameJa;
      Object.assign(stock, data);
      if (!stock.nameJa && prevNameJa) stock.nameJa = prevNameJa;
    } catch (_) {}
  }
  render();
}, 30000);

// ===== 進捗イベント =====
listen("stock-progress", (e) => {
  const { code, step } = e.payload;
  setStatus(`${code}: ${step}`, false);
});

// ===== 起動 =====
init();
