import test from "node:test";
import assert from "node:assert/strict";
import { fitBounds, normalizeSaved } from "../src/lib/windowBounds.js";

const single = [{ x: 0, y: 0, width: 1920, height: 1040 }];
const dual = [
  { x: -1920, y: 0, width: 1920, height: 1040 },
  { x: 0, y: 0, width: 1920, height: 1040 },
];

test("画面内に収まっていれば、そのまま", () => {
  const r = { x: 300, y: 200, width: 1200, height: 800 };
  assert.deepEqual(fitBounds(r, single), r);
});

test("左モニタ(負の座標)上の位置は維持される", () => {
  const r = { x: -1500, y: 100, width: 1200, height: 800 };
  assert.deepEqual(fitBounds(r, dual), r);
});

test("モニタをまたぐ配置は維持される", () => {
  const r = { x: -600, y: 100, width: 1200, height: 800 };
  assert.deepEqual(fitBounds(r, dual), r);
});

test("取り外したモニタ上の位置は、残ったモニタの中へ引き戻される", () => {
  const r = { x: -1500, y: 100, width: 1200, height: 800 };
  const fitted = fitBounds(r, single);
  assert.ok(fitted.x >= 0 && fitted.x + fitted.width <= 1920);
  assert.ok(fitted.y >= 0 && fitted.y + fitted.height <= 1040);
  assert.equal(fitted.width, 1200);
});

test("遠く離れた画面外は、最も近いモニタへ", () => {
  const fitted = fitBounds({ x: 12000, y: 9000, width: 1200, height: 800 }, single);
  assert.deepEqual(fitted, { x: 720, y: 240, width: 1200, height: 800 });
});

test("モニタより大きいサイズは、全モニタの範囲に収める", () => {
  const fitted = fitBounds({ x: 0, y: 0, width: 30000, height: 20000 }, single);
  assert.deepEqual(fitted, { x: 0, y: 0, width: 1920, height: 1040 });
});

test("最小サイズ未満にはしない", () => {
  const fitted = fitBounds({ x: 100, y: 100, width: 100, height: 50 }, single, { minWidth: 640, minHeight: 400 });
  assert.equal(fitted.width, 640);
  assert.equal(fitted.height, 400);
});

test("モニタ情報が取れない場合は、そのまま返す", () => {
  const r = { x: 1, y: 2, width: 3, height: 4 };
  assert.deepEqual(fitBounds(r, []), r);
});

test("タイトルバーがつかめない程度しか見えていなければ引き戻す", () => {
  // 右端から 20px しか見えていない
  const fitted = fitBounds({ x: 1900, y: 100, width: 1200, height: 800 }, single);
  assert.ok(fitted.x + fitted.width <= 1920);
});

test("normalizeSaved: 新形式(内側サイズ)はそのまま", () => {
  assert.deepEqual(
    normalizeSaved({ x: 10, y: 20, iw: 1200, ih: 800, max: false }, { width: 16, height: 39 }),
    { x: 10, y: 20, iw: 1200, ih: 800, max: false },
  );
});

test("normalizeSaved: 旧形式(外形)は枠の分を引いて内側サイズにする", () => {
  // 旧バージョンは外形 1264x956 を保存していた。枠は 16x39 なので内側は 1248x917。
  assert.deepEqual(
    normalizeSaved({ x: 316, y: 316, w: 1264, h: 956 }, { width: 16, height: 39 }),
    { x: 316, y: 316, iw: 1248, ih: 917, max: false },
  );
});

test("normalizeSaved: 壊れた値は null", () => {
  assert.equal(normalizeSaved(null, { width: 0, height: 0 }), null);
  assert.equal(normalizeSaved({ x: "a", y: 1, iw: 1, ih: 1 }, { width: 0, height: 0 }), null);
  assert.equal(normalizeSaved({ x: 1, y: 1 }, { width: 0, height: 0 }), null);
  assert.equal(normalizeSaved({ x: 1, y: 1, w: 10, h: 10 }, { width: 16, height: 39 }), null);
});

test("normalizeSaved: 最大化の状態を引き継ぐ", () => {
  assert.equal(normalizeSaved({ x: 0, y: 0, iw: 800, ih: 600, max: true }, { width: 0, height: 0 }).max, true);
});
