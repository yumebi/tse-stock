// ウインドウ位置の復元に使う純粋関数。単位はすべて物理ピクセル。

// タイトルバー付近でつかめるとみなす、画面内に見えている最小の領域。
const GRAB_WIDTH = 160;
const GRAB_HEIGHT = 40;

function overlapArea(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * 保存しておいたウインドウ位置を、現在のモニタ構成に合わせて補正する。
 * モニタの取り外しや解像度の変更で、そのまま復元すると画面外に出て操作できなくなるのを防ぐ。
 *
 * - 大きさは、全モニタを含む範囲を超えないようにし、最小サイズ未満にもしない
 * - タイトルバー付近がつかめる程度に見えていれば、モニタをまたぐ配置も含めてそのまま使う
 * - つかめない場合は、重なりが最も大きい(無ければ最も近い)モニタの中へ移す
 *
 * @param {{x:number,y:number,width:number,height:number}} saved 外形(枠を含む)
 * @param {{x:number,y:number,width:number,height:number}[]} workAreas 各モニタの作業領域
 * @returns 補正後の外形。workAreas が空ならそのまま返す
 */
export function fitBounds(saved, workAreas, { minWidth = 0, minHeight = 0 } = {}) {
  if (!workAreas || workAreas.length === 0) return { ...saved };

  const left = Math.min(...workAreas.map((a) => a.x));
  const top = Math.min(...workAreas.map((a) => a.y));
  const right = Math.max(...workAreas.map((a) => a.x + a.width));
  const bottom = Math.max(...workAreas.map((a) => a.y + a.height));
  const maxWidth = right - left;
  const maxHeight = bottom - top;

  const width = clamp(saved.width, Math.min(minWidth, maxWidth), maxWidth);
  const height = clamp(saved.height, Math.min(minHeight, maxHeight), maxHeight);
  const rect = { x: saved.x, y: saved.y, width, height };

  const strip = { x: rect.x, y: rect.y, width: rect.width, height: Math.min(GRAB_HEIGHT, rect.height) };
  const need = Math.min(GRAB_WIDTH, rect.width) * Math.min(GRAB_HEIGHT, rect.height);
  if (workAreas.some((a) => overlapArea(strip, a) >= need)) return rect;

  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const distance = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const best = [...workAreas].sort((a, b) =>
    overlapArea(rect, b) - overlapArea(rect, a)
    || distance(center(rect), center(a)) - distance(center(rect), center(b)))[0];

  const w = Math.min(rect.width, best.width);
  const h = Math.min(rect.height, best.height);
  return {
    x: clamp(rect.x, best.x, best.x + best.width - w),
    y: clamp(rect.y, best.y, best.y + best.height - h),
    width: w,
    height: h,
  };
}

/**
 * localStorage に保存した値を、内側サイズ(iw/ih)の形式に正規化する。
 * 以前のバージョンは外形(枠込み)を w/h として保存していたため、その場合は枠の分を引いて内側サイズにする。
 * そのまま setSize(内側サイズを指定する)に渡すと、起動のたびに枠の分だけ大きくなっていた。
 *
 * @param saved 保存されていた値
 * @param frame 現在のウインドウの枠の大きさ(外形 − 内側)
 * @returns {{x:number,y:number,iw:number,ih:number,max:boolean}|null} 使えない値なら null
 */
export function normalizeSaved(saved, frame) {
  if (!saved || typeof saved !== "object") return null;
  const ok = (n) => typeof n === "number" && Number.isFinite(n);
  if (!ok(saved.x) || !ok(saved.y)) return null;

  let iw = saved.iw;
  let ih = saved.ih;
  if (!ok(iw) || !ok(ih)) {
    if (!ok(saved.w) || !ok(saved.h)) return null;
    iw = saved.w - frame.width;
    ih = saved.h - frame.height;
  }
  if (iw <= 0 || ih <= 0) return null;
  return { x: saved.x, y: saved.y, iw, ih, max: saved.max === true };
}
