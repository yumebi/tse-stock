import { state } from "./state.js";

let _tabsEl = null;
let _render = null;
let _saveAll = null;

export let _lastTabClick = { idx: -1, time: 0 };

export function initTabs(tabsEl, renderFn, saveAllFn) {
  _tabsEl = tabsEl;
  _render = renderFn;
  _saveAll = saveAllFn;
}

export function startTabRename(b, idx) {
  const nameEl = b.querySelector(".tab-name");
  if (!nameEl) return;
  const input = document.createElement("input");
  input.className = "tab-rename-input";
  input.value = state.tabs[idx].name;
  input.style.width = Math.max(input.value.length * 9 + 16, 50) + "px";
  nameEl.replaceWith(input);
  input.focus(); input.select();
  const commit = () => { const v = input.value.trim() || state.tabs[idx].name; state.tabs[idx].name = v; _saveAll(); renderTabs(); };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
    if (ev.key === "Escape") { input.value = state.tabs[idx].name; input.blur(); }
  });
}

export function renderTabs() {
  _tabsEl.innerHTML = state.tabs.map((t, i) =>
    `<button class="tab-btn${i === state.activeTabIdx ? " active" : ""}" data-idx="${i}"><span class="tab-name">${t.name}</span>${state.tabs.length > 1 ? `<span class="tab-del" data-idx="${i}">×</span>` : ""}</button>`
  ).join("");
  _tabsEl.querySelectorAll(".tab-btn").forEach(b => {
    b.addEventListener("click", e => {
      if (e.target.classList.contains("tab-del")) { deleteTab(parseInt(e.target.dataset.idx)); return; }
      const idx = parseInt(b.dataset.idx);
      const now = Date.now();
      const isDbl = _lastTabClick.idx === idx && (now - _lastTabClick.time) < 400;
      _lastTabClick = { idx, time: now };
      if (isDbl) { startTabRename(b, idx); }
      else { if (idx !== state.activeTabIdx) switchTab(idx); }
    });
  });
}

export function switchTab(idx) { state.activeTabIdx = idx; state.sortKey = null; state.sortAsc = true; _saveAll(); renderTabs(); _render(); }
export function addTab() { const name = `リスト${state.tabs.length + 1}`; state.tabs.push({ name, stocks: [] }); state.activeTabIdx = state.tabs.length - 1; _saveAll(); renderTabs(); _render(); }
export function deleteTab(idx) { if (state.tabs.length <= 1) return; state.tabs.splice(idx, 1); if (state.activeTabIdx >= state.tabs.length) state.activeTabIdx = state.tabs.length - 1; _saveAll(); renderTabs(); _render(); }
