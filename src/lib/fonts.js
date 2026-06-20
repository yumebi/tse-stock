// ===== フォント定義（数字・コード表示用） =====
// google: Google Fonts CSS2 APIのfamilyクエリ値。nullはシステムフォントのみ使用。
export const FONTS = {
  system:        { label: "システム標準",      family: 'system-ui, -apple-system, "Segoe UI", sans-serif', google: null },
  "jetbrains":   { label: "JetBrains Mono",    family: '"JetBrains Mono", monospace',  google: "JetBrains+Mono:wght@400;500;700" },
  "fira-code":   { label: "Fira Code",         family: '"Fira Code", monospace',       google: "Fira+Code:wght@400;500;700" },
  "ibm-plex":    { label: "IBM Plex Mono",     family: '"IBM Plex Mono", monospace',   google: "IBM+Plex+Mono:wght@400;500;700" },
  "roboto-mono": { label: "Roboto Mono",       family: '"Roboto Mono", monospace',     google: "Roboto+Mono:wght@400;500;700" },
  "share-tech":  { label: "Share Tech Mono",   family: '"Share Tech Mono", monospace', google: "Share+Tech+Mono" },
  "space-mono":  { label: "Space Mono",        family: '"Space Mono", monospace',      google: "Space+Mono:wght@400;700" },
  "orbitron":    { label: "Orbitron",          family: '"Orbitron", sans-serif',       google: "Orbitron:wght@400;600;700" },
  "oxanium":     { label: "Oxanium",           family: '"Oxanium", sans-serif',        google: "Oxanium:wght@400;600;700" },
  "chakra":      { label: "Chakra Petch",      family: '"Chakra Petch", sans-serif',   google: "Chakra+Petch:wght@400;600;700" },
  "rajdhani":    { label: "Rajdhani",          family: '"Rajdhani", sans-serif',       google: "Rajdhani:wght@400;600;700" },
  "inconsolata": { label: "Inconsolata",       family: '"Inconsolata", monospace',     google: "Inconsolata:wght@400;700" },
  "source-code": { label: "Source Code Pro",   family: '"Source Code Pro", monospace', google: "Source+Code+Pro:wght@400;600;700" },
  "ubuntu-mono": { label: "Ubuntu Mono",       family: '"Ubuntu Mono", monospace',     google: "Ubuntu+Mono:wght@400;700" },
  "dm-mono":     { label: "DM Mono",           family: '"DM Mono", monospace',         google: "DM+Mono:wght@400;500" },
  "azeret":      { label: "Azeret Mono",       family: '"Azeret Mono", monospace',     google: "Azeret+Mono:wght@400;600;700" },
  "major-mono":  { label: "Major Mono Display", family: '"Major Mono Display", monospace', google: "Major+Mono+Display" },
  "vt323":       { label: "VT323",             family: '"VT323", monospace',           google: "VT323" },
  "russo":       { label: "Russo One",         family: '"Russo One", sans-serif',      google: "Russo+One" },
  "audiowide":   { label: "Audiowide",         family: '"Audiowide", sans-serif',      google: "Audiowide" },
  "aldrich":     { label: "Aldrich",           family: '"Aldrich", sans-serif',        google: "Aldrich" },
  "teko":        { label: "Teko",              family: '"Teko", sans-serif',           google: "Teko:wght@400;600;700" },
};

export const FONT_DEFAULT = "system";

let _linkEl = null;

export function applyFont(key) {
  const font = FONTS[key] || FONTS[FONT_DEFAULT];
  if (font.google) {
    if (!_linkEl) {
      _linkEl = document.createElement("link");
      _linkEl.rel = "stylesheet";
      document.head.appendChild(_linkEl);
    }
    _linkEl.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  }
  document.documentElement.style.setProperty("--font-mono", font.family);
}

export function applyFontBold(bold) {
  document.body.classList.toggle("font-bold", !!bold);
}
