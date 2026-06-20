import { state, priceFlash, stocks, getNameCache } from "./state.js";
import { SORT_KEYS, SPARK_LABELS, SIG_PAUSE_MS } from "./constants.js";
import { visibleCols, visibleCols3 } from "./columns.js";
import { scoreSignals, scoreClass, scoreText, filterSigs, sparkline, getSparkData, volClass, gradClass, fmt, fmtPct, fmtOpt } from "./indicators.js";
import { applySticky } from "./sticky.js";

let _tableHeader = null;
let _stockList = null;

// 外部API/スクレイピング由来の文字列（企業名等）をHTMLに埋め込む前にエスケープ
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function initRender(tableHeader, stockList) {
  _tableHeader = tableHeader;
  _stockList = stockList;
}

const _rowHashes = new Map();
let _layoutKey = "";

let _setStatus = null;
let _sortArr = null;

export function initRenderHelpers(setStatusFn, sortArrFn) {
  _setStatus = setStatusFn;
  _sortArr = sortArrFn;
}

// ===== シグナルスクロール =====
export function updateSigScroll(elapsed = {}, savedAt = performance.now(), onlyCodes = null) {
  const extraMs = performance.now() - savedAt;
  _stockList.querySelectorAll(".stock-row .sig-inner[data-sig-text]").forEach(inner => {
    const code = inner.closest(".stock-row")?.dataset.code || "";
    if (onlyCodes !== null && !onlyCodes.has(code)) return;
    let t = elapsed[code];
    if (t == null) { const cur = inner.getAnimations?.()[0]; if (cur?.currentTime != null) t = cur.currentTime; }
    inner.getAnimations?.().forEach(a => a.cancel());
    const cell = inner.closest(".cell-sig");
    if (!cell) return;
    const text = inner.dataset.sigText;
    inner.textContent = text;
    const cellWidth = cell.clientWidth;
    if (!cellWidth) return;
    const textWidth = inner.scrollWidth;
    if (textWidth <= cellWidth) return;
    inner.textContent = text + " ⏺ " + text;
    const scrollPx = inner.scrollWidth - textWidth;
    const scrollMs = Math.max(6000, (textWidth / 60) * 1000);
    const totalMs = scrollMs + SIG_PAUSE_MS;
    const pf = SIG_PAUSE_MS / totalMs;
    const anim = inner.animate(
      [
        { transform: "translateX(0)",              offset: 0,  easing: "linear" },
        { transform: "translateX(0)",              offset: pf, easing: "linear" },
        { transform: `translateX(-${scrollPx}px)`, offset: 1 },
      ],
      { duration: totalMs, iterations: Infinity }
    );
    anim.currentTime = t != null ? (t + extraMs) % totalMs : 0;
  });
}

// ===== セル生成 =====
export function renderCell(s, k, fl, rowOpts = {}) {
  const up = s.change >= 0, rsiC = s.rsi != null ? (s.rsi > 70 ? "over" : s.rsi < 30 ? "under" : "") : "";
  switch (k) {
    case "reorder": return `<span class="cell-reorder"><button class="reorder-btn up" data-code="${s.code}"${rowOpts.isFirst ? " disabled" : ""}>▲</button><button class="reorder-btn down" data-code="${s.code}"${rowOpts.isLast ? " disabled" : ""}>▼</button></span>`;
    case "code": return `<span class="cell-code" title="右クリックで行カラー設定">${s.code}</span>`;
    case "name": {
      const nc = getNameCache(); const nJ = nc[s.code] || s.nameJa;
      const nJEsc = nJ ? escapeHtml(nJ) : "";
      const nameEsc = escapeHtml(s.name);
      const nm = nJ ? `<span class="ja">${nJEsc}</span><span class="en">${nameEsc}</span>` : nameEsc;
      return `<span class="cell-name" title="${nJEsc || nameEsc}">${nm}</span>`;
    }
    case "price": {
      const dirCls = state.priceDirs[s.code] ? ` dir-${state.priceDirs[s.code]}` : "";
      const al = state.alerts[s.code];
      const alActive = al && (al.hi != null || al.lo != null) ? " alert-active" : "";
      return `<span class="cell-price ${fl}${dirCls}${alActive}">¥${fmt(s.price)}</span>`;
    }
    case "spark": return `<span class="cell-spark">${sparkline(getSparkData(s))}</span>`;
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
    case "signals": { const fs = filterSigs(s.signals); const text = fs.length ? fs.join(" ⏺ ") : ""; return `<span class="cell-sig">${text ? `<span class="sig-inner" data-sig-text="${text.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${text}</span>` : ""}</span>`; }
    case "creditRatio": {
      if (s.creditRatio == null) return `<span class="cell-credit">-</span>`;
      const cls = s.creditRatio >= 5 ? "ratio-high" : s.creditRatio <= 0.5 ? "ratio-low" : "";
      return `<span class="cell-credit ${cls}" title="信用倍率: ${s.creditRatio}倍">${s.creditRatio.toFixed(2)}倍</span>`;
    }
    case "marginBuy": {
      if (s.marginBuy == null) return `<span class="cell-credit">-</span>`;
      return `<span class="cell-credit" title="信用買い残: ${s.marginBuy}万株">${s.marginBuy.toFixed(1)}万</span>`;
    }
    case "marginSell": {
      if (s.marginSell == null) return `<span class="cell-credit">-</span>`;
      return `<span class="cell-credit" title="信用売り残: ${s.marginSell}万株">${s.marginSell.toFixed(1)}万</span>`;
    }
    case "per": return s.per == null ? `<span class="cell-credit">-</span>` : `<span class="cell-credit" title="PER: ${s.per}倍">${s.per.toFixed(1)}倍</span>`;
    case "pbr": return s.pbr == null ? `<span class="cell-credit">-</span>` : `<span class="cell-credit" title="PBR: ${s.pbr}倍">${s.pbr.toFixed(2)}倍</span>`;
    case "dividendYield": return s.dividendYield == null ? `<span class="cell-credit">-</span>` : `<span class="cell-credit" title="配当利回り: ${s.dividendYield}%">${s.dividendYield.toFixed(2)}%</span>`;
    case "earningsDate": {
      if (!s.earningsDate) return `<span class="cell-credit">-</span>`;
      const days = Math.ceil((new Date(s.earningsDate) - new Date()) / 86400000);
      const cls = days <= 0 ? "earnings-today" : days <= 3 ? "earnings-near" : days <= 7 ? "earnings-soon" : "";
      const countText = days >= 0 && days <= 30 ? ` (${days}日)` : "";
      return `<span class="cell-earnings ${cls}" title="決算発表予定: ${s.earningsDate}">${s.earningsDate}${countText}</span>`;
    }
    case "w52hi": {
      if (!s.week52High || !s.price) return `<span class="cell-w52">-</span>`;
      const dev = ((s.price / s.week52High) - 1) * 100;
      const cls = dev >= -5 ? "w52-near" : dev >= -25 ? "w52-mid" : "w52-far";
      return `<span class="cell-w52 ${cls}" title="52週高値: ¥${s.week52High.toLocaleString()}">${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%</span>`;
    }
    case "w52lo": {
      if (!s.week52Low || !s.price) return `<span class="cell-w52">-</span>`;
      const dev = ((s.price / s.week52Low) - 1) * 100;
      const cls = dev <= 20 ? "w52-low-near" : dev <= 80 ? "w52-low-mid" : "w52-low-high";
      return `<span class="cell-w52 ${cls}" title="52週安値: ¥${s.week52Low.toLocaleString()}">+${dev.toFixed(1)}%</span>`;
    }
    case "pnl": {
      const pf = state.portfolio[s.code];
      if (!pf || !pf.cost || !pf.qty || !s.price) {
        return `<span class="cell-pnl" data-code="${s.code}"><span class="pnl-empty">💼</span></span>`;
      }
      const pnl = (s.price - pf.cost) * pf.qty;
      const pnlPct = ((s.price - pf.cost) / pf.cost) * 100;
      const cls = pnl >= 0 ? "up" : "down";
      return `<span class="cell-pnl has-pf ${cls}" data-code="${s.code}">
        <span class="pnl-amount">${pnl >= 0 ? "+" : ""}¥${Math.round(pnl).toLocaleString()}</span>
        <span class="pnl-pct">${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%</span>
      </span>`;
    }
    case "alert": {
      const al = state.alerts[s.code] || {};
      const parts = [];
      if (al.hi != null) parts.push(`<span class="al-hi">↑${al.hi.toLocaleString()}</span>`);
      if (al.lo != null) parts.push(`<span class="al-lo">↓${al.lo.toLocaleString()}</span>`);
      return `<span class="cell-alert${parts.length ? " has-alert" : ""}" data-code="${s.code}">${parts.length ? parts.join("") : '<span class="al-empty">🔔</span>'}</span>`;
    }
    case "note": {
      const note = state.notes[s.code];
      return `<span class="cell-note${note ? " has-note" : ""}" data-code="${s.code}" title="${note ? note.replace(/"/g, "&quot;") : ""}">${note ? "📝" : "📋"}</span>`;
    }
    case "del": return `<span class="cell-del"><button class="del-btn" data-code="${s.code}">×</button></span>`;
  }
  return "";
}

// ===== 3行表示モード: グループ列セル =====
function renderGroupCell(s, rows, fl, rowOpts) {
  const parts = rows.map(k => renderCell(s, k, fl, rowOpts)).filter(Boolean);
  return `<div class="g3-cell">${parts.join("")}</div>`;
}

// ===== 差分レンダリング =====
function computeLayoutKey(gridTpl) {
  return [gridTpl, state.density, state.sparkPeriod, state.pinCols, state.rowMode, JSON.stringify(state.sigCats)].join("|");
}

function computeRowHash(s, fl, isFirst, isLast) {
  const pf = state.portfolio[s.code];
  const al = state.alerts[s.code];
  return [
    s.price, s.change, s.changePercent,
    s.high, s.highTime, s.low, s.lowTime,
    s.open, s.prevClose, s.volume,
    s.ma5, s.ma25, s.ma75, s.macd, s.macdSignal, s.rsi,
    s.week52High, s.week52Low, s.signals?.join("|"),
    state.priceDirs[s.code], fl,
    pf?.cost, pf?.qty, al?.hi, al?.lo, state.notes[s.code], state.rowColors[s.code],
    isFirst, isLast,
  ].join("|");
}

export function render() {
  const stks = stocks();
  if (stks.length === 0) {
    _stockList.innerHTML = `<div class="empty-state">銘柄がありません。上の入力欄からコードを追加してください。</div>`;
    _tableHeader.style.gridTemplateColumns = "";
    _rowHashes.clear(); _layoutKey = "";
    return;
  }

  const is3Row = state.rowMode === "3row";
  const cols = is3Row ? visibleCols3() : visibleCols();
  const gridTpl = cols.map(c => c.w).join(" ");
  _tableHeader.style.gridTemplateColumns = gridTpl;
  _tableHeader.classList.toggle("row-mode-3", is3Row);
  _stockList.classList.toggle("row-mode-3", is3Row);

  // ヘッダー常時再構築（軽量）
  _tableHeader.innerHTML = cols.map(c => {
    const colCls = `col-${c.k}`;
    const sortable = !c.rows && SORT_KEYS[colCls] ? " sortable" : "";
    const lbl = c.k === "spark" ? (SPARK_LABELS[state.sparkPeriod] || "5日") : c.label;
    return `<span class="${colCls}${sortable}" data-col="${c.k}">${lbl}</span>`;
  }).join("");

  // ソートインジケーター
  _tableHeader.querySelectorAll("span").forEach(s => s.classList.remove("sort-asc", "sort-desc"));
  if (state.sortKey) {
    for (const [cls, sk] of Object.entries(SORT_KEYS)) {
      if (sk.key === state.sortKey) {
        const sp = _tableHeader.querySelector(`.${cls}`);
        if (sp) sp.classList.add(state.sortAsc ? "sort-asc" : "sort-desc");
        break;
      }
    }
  }

  // レイアウト変更時は全行再描画
  const newLayoutKey = computeLayoutKey(gridTpl);
  if (newLayoutKey !== _layoutKey) {
    _layoutKey = newLayoutKey;
    _rowHashes.clear();
  }

  // フィルタ・ソート
  let sorted = _sortArr(stks);
  if (state.signalFilter !== "all") {
    sorted = sorted.filter(s => {
      const { buy, sell } = scoreSignals(s.signals);
      if (state.signalFilter === "buy") return buy > sell;
      if (state.signalFilter === "sell") return sell > buy;
      return true;
    });
  }

  // 既存DOMの行マップを構築
  const existingRows = new Map();
  for (const row of [..._stockList.children]) {
    if (row.dataset?.code) existingRows.set(row.dataset.code, row);
  }

  // 変更行のアニメ時刻を保存（変更行のみ）
  const sigElapsed = {};
  const sigSavedAt = performance.now();
  const updatedCodes = new Set();

  // 新しい行リストを構築（差分更新）
  const newRowEls = [];
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const fl = priceFlash[s.code] ? "flash-" + priceFlash[s.code] : "";
    const rowOpts = { isFirst: i === 0, isLast: i === sorted.length - 1 };
    const h = computeRowHash(s, fl, rowOpts.isFirst, rowOpts.isLast);

    let row = existingRows.get(s.code);
    const needsUpdate = !row || _rowHashes.get(s.code) !== h;

    if (needsUpdate) {
      if (row) {
        const inner = row.querySelector(".sig-inner");
        const anim = inner?.getAnimations?.()[0];
        if (anim?.currentTime != null) sigElapsed[s.code] = anim.currentTime;
      }
      if (!row) {
        row = document.createElement("div");
        row.className = "stock-row";
        row.dataset.code = s.code;
      }
      row.style.gridTemplateColumns = gridTpl;
      row.style.borderLeft = state.rowColors[s.code] ? `3px solid ${state.rowColors[s.code]}` : "";
      row.innerHTML = cols.map(c => c.rows ? renderGroupCell(s, c.rows, fl, rowOpts) : renderCell(s, c.k, fl, rowOpts)).join("");
      _rowHashes.set(s.code, h);
      updatedCodes.add(s.code);
    }

    newRowEls.push(row);
    existingRows.delete(s.code);
  }

  // 不要行を削除
  for (const row of existingRows.values()) {
    row.remove();
    _rowHashes.delete(row.dataset.code);
  }

  // DOM順序を正しく並べ直す（最小限の移動）
  for (let i = 0; i < newRowEls.length; i++) {
    const current = _stockList.children[i];
    if (current !== newRowEls[i]) _stockList.insertBefore(newRowEls[i], current || null);
  }

  // 変更行のシグナルアニメのみ更新（未変更行は自然に継続）
  updateSigScroll(sigElapsed, sigSavedAt, updatedCodes);
  for (const c of Object.keys(priceFlash)) delete priceFlash[c];

  applySticky();
  if (state.signalFilter !== "all" && _setStatus) {
    _setStatus(`フィルタ中: ${sorted.length}/${stks.length}件`, false);
  }
}
