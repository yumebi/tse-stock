import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, evaluateAlert, alertMessage } from "../src/lib/alerts.js";

const TODAY = "2026-10-17";
const kinds = (r) => r.events.map((e) => e.kind);

test("dayKey: ローカル日付を YYYY-MM-DD にする", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(dayKey(new Date(2026, 11, 31, 0, 0)), "2026-12-31");
});

test("アラート未設定なら何も起きない", () => {
  assert.deepEqual(evaluateAlert(100, 200, 5, null, {}, TODAY), { events: [], fired: {} });
  assert.deepEqual(evaluateAlert(100, 200, 5, undefined, undefined, TODAY).events, []);
});

test("上値: 下から超えた瞬間だけ通知する", () => {
  const al = { hi: 1000, lo: null, pct: null };
  assert.deepEqual(kinds(evaluateAlert(990, 1000, 0, al, {}, TODAY)), ["hi"]);
  assert.deepEqual(kinds(evaluateAlert(990, 1010, 0, al, {}, TODAY)), ["hi"]);
  assert.deepEqual(kinds(evaluateAlert(1000, 1010, 0, al, {}, TODAY)), []);   // すでに超えている
  assert.deepEqual(kinds(evaluateAlert(990, 999, 0, al, {}, TODAY)), []);     // まだ届かない
});

test("下値: 上から割った瞬間だけ通知する", () => {
  const al = { hi: null, lo: 500 };
  assert.deepEqual(kinds(evaluateAlert(510, 500, 0, al, {}, TODAY)), ["lo"]);
  assert.deepEqual(kinds(evaluateAlert(500, 490, 0, al, {}, TODAY)), []);
  assert.deepEqual(kinds(evaluateAlert(510, 501, 0, al, {}, TODAY)), []);
});

test("上値・下値: 初回取得(前回の価格なし)では通知しない", () => {
  const al = { hi: 1000, lo: 500 };
  assert.deepEqual(kinds(evaluateAlert(null, 2000, 0, al, {}, TODAY)), []);
  assert.deepEqual(kinds(evaluateAlert(undefined, 100, 0, al, {}, TODAY)), []);
});

test("前日比: +N% 以上で1回、同じ日は再通知しない", () => {
  const al = { pct: 5 };
  const r1 = evaluateAlert(100, 105, 5.0, al, {}, TODAY);
  assert.deepEqual(kinds(r1), ["pctUp"]);
  assert.equal(r1.events[0].value, 5.0);
  assert.deepEqual(r1.fired, { up: TODAY });

  const r2 = evaluateAlert(105, 106, 6.0, al, r1.fired, TODAY);   // 同じ日の続き
  assert.deepEqual(kinds(r2), []);
});

test("前日比: -N% 以下で通知し、上昇側と下落側は別々に1日1回", () => {
  const al = { pct: 3 };
  const up = evaluateAlert(100, 104, 4, al, {}, TODAY);
  assert.deepEqual(kinds(up), ["pctUp"]);
  const down = evaluateAlert(104, 96, -4, al, up.fired, TODAY);   // 同じ日に下落側はまだ
  assert.deepEqual(kinds(down), ["pctDown"]);
  assert.deepEqual(down.fired, { up: TODAY, down: TODAY });
  assert.deepEqual(kinds(evaluateAlert(96, 95, -5, al, down.fired, TODAY)), []);
});

test("前日比: 翌日になれば、また通知できる", () => {
  const al = { pct: 5 };
  const day1 = evaluateAlert(100, 106, 6, al, {}, TODAY);
  const day2 = evaluateAlert(100, 106, 6, al, day1.fired, "2026-10-18");
  assert.deepEqual(kinds(day2), ["pctUp"]);
});

test("前日比: しきい値未満・0以下・不正値では通知しない", () => {
  assert.deepEqual(kinds(evaluateAlert(100, 104, 4.9, { pct: 5 }, {}, TODAY)), []);
  assert.deepEqual(kinds(evaluateAlert(100, 110, 10, { pct: 0 }, {}, TODAY)), []);
  assert.deepEqual(kinds(evaluateAlert(100, 110, 10, { pct: -5 }, {}, TODAY)), []);
  assert.deepEqual(kinds(evaluateAlert(100, 110, NaN, { pct: 5 }, {}, TODAY)), []);
  assert.deepEqual(kinds(evaluateAlert(100, 110, 10, { pct: null }, {}, TODAY)), []);
});

test("上値と前日比が同時に成立したら、両方通知する", () => {
  const r = evaluateAlert(990, 1060, 6, { hi: 1000, pct: 5 }, {}, TODAY);
  assert.deepEqual(kinds(r), ["hi", "pctUp"]);
});

test("fired を書き換えない(元のオブジェクトはそのまま)", () => {
  const fired = { up: "2026-10-01" };
  evaluateAlert(100, 110, 10, { pct: 5 }, fired, TODAY);
  assert.deepEqual(fired, { up: "2026-10-01" });
});

test("alertMessage: 見出しと本文", () => {
  assert.deepEqual(alertMessage("7203", { kind: "hi", level: 3000 }, 3010), {
    status: "🔔 7203 上値アラート ¥3,000 到達",
    title: "TSE Stock: 7203 上値アラート",
    body: "現在価格 ¥3,010 が ¥3,000 に到達",
  });
  const m = alertMessage("8306", { kind: "pctDown", level: 5, value: -5.234 }, 1500);
  assert.equal(m.status, "🔔 8306 前日比 -5.23%(±5% 到達)");
  assert.equal(m.title, "TSE Stock: 8306 前日比アラート");
  assert.ok(alertMessage("8306", { kind: "pctUp", level: 5, value: 5 }, 1500).body.includes("+5.00%"));
});
