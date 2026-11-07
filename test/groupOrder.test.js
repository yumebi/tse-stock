import test from "node:test";
import assert from "node:assert/strict";
import { reorderGroupKeys } from "../src/lib/groupOrder.js";

// 列: code(単独) / high+low(グループ hl) / ma5+ma25(グループ ma) / rsi(単独)。reorder・del は toggle なし(固定)。
const COLS = [
  { k: "reorder" },
  { k: "code", toggle: "code" },
  { k: "high", toggle: "hl" },
  { k: "low", toggle: "hl" },
  { k: "ma5", toggle: "ma" },
  { k: "ma25", toggle: "ma" },
  { k: "rsi", toggle: "rsi" },
  { k: "del" },
];
const ORDER = ["code", "high", "low", "ma5", "ma25", "rsi"];

test("グループを入れ替えると、グループ内の列の並びは保たれる", () => {
  assert.deepEqual(reorderGroupKeys(ORDER, COLS, ["rsi", "code", "hl", "ma"]), ["rsi", "code", "high", "low", "ma5", "ma25"]);
  assert.deepEqual(reorderGroupKeys(ORDER, COLS, ["ma", "hl", "code", "rsi"]), ["ma5", "ma25", "high", "low", "code", "rsi"]);
});

test("同じ並びなら、何も変わらない", () => {
  assert.deepEqual(reorderGroupKeys(ORDER, COLS, ["code", "hl", "ma", "rsi"]), ORDER);
});

test("隣同士の入れ替えは、既存の moveGroup と同じ結果になる", () => {
  // hl と ma を入れ替える
  assert.deepEqual(reorderGroupKeys(ORDER, COLS, ["code", "ma", "hl", "rsi"]), ["code", "ma5", "ma25", "high", "low", "rsi"]);
});

test("元の並びを書き換えない", () => {
  const copy = [...ORDER];
  reorderGroupKeys(ORDER, COLS, ["rsi", "ma", "hl", "code"]);
  assert.deepEqual(ORDER, copy);
});

test("不正な並び(件数違い・重複・知らないグループ・配列でない)は null", () => {
  assert.equal(reorderGroupKeys(ORDER, COLS, ["code", "hl", "ma"]), null);
  assert.equal(reorderGroupKeys(ORDER, COLS, ["code", "hl", "ma", "ma"]), null);
  assert.equal(reorderGroupKeys(ORDER, COLS, ["code", "hl", "ma", "nope"]), null);
  assert.equal(reorderGroupKeys(ORDER, COLS, null), null);
  assert.equal(reorderGroupKeys(ORDER, COLS, [...["code", "hl", "ma", "rsi"], "x"]), null);
});

test("非表示などで、colOrder に一部のグループしか無くても動く", () => {
  const partial = ["code", "rsi"];
  assert.deepEqual(reorderGroupKeys(partial, COLS, ["rsi", "code"]), ["rsi", "code"]);
});
