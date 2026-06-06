import { state } from "./state.js";

// ===== シグナルスコア =====
export function scoreSignals(sigs) { let buy = 0, sell = 0; for (const s of sigs || []) { if (s.includes("GC") || s.includes("買い") || s.includes("上抜") || s.includes("続騰")) buy++; if (s.includes("DC") || s.includes("売り") || s.includes("下抜") || s.includes("続落") || s.includes("買われ")) sell++; } return { buy, sell }; }
export function scoreText(sigs) { const { buy, sell } = scoreSignals(sigs); if (buy === 0 && sell === 0) return "-"; return `🟢${buy} 🔴${sell}`; }
export function scoreClass(sigs) { const { buy, sell } = scoreSignals(sigs); const net = buy - sell; if (net > 0) return "bullish"; if (net < 0) return "bearish"; return "neutral"; }

// ===== スパークライン =====
export function sparkline(cl) {
  if (!cl || cl.length < 2) return "";
  const w = 64, h = 22, p = 2;
  const mn = Math.min(...cl), mx = Math.max(...cl), r = mx - mn || 1;
  const pts = cl.map((v, i) => {
    const x = p + (i / (cl.length - 1)) * (w - p * 2), y = p + (1 - (v - mn) / r) * (h - p * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = cl[cl.length - 1] >= cl[0];
  return `<svg width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="${up ? "#3fb950" : "#f85149"}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function getSparkData(s) {
  if (state.sparkPeriod === "1d") return s.intradayCloses || [];
  const closes = s.recentCloses || [];
  const n = { "3d": 3, "1mo": 22, "3mo": 65, "6mo": 130, "1y": 252 }[state.sparkPeriod] ?? 3;
  return closes.slice(-n);
}

// ===== 表示クラス =====
export function volClass(s) { if (!s._volAvg || s._volAvg <= 0) return ""; const r = s.volume / s._volAvg; if (r >= 3) return "vol-hot3"; if (r >= 2) return "vol-hot2"; if (r >= 1.5) return "vol-hot1"; if (r >= 1) return "vol-normal"; return "vol-cold"; }
export function gradClass(pct) { const a = Math.abs(pct); if (a >= 5) return pct > 0 ? "g-up4" : "g-down4"; if (a >= 3) return pct > 0 ? "g-up3" : "g-down3"; if (a >= 1) return pct > 0 ? "g-up2" : "g-down2"; if (a > 0) return pct > 0 ? "g-up1" : "g-down1"; return ""; }

// ===== フォーマット =====
export const fmt = n => n != null ? n.toLocaleString() : "-";
export const fmtPct = n => n != null ? (n >= 0 ? "+" : "") + n.toFixed(2) + "%" : "-";
export const fmtOpt = (n, s) => n != null ? n.toLocaleString() + (s || "") : "-";
