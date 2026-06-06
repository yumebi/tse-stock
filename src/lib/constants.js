// ===== カラム定義 =====
export const ALL_COLS = [
  { k: "reorder",  w: "36px",   label: "" },
  { k: "code",     w: "70px",   label: "コード",   movable: true, toggle: "code" },
  { k: "name",     w: "minmax(80px, 0.7fr)",  label: "企業名",   movable: true, toggle: "name" },
  { k: "price",    w: "105px",  label: "現在株価", movable: true, toggle: "price" },
  { k: "spark",    w: "70px",   label: "5日",      movable: true, toggle: "spark" },
  { k: "change",   w: "120px",  label: "前日比",   movable: true, toggle: "change" },
  { k: "prev",     w: "105px",  label: "前日終値", movable: true, toggle: "prev" },
  { k: "open",     w: "100px",  label: "始値",     movable: true, toggle: "open" },
  { k: "high",     w: "95px",   label: "高値",     movable: true, toggle: "hl" },
  { k: "low",      w: "95px",   label: "安値",     movable: true, toggle: "hl" },
  { k: "volume",   w: "80px",   label: "出来高",   movable: true, toggle: "volume" },
  { k: "ma5",      w: "72px",   label: "MA5",      movable: true, toggle: "ma" },
  { k: "ma25",     w: "72px",   label: "MA25",     movable: true, toggle: "ma" },
  { k: "ma75",     w: "72px",   label: "MA75",     movable: true, toggle: "ma" },
  { k: "macd",     w: "68px",   label: "MACD",     movable: true, toggle: "ind" },
  { k: "sig",      w: "55px",   label: "Sig",      movable: true, toggle: "ind" },
  { k: "rsi",      w: "52px",   label: "RSI",      movable: true, toggle: "rsi" },
  { k: "score",    w: "58px",   label: "判定",     movable: true, toggle: "score" },
  { k: "signals",  w: "minmax(120px, 1fr)",    label: "シグナル", movable: true, toggle: "signals" },
  { k: "w52hi",    w: "64px",   label: "52高",     movable: true, toggle: "w52" },
  { k: "w52lo",    w: "64px",   label: "52安",     movable: true, toggle: "w52" },
  { k: "pnl",      w: "88px",   label: "損益",     movable: true, toggle: "pnl" },
  { k: "alert",    w: "72px",   label: "アラート", movable: true, toggle: "alert" },
  { k: "note",     w: "32px",   label: "メモ",     movable: true, toggle: "note" },
  { k: "del",      w: "28px",   label: "" },
];

export const TOGGLE_LABELS = [
  ["code",    "コード"],
  ["name",    "企業名"],
  ["price",   "現在株価"],
  ["spark",   "チャート"],
  ["change",  "前日比"],
  ["prev",    "前日終値"],
  ["open",    "始値"],
  ["hl",      "高値 / 安値"],
  ["volume",  "出来高"],
  ["ma",      "MA5 / MA25 / MA75"],
  ["ind",     "MACD / Sig"],
  ["rsi",     "RSI"],
  ["score",   "判定"],
  ["signals", "シグナル"],
  ["w52",     "52週高値/安値"],
  ["pnl",     "損益（ポートフォリオ）"],
  ["alert",   "価格アラート"],
  ["note",    "銘柄メモ"],
];

export const MOVABLE_KEYS = ALL_COLS.filter(c => c.movable).map(c => c.k);

export const NEW_MOVABLE_KEYS = ["w52hi", "w52lo", "pnl"];

export const SORT_KEYS = {
  "col-code":   { key: "code" },
  "col-name":   { key: "nameJa" },
  "col-price":  { key: "price" },
  "col-change": { key: "change" },
  "col-open":   { key: "open" },
  "col-volume": { key: "volume" },
  "col-rsi":    { key: "rsi" },
  "col-ma5":    { key: "ma5" },
  "col-ma25":   { key: "ma25" },
  "col-ma75":   { key: "ma75" },
  "col-macd":   { key: "macd" },
  "col-score":  { key: "_score" },
  "col-w52hi":  { key: "_w52hi" },
  "col-w52lo":  { key: "_w52lo" },
  "col-pnl":    { key: "_pnl" },
};

export const DENSITY_LABELS = { compact: "コンパクト", normal: "標準", large: "ゆったり" };
export const DENSITY_NEXT   = { compact: "normal", normal: "large", large: "compact" };

export const SPARK_LABELS = { "1d": "1日", "3d": "3日", "1mo": "1月", "3mo": "3月", "6mo": "6月", "1y": "1年" };

export const SIG_PAUSE_MS = 5000;
