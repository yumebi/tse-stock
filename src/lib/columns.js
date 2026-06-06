import { state } from "./state.js";
import { ALL_COLS } from "./constants.js";

// ===== 列の表示制御 =====
export function visibleCols() {
  const orderMap = new Map(state.colOrder.map((k, i) => [k, i]));
  const result = [];
  for (const col of ALL_COLS) {
    if (!col.movable) { result.push(col); continue; }
    if (col.toggle && state.hiddenToggles.has(col.toggle)) continue;
    result.push(col);
  }
  result.sort((a, b) => {
    if (!a.movable && !b.movable) return 0;
    if (!a.movable) return 1;   // non-movable（reorder/del）は末尾へ
    if (!b.movable) return -1;
    return (orderMap.get(a.k) ?? 999) - (orderMap.get(b.k) ?? 999);
  });
  return result.map(c => state.colWidths[c.k] ? { ...c, w: state.colWidths[c.k] + "px" } : c);
}

export function getGroupOrder() {
  const seen = new Set();
  const result = [];
  for (const k of state.colOrder) {
    const col = ALL_COLS.find(c => c.k === k && c.movable);
    if (col?.toggle && !seen.has(col.toggle)) { seen.add(col.toggle); result.push(col.toggle); }
  }
  return result;
}

export function moveGroup(toggleKey, dir, saveColStateFn, renderFn, renderColPanelFn) {
  const groupOrder = getGroupOrder();
  const idx = groupOrder.indexOf(toggleKey);
  if (idx === -1) return;
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= groupOrder.length) return;
  const keyA = toggleKey, keyB = groupOrder[swapIdx];
  const keysA = state.colOrder.filter(k => ALL_COLS.find(c => c.k === k)?.toggle === keyA);
  const keysB = state.colOrder.filter(k => ALL_COLS.find(c => c.k === k)?.toggle === keyB);
  const posA = keysA.map(k => state.colOrder.indexOf(k)).sort((a, b) => a - b);
  const posB = keysB.map(k => state.colOrder.indexOf(k)).sort((a, b) => a - b);
  const allPos = [...posA, ...posB].sort((a, b) => a - b);
  const newKeys = dir < 0 ? [...keysA, ...keysB] : [...keysB, ...keysA];
  const newOrder = [...state.colOrder];
  allPos.forEach((pos, i) => { newOrder[pos] = newKeys[i]; });
  state.colOrder = newOrder;
  saveColStateFn(); renderFn(); renderColPanelFn();
}
