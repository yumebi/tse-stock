import { MOVABLE_KEYS, NEW_MOVABLE_KEYS, SIG_CATEGORIES } from "./constants.js";

// ===== 状態 =====
export const state = {
  tabs: [], activeTabIdx: 0, sortKey: null, sortAsc: true, paused: false, prevSignals: {},
  hiddenToggles: new Set(JSON.parse(localStorage.getItem("tse-stock-hide") || '["w52","pnl"]')),
  colOrder: JSON.parse(localStorage.getItem("tse-stock-col-order") || JSON.stringify(MOVABLE_KEYS)),
  colWidths: JSON.parse(localStorage.getItem("tse-stock-col-widths") || "{}"),
  interval: parseInt(localStorage.getItem("tse-stock-interval") || "30"),
  alerts: JSON.parse(localStorage.getItem("tse-stock-alerts") || "{}"),
  notes: JSON.parse(localStorage.getItem("tse-stock-notes") || "{}"),
  portfolio: JSON.parse(localStorage.getItem("tse-stock-portfolio") || "{}"),
  priceDirs: {},
  density: localStorage.getItem("tse-stock-density") || "normal",
  signalFilter: localStorage.getItem("tse-stock-filter") || "all",
  sparkPeriod: (() => { const s = localStorage.getItem("tse-stock-spark") || "1mo"; return ["1d","3d","1mo","3mo","6mo","1y"].includes(s) ? s : "1mo"; })(),
  pinCols: localStorage.getItem("tse-stock-pin") !== "false",
  sigCats: (() => {
    const saved = JSON.parse(localStorage.getItem("tse-stock-sig-cats") || "null");
    const defaults = Object.fromEntries(SIG_CATEGORIES.map(c => [c.key, true]));
    return saved ? { ...defaults, ...saved } : defaults;
  })(),
};

// colOrder に新列が含まれていない場合は末尾に追加
NEW_MOVABLE_KEYS.forEach(k => { if (!state.colOrder.includes(k)) state.colOrder.push(k); });

export const priceFlash = {};

export function saveAll() { localStorage.setItem("tse-stock-tabs", JSON.stringify(state.tabs.map(t => ({ name: t.name, codes: t.stocks.map(s => s.code) })))); localStorage.setItem("tse-stock-active", state.activeTabIdx); }
export function loadAll() { try { const r = localStorage.getItem("tse-stock-tabs"); if (r) { const td = JSON.parse(r); if (Array.isArray(td) && td.length > 0) return td; } } catch (_) {} return [{ name: "デイトレ", codes: ["7203", "8306", "9984"] }, { name: "長期", codes: [] }]; }
export function saveColState() {
  localStorage.setItem("tse-stock-hide", JSON.stringify([...state.hiddenToggles]));
  localStorage.setItem("tse-stock-col-order", JSON.stringify(state.colOrder));
}
export function saveColWidths()  { localStorage.setItem("tse-stock-col-widths", JSON.stringify(state.colWidths)); }
export function saveAlerts()     { localStorage.setItem("tse-stock-alerts", JSON.stringify(state.alerts)); }
export function saveNotes()      { localStorage.setItem("tse-stock-notes", JSON.stringify(state.notes)); }
export function savePortfolio()  { localStorage.setItem("tse-stock-portfolio", JSON.stringify(state.portfolio)); }
export function saveSigCats()    { localStorage.setItem("tse-stock-sig-cats", JSON.stringify(state.sigCats)); }

const NAME_CACHE_KEY = "tse-stock-names";
export function getNameCache() { try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || "{}"); } catch (_) { return {}; } }
export function saveNameCache(c) { localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(c)); }

export function stocks()       { return state.tabs[state.activeTabIdx]?.stocks || []; }
export function setStocks(arr) { if (state.tabs[state.activeTabIdx]) state.tabs[state.activeTabIdx].stocks = arr; }

export const hash = ss => (ss || []).join("|") || "_empty";
export function detectSignalChange(code, ns) { const oh = state.prevSignals[code] || "_init", nh = hash(ns); if (oh === "_init") { state.prevSignals[code] = nh; return null; } if (oh === nh) return null; state.prevSignals[code] = nh; return ns.some(s => s.includes("買い") || s.includes("GC") || s.includes("上抜")) ? "buy" : "sell"; }
