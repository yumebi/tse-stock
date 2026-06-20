// ===== テーマ定義 =====
// 各テーマは style.css :root の CSS変数を上書きする値を持つ
export const THEMES = {
  "github-dark": {
    label: "GitHub Dark",
    vars: {
      "--bg-primary": "#0d1117", "--bg-secondary": "#161b22", "--bg-tertiary": "#21262d",
      "--border-color": "#30363d", "--text-primary": "#e6edf3", "--text-secondary": "#8b949e",
      "--text-muted": "#6e7681", "--accent-green": "#3fb950", "--accent-red": "#f85149",
      "--accent-blue": "#58a6ff", "--accent-orange": "#f0883e", "--button-bg": "#21262d", "--button-hover": "#30363d",
    },
  },
  "terminal": {
    label: "Modern Terminal",
    vars: {
      "--bg-primary": "#09090b", "--bg-secondary": "#0f0f11", "--bg-tertiary": "#18181b",
      "--border-color": "#27272a", "--text-primary": "#e4e4e7", "--text-secondary": "#a1a1aa",
      "--text-muted": "#52525b", "--accent-green": "#22c55e", "--accent-red": "#ef4444",
      "--accent-blue": "#71717a", "--accent-orange": "#f59e0b", "--button-bg": "#18181b", "--button-hover": "#27272a",
    },
  },
  "navy-pro": {
    label: "Navy Pro",
    vars: {
      "--bg-primary": "#0b0f19", "--bg-secondary": "#0e1625", "--bg-tertiary": "#142136",
      "--border-color": "#1e2d4a", "--text-primary": "#e2e8f0", "--text-secondary": "#94a3b8",
      "--text-muted": "#334155", "--accent-green": "#34d399", "--accent-red": "#f87171",
      "--accent-blue": "#60a5fa", "--accent-orange": "#fbbf24", "--button-bg": "#142136", "--button-hover": "#1e2d4a",
    },
  },
  "obsidian": {
    label: "Obsidian Minimal",
    vars: {
      "--bg-primary": "#111113", "--bg-secondary": "#18181a", "--bg-tertiary": "#1c1c1e",
      "--border-color": "#2a2a2c", "--text-primary": "#fafafa", "--text-secondary": "#a1a1a1",
      "--text-muted": "#5a5a5c", "--accent-green": "#4ade80", "--accent-red": "#f43f5e",
      "--accent-blue": "#a78bfa", "--accent-orange": "#fb923c", "--button-bg": "#1c1c1e", "--button-hover": "#2a2a2c",
    },
  },
  "dracula": {
    label: "Dracula",
    vars: {
      "--bg-primary": "#282a36", "--bg-secondary": "#2f3142", "--bg-tertiary": "#3a3c4e",
      "--border-color": "#44475a", "--text-primary": "#f8f8f2", "--text-secondary": "#bd93f9",
      "--text-muted": "#6272a4", "--accent-green": "#50fa7b", "--accent-red": "#ff5555",
      "--accent-blue": "#8be9fd", "--accent-orange": "#ffb86c", "--button-bg": "#3a3c4e", "--button-hover": "#44475a",
    },
  },
  "nord": {
    label: "Nord",
    vars: {
      "--bg-primary": "#2e3440", "--bg-secondary": "#3b4252", "--bg-tertiary": "#434c5e",
      "--border-color": "#4c566a", "--text-primary": "#eceff4", "--text-secondary": "#d8dee9",
      "--text-muted": "#7b88a1", "--accent-green": "#a3be8c", "--accent-red": "#bf616a",
      "--accent-blue": "#88c0d0", "--accent-orange": "#d08770", "--button-bg": "#434c5e", "--button-hover": "#4c566a",
    },
  },
  "monokai": {
    label: "Monokai",
    vars: {
      "--bg-primary": "#272822", "--bg-secondary": "#2e2f28", "--bg-tertiary": "#3a3b32",
      "--border-color": "#49483e", "--text-primary": "#f8f8f2", "--text-secondary": "#a59f85",
      "--text-muted": "#75715e", "--accent-green": "#a6e22e", "--accent-red": "#f92672",
      "--accent-blue": "#66d9ef", "--accent-orange": "#fd971f", "--button-bg": "#3a3b32", "--button-hover": "#49483e",
    },
  },
  "solarized-dark": {
    label: "Solarized Dark",
    vars: {
      "--bg-primary": "#002b36", "--bg-secondary": "#073642", "--bg-tertiary": "#0a4554",
      "--border-color": "#11586b", "--text-primary": "#eee8d5", "--text-secondary": "#93a1a1",
      "--text-muted": "#586e75", "--accent-green": "#859900", "--accent-red": "#dc322f",
      "--accent-blue": "#268bd2", "--accent-orange": "#cb4b16", "--button-bg": "#0a4554", "--button-hover": "#11586b",
    },
  },
  "gruvbox-dark": {
    label: "Gruvbox Dark",
    vars: {
      "--bg-primary": "#282828", "--bg-secondary": "#32302f", "--bg-tertiary": "#3c3836",
      "--border-color": "#504945", "--text-primary": "#ebdbb2", "--text-secondary": "#bdae93",
      "--text-muted": "#7c6f64", "--accent-green": "#b8bb26", "--accent-red": "#fb4934",
      "--accent-blue": "#83a598", "--accent-orange": "#fe8019", "--button-bg": "#3c3836", "--button-hover": "#504945",
    },
  },
  "tokyo-night": {
    label: "Tokyo Night",
    vars: {
      "--bg-primary": "#1a1b26", "--bg-secondary": "#20212e", "--bg-tertiary": "#292a3a",
      "--border-color": "#363a52", "--text-primary": "#c0caf5", "--text-secondary": "#a9b1d6",
      "--text-muted": "#565f89", "--accent-green": "#9ece6a", "--accent-red": "#f7768e",
      "--accent-blue": "#7aa2f7", "--accent-orange": "#ff9e64", "--button-bg": "#292a3a", "--button-hover": "#363a52",
    },
  },
  "one-dark": {
    label: "One Dark",
    vars: {
      "--bg-primary": "#282c34", "--bg-secondary": "#2f333d", "--bg-tertiary": "#3b4048",
      "--border-color": "#4b5263", "--text-primary": "#abb2bf", "--text-secondary": "#828997",
      "--text-muted": "#5c6370", "--accent-green": "#98c379", "--accent-red": "#e06c75",
      "--accent-blue": "#61afef", "--accent-orange": "#d19a66", "--button-bg": "#3b4048", "--button-hover": "#4b5263",
    },
  },
  "light": {
    label: "Light",
    vars: {
      "--bg-primary": "#ffffff", "--bg-secondary": "#f6f8fa", "--bg-tertiary": "#eaeef2",
      "--border-color": "#d0d7de", "--text-primary": "#24292f", "--text-secondary": "#57606a",
      "--text-muted": "#8c959f", "--accent-green": "#1a7f37", "--accent-red": "#cf222e",
      "--accent-blue": "#0969da", "--accent-orange": "#bc4c00", "--button-bg": "#f6f8fa", "--button-hover": "#eaeef2",
    },
  },
};

export const THEME_DEFAULT = "github-dark";

export function applyTheme(key) {
  const theme = THEMES[key] || THEMES[THEME_DEFAULT];
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(theme.vars)) root.setProperty(k, v);
}
