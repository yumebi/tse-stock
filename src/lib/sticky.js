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

// ===== 企業名列の自動幅 =====
export let _nameAutoSizeRaf = null;

export function autoSizeNameColumn(tableHeader, stockList, saveColWidths, visibleColsFn, applyStickyFn) {
  const cells = [...stockList.querySelectorAll(".stock-row .cell-name")];
  if (cells.length === 0) return;
  let maxW = 80;
  cells.forEach(c => { if (c.scrollWidth > maxW) maxW = c.scrollWidth; });
  const newW = Math.min(maxW + 10, 320);
  if (state.colWidths["name"] === newW) return;
  state.colWidths["name"] = newW;
  saveColWidths();
  const tpl = visibleColsFn().map(c => c.w).join(" ");
  tableHeader.style.gridTemplateColumns = tpl;
  stockList.querySelectorAll(".stock-row").forEach(r => { r.style.gridTemplateColumns = tpl; });
  applyStickyFn();
}

export function scheduleNameAutoSize(tableHeader, stockList, saveColWidths, visibleColsFn, applyStickyFn) {
  if (_nameAutoSizeRaf) cancelAnimationFrame(_nameAutoSizeRaf);
  _nameAutoSizeRaf = requestAnimationFrame(() => {
    _nameAutoSizeRaf = null;
    autoSizeNameColumn(tableHeader, stockList, saveColWidths, visibleColsFn, applyStickyFn);
  });
}
