import { state } from "./state.js";
import { visibleCols } from "./columns.js";

let _tableHeader = null;
let _stockList = null;

export function initSticky(tableHeader, stockList) {
  _tableHeader = tableHeader;
  _stockList = stockList;
}

// ===== 列固定（スティッキー） =====
export let _stickyRaf = null;

export function applySticky() {
  // まず全セルのスティッキーをリセット
  const clearEl = el => {
    el.classList.remove("pinned-cell", "pinned-last");
    el.style.position = "";
    el.style.left = "";
    el.style.zIndex = "";
  };
  [..._tableHeader.children].forEach(clearEl);
  _stockList.querySelectorAll(".stock-row > *").forEach(clearEl);

  if (!state.pinCols) return;

  // レイアウト確定後（次フレーム）に getBoundingClientRect() で正確な位置を取得する
  if (_stickyRaf) cancelAnimationFrame(_stickyRaf);
  _stickyRaf = requestAnimationFrame(() => {
    _stickyRaf = null;
    if (!state.pinCols) return;

    const pinnedSet = new Set(["code", "name"]);
    const cols = visibleCols();
    const headerCells = [..._tableHeader.children];

    // 浮動小数点のまま累積して端数丸め誤差による隙間をなくす
    let accumLeft = 0;
    let lastPinnedIdx = -1;
    cols.forEach((col, idx) => {
      if (!pinnedSet.has(col.k)) return;
      const hCell = headerCells[idx];
      if (!hCell) return;

      const left = accumLeft;
      accumLeft += hCell.getBoundingClientRect().width;
      lastPinnedIdx = idx;

      hCell.style.position = "sticky";
      hCell.style.left = left + "px";
      hCell.style.zIndex = "15";
      hCell.classList.add("pinned-cell");

      _stockList.querySelectorAll(".stock-row").forEach(row => {
        const cell = row.children[idx];
        if (!cell) return;
        cell.style.position = "sticky";
        cell.style.left = left + "px";
        cell.style.zIndex = "5";
        cell.classList.add("pinned-cell");
      });
    });

    // 最後のピン列に区切り線クラスを付与
    if (lastPinnedIdx >= 0) {
      const lh = headerCells[lastPinnedIdx];
      if (lh) lh.classList.add("pinned-last");
      _stockList.querySelectorAll(".stock-row").forEach(row => {
        const lc = row.children[lastPinnedIdx];
        if (lc) lc.classList.add("pinned-last");
      });
    }
  });
}

// ===== 列の自動幅（シグナル列以外） =====
export let _nameAutoSizeRaf = null;
let _measureCanvas = null;
function measureTextWidth(text, font) {
  if (!text) return 0;
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}

const AUTOSIZE_SKIP = new Set(["reorder", "del", "signals"]);
const AUTOSIZE_MAX = { name: 320 };

function measureCellWidth(cell, rowKeys) {
  if (!rowKeys) {
    const ja = cell.querySelector(".ja");
    const target = ja || cell;
    return measureTextWidth(target.textContent, getComputedStyle(target).font);
  }
  // 3行モードのグループセル: signals以外の子要素のうち最大幅を採用
  let maxW = 0;
  const children = [...cell.querySelectorAll(".g3-cell > *")];
  children.forEach((child, i) => {
    if (rowKeys[i] === "signals") return;
    const ja = child.querySelector(".ja");
    const target = ja || child;
    const w = measureTextWidth(target.textContent, getComputedStyle(target).font);
    if (w > maxW) maxW = w;
  });
  return maxW;
}

export function autoSizeColumns(tableHeader, stockList, saveColWidths, visibleColsFn, applyStickyFn) {
  const cols = visibleColsFn();
  const rows = [...stockList.querySelectorAll(".stock-row")];
  if (rows.length === 0) return;
  let changed = false;

  cols.forEach((col, idx) => {
    if (AUTOSIZE_SKIP.has(col.k)) return;
    if (col.rows && col.rows.includes("signals")) return;
    let maxW = 40;
    rows.forEach(r => {
      const cell = r.children[idx];
      if (!cell) return;
      const w = measureCellWidth(cell, col.rows);
      if (w > maxW) maxW = w;
    });
    const cap = AUTOSIZE_MAX[col.k] ?? 400;
    const newW = Math.min(Math.ceil(maxW) + 28, cap);
    if (state.colWidths[col.k] !== newW) { state.colWidths[col.k] = newW; changed = true; }
  });

  if (!changed) return;
  saveColWidths();
  const tpl = visibleColsFn().map(c => c.w).join(" ");
  tableHeader.style.gridTemplateColumns = tpl;
  stockList.querySelectorAll(".stock-row").forEach(r => { r.style.gridTemplateColumns = tpl; });
  applyStickyFn();
}

export function scheduleColumnsAutoSize(tableHeader, stockList, saveColWidths, visibleColsFn, applyStickyFn) {
  if (_nameAutoSizeRaf) cancelAnimationFrame(_nameAutoSizeRaf);
  _nameAutoSizeRaf = requestAnimationFrame(() => {
    _nameAutoSizeRaf = null;
    autoSizeColumns(tableHeader, stockList, saveColWidths, visibleColsFn, applyStickyFn);
  });
}
