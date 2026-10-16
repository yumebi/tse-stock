// 価格アラートの判定(画面・通知から切り離した純粋関数)。

/** 今日の日付キー(ローカル時間、YYYY-MM-DD)。前日比アラートを「1日1回」にするために使う。 */
export function dayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * 1銘柄ぶんのアラートを判定する。
 *
 * - 上値 hi: 前回の価格が hi 未満で、今回 hi 以上になった(下から超えた)ときに通知する。
 * - 下値 lo: 前回の価格が lo 超で、今回 lo 以下になった(上から割った)ときに通知する。
 *   上値・下値は「境界をまたいだ瞬間」だけなので、すでに超えている状態で起動しても通知しない。
 * - 前日比 pct: 前日比が +pct% 以上 / -pct% 以下になったら通知する。
 *   境界付近で上下しても通知が連発しないよう、上昇側・下落側それぞれ「1日に1回」まで。
 *
 * @param prevPrice 前回取得した価格(初回は null/undefined。上値・下値は判定しない)
 * @param price 今回の価格
 * @param changePercent 今回の前日比(%)
 * @param alert {hi?, lo?, pct?}(未設定は null)
 * @param fired その銘柄で、前日比アラートを最後に通知した日 { up?: 日付キー, down?: 日付キー }
 * @param today 今日の日付キー
 * @returns {{events: {kind: "hi"|"lo"|"pctUp"|"pctDown", level: number, value?: number}[], fired: object}}
 */
export function evaluateAlert(prevPrice, price, changePercent, alert, fired, today) {
  const events = [];
  let nextFired = fired || {};
  if (!alert) return { events, fired: nextFired };

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  if (isNum(alert.hi) && isNum(prevPrice) && prevPrice < alert.hi && price >= alert.hi) {
    events.push({ kind: "hi", level: alert.hi });
  }
  if (isNum(alert.lo) && isNum(prevPrice) && prevPrice > alert.lo && price <= alert.lo) {
    events.push({ kind: "lo", level: alert.lo });
  }

  if (isNum(alert.pct) && alert.pct > 0 && isNum(changePercent)) {
    if (changePercent >= alert.pct && nextFired.up !== today) {
      events.push({ kind: "pctUp", level: alert.pct, value: changePercent });
      nextFired = { ...nextFired, up: today };
    }
    if (changePercent <= -alert.pct && nextFired.down !== today) {
      events.push({ kind: "pctDown", level: alert.pct, value: changePercent });
      nextFired = { ...nextFired, down: today };
    }
  }

  return { events, fired: nextFired };
}

/** 通知の見出しと本文。 */
export function alertMessage(code, event, price) {
  const yen = (n) => `¥${n.toLocaleString()}`;
  switch (event.kind) {
    case "hi":
      return {
        status: `🔔 ${code} 上値アラート ${yen(event.level)} 到達`,
        title: `TSE Stock: ${code} 上値アラート`,
        body: `現在価格 ${yen(price)} が ${yen(event.level)} に到達`,
      };
    case "lo":
      return {
        status: `🔔 ${code} 下値アラート ${yen(event.level)} 到達`,
        title: `TSE Stock: ${code} 下値アラート`,
        body: `現在価格 ${yen(price)} が ${yen(event.level)} に到達`,
      };
    default: {
      const sign = event.value >= 0 ? "+" : "";
      const v = `${sign}${event.value.toFixed(2)}%`;
      return {
        status: `🔔 ${code} 前日比 ${v}(±${event.level}% 到達)`,
        title: `TSE Stock: ${code} 前日比アラート`,
        body: `前日比 ${v} で ±${event.level}% に到達(現在価格 ${yen(price)})`,
      };
    }
  }
}
