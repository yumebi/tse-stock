// ドラッグでの並べ替え(Pointer Events)。一覧の行を、取っ手でつかんで上下に動かす。
// HTML5 の Drag and Drop は使わない(OS のドラッグ処理を通らず、挙動が安定するため)。

// ids の中の id を、targetId の前(after=false)または後ろ(after=true)へ動かした並びを返す。
export function moveId(ids, id, targetId, after) {
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(targetId);
  if (at < 0 || !ids.includes(id)) return ids.slice();
  rest.splice(at + (after ? 1 : 0), 0, id);
  return rest;
}

function findScroller(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement || document.documentElement;
}

// container 内の itemSelector の行を、handleSelector の取っ手でドラッグして並べ替える。
//   getId(item)        行から ID を取り出す
//   canStart()         false なら、ドラッグを始めない(省略可)
//   onStart / onEnd    ドラッグの開始・終了(描き直しの保留などに使う。省略可)
//   onDrop(ids)        並びが変わったときだけ、新しい ID の並びで呼ばれる
export function enableDragReorder({ container, itemSelector, handleSelector, getId, canStart, onStart, onEnd, onDrop }) {
  let st = null;
  let raf = 0;
  let lastY = 0;

  const items = () => [...container.querySelectorAll(itemSelector)];
  const clearMarks = () =>
    container.querySelectorAll(".drop-before,.drop-after").forEach((e) => e.classList.remove("drop-before", "drop-after"));

  function locate(y) {
    const others = items().filter((e) => e !== st.item);
    let target = null;
    let after = false;
    for (const e of others) {
      const r = e.getBoundingClientRect();
      if (y >= r.top && y < r.bottom) { target = e; after = y > r.top + r.height / 2; break; }
    }
    if (!target && others.length) {
      // 一覧の外(最初の行より上、最後の行より下)にいるときは、端に付ける
      if (y < others[0].getBoundingClientRect().top) { target = others[0]; after = false; }
      else if (y >= others[others.length - 1].getBoundingClientRect().bottom) { target = others[others.length - 1]; after = true; }
    }
    return { target, after };
  }

  function update(y) {
    const { target, after } = locate(y);
    clearMarks();
    if (target) target.classList.add(after ? "drop-after" : "drop-before");
    st.target = target;
    st.after = after;
  }

  // 一覧の端の近くでは、自動でスクロールする(長い一覧の端まで動かせるように)
  function autoScroll() {
    raf = 0;
    if (!st) return;
    const sc = st.scroller;
    const isDoc = sc === document.scrollingElement || sc === document.documentElement;
    const top = isDoc ? 0 : sc.getBoundingClientRect().top;
    const bottom = isDoc ? window.innerHeight : sc.getBoundingClientRect().bottom;
    const zone = 40;
    let dy = 0;
    if (lastY < top + zone) dy = -Math.ceil((top + zone - lastY) / 4);
    else if (lastY > bottom - zone) dy = Math.ceil((lastY - (bottom - zone)) / 4);
    if (!dy) return;
    if (isDoc) window.scrollBy(0, dy); else sc.scrollTop += dy;
    update(lastY);
    raf = requestAnimationFrame(autoScroll);
  }

  container.addEventListener("pointerdown", (ev) => {
    if (st || ev.button !== 0) return;
    const handle = ev.target.closest(handleSelector);
    if (!handle || !container.contains(handle) || handle.classList.contains("disabled")) return;
    if (canStart && !canStart()) return;
    const item = handle.closest(itemSelector);
    if (!item) return;
    ev.preventDefault();
    ev.stopPropagation();
    handle.setPointerCapture(ev.pointerId);
    st = { item, handle, pointerId: ev.pointerId, id: getId(item), target: null, after: false, scroller: findScroller(item) };
    lastY = ev.clientY;
    item.classList.add("dragging");
    if (onStart) onStart();
  });

  container.addEventListener("pointermove", (ev) => {
    if (!st || ev.pointerId !== st.pointerId) return;
    lastY = ev.clientY;
    update(ev.clientY);
    if (!raf) raf = requestAnimationFrame(autoScroll);
  });

  function finish(ev, cancelled) {
    const s = st;
    if (!s || ev.pointerId !== s.pointerId) return;
    st = null;
    cancelAnimationFrame(raf);
    raf = 0;
    s.item.classList.remove("dragging");
    clearMarks();
    try { s.handle.releasePointerCapture(s.pointerId); } catch { /* すでに外れている */ }
    if (!cancelled && s.target) {
      const current = items().map(getId);
      const next = moveId(current, s.id, getId(s.target), s.after);
      if (next.join("\n") !== current.join("\n")) onDrop(next);
    }
    if (onEnd) onEnd();
  }
  container.addEventListener("pointerup", (ev) => finish(ev, false));
  container.addEventListener("pointercancel", (ev) => finish(ev, true));

  // 取っ手のクリックは、行のクリック(チャートを開く、など)に伝えない。
  // ドラッグを終えた直後にも click が来るので、取っ手の上の click は、すべてここで止める。
  container.addEventListener("click", (ev) => {
    if (ev.target.closest && ev.target.closest(handleSelector)) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  }, true);
}
