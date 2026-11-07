import test from "node:test";
import assert from "node:assert/strict";
import { moveId } from "../src/lib/dragReorder.js";

const IDS = ["a", "b", "c", "d"];

test("moveId: 対象の前へ動かす", () => {
  assert.deepEqual(moveId(IDS, "d", "b", false), ["a", "d", "b", "c"]);
  assert.deepEqual(moveId(IDS, "c", "a", false), ["c", "a", "b", "d"]);
});

test("moveId: 対象の後ろへ動かす", () => {
  assert.deepEqual(moveId(IDS, "a", "c", true), ["b", "c", "a", "d"]);
  assert.deepEqual(moveId(IDS, "a", "d", true), ["b", "c", "d", "a"]);
});

test("moveId: 動かさない場合は同じ並び(元の配列は書き換えない)", () => {
  assert.deepEqual(moveId(IDS, "b", "a", true), IDS);
  assert.deepEqual(moveId(IDS, "b", "c", false), IDS);
  const copy = [...IDS];
  moveId(IDS, "a", "d", true);
  assert.deepEqual(IDS, copy);
});

test("moveId: 知らない ID なら、そのままの並びを返す", () => {
  assert.deepEqual(moveId(IDS, "x", "a", false), IDS);
  assert.deepEqual(moveId(IDS, "a", "x", false), IDS);
});
