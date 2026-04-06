export type ThemeName = "opencode-dark" | "opencode-light" | "nord" | "monokai" | "tokyo-night"

export interface Theme {
  name: string
  background: string
  panel: string
  panelAlt: string
  border: string
  borderStrong: string
  text: string
  muted: string
  accent: string
  accentSoft: string
  success: string
  warning: string
  error: string
  info: string
  codeBg: string
  codeText: string
  quote: string
  tableHeadBg: string
  tableRowBg: string
  searchBg: string
  searchText: string
  searchActiveBg: string
  searchActiveText: string
  selectionBg: string
  selectionText: string
}

export const themes: Record<ThemeName, Theme> = {
  "opencode-dark": {
    name: "OpenCode Dark",
    background: "#0b0f14",
    panel: "#0f141b",
    panelAlt: "#111823",
    border: "#243041",
    borderStrong: "#3a4d66",
    text: "#e6edf3",
    muted: "#8b949e",
    accent: "#58a6ff",
    accentSoft: "#79c0ff",
    success: "#56d364",
    warning: "#f2cc60",
    error: "#ff7b72",
    info: "#d2a8ff",
    codeBg: "#161b22",
    codeText: "#c9d1d9",
    quote: "#8b949e",
    tableHeadBg: "#111823",
    tableRowBg: "#0f141b",
    searchBg: "#1f2a37",
    searchText: "#f0f6fc",
    searchActiveBg: "#58a6ff",
    searchActiveText: "#08111c",
    selectionBg: "#264f78",
    selectionText: "#ffffff",
  },
  "opencode-light": {
    name: "OpenCode Light",
    background: "#e7ecf3",
    panel: "#f4f7fb",
    panelAlt: "#dde6f1",
    border: "#98a6b8",
    borderStrong: "#66758a",
    text: "#111827",
    muted: "#334155",
    accent: "#0b63ce",
    accentSoft: "#1d4ed8",
    success: "#1a7f37",
    warning: "#9a6700",
    error: "#cf222e",
    info: "#8250df",
    codeBg: "#e9eef5",
    codeText: "#111827",
    quote: "#475569",
    tableHeadBg: "#d3ddeb",
    tableRowBg: "#eef3f9",
    searchBg: "#b7d2fb",
    searchText: "#0f172a",
    searchActiveBg: "#0b63ce",
    searchActiveText: "#ffffff",
    selectionBg: "#b7d2fb",
    selectionText: "#0f172a",
  },
  nord: {
    name: "Nord",
    background: "#2e3440",
    panel: "#3b4252",
    panelAlt: "#434c5e",
    border: "#4c566a",
    borderStrong: "#81a1c1",
    text: "#eceff4",
    muted: "#8fbcbb",
    accent: "#88c0d0",
    accentSoft: "#81a1c1",
    success: "#a3be8c",
    warning: "#ebcb8b",
    error: "#bf616a",
    info: "#b48ead",
    codeBg: "#3b4252",
    codeText: "#eceff4",
    quote: "#8fbcbb",
    tableHeadBg: "#434c5e",
    tableRowBg: "#3b4252",
    searchBg: "#434c5e",
    searchText: "#eceff4",
    searchActiveBg: "#88c0d0",
    searchActiveText: "#2e3440",
    selectionBg: "#4c566a",
    selectionText: "#eceff4",
  },
  monokai: {
    name: "Monokai",
    background: "#272822",
    panel: "#2d2e27",
    panelAlt: "#3e3d32",
    border: "#49483e",
    borderStrong: "#75715e",
    text: "#f8f8f2",
    muted: "#75715e",
    accent: "#66d9ef",
    accentSoft: "#a6e22e",
    success: "#a6e22e",
    warning: "#e6db74",
    error: "#f92672",
    info: "#fd971f",
    codeBg: "#1e1f1c",
    codeText: "#f8f8f2",
    quote: "#75715e",
    tableHeadBg: "#3e3d32",
    tableRowBg: "#2d2e27",
    searchBg: "#49483e",
    searchText: "#f8f8f2",
    searchActiveBg: "#a6e22e",
    searchActiveText: "#1e1f1c",
    selectionBg: "#49483e",
    selectionText: "#f8f8f2",
  },
  "tokyo-night": {
    name: "Tokyo Night",
    background: "#1a1b26",
    panel: "#24283b",
    panelAlt: "#2f334d",
    border: "#3b4261",
    borderStrong: "#7aa2f7",
    text: "#c0caf5",
    muted: "#9aa5ce",
    accent: "#7aa2f7",
    accentSoft: "#bb9af7",
    success: "#9ece6a",
    warning: "#e0af68",
    error: "#f7768e",
    info: "#7dcfff",
    codeBg: "#1f2335",
    codeText: "#c0caf5",
    quote: "#565f89",
    tableHeadBg: "#2a2f43",
    tableRowBg: "#24283b",
    searchBg: "#33467c",
    searchText: "#e8e9f0",
    searchActiveBg: "#7aa2f7",
    searchActiveText: "#1a1b26",
    selectionBg: "#33467c",
    selectionText: "#e8e9f0",
  },
}

export const themeOrder: ThemeName[] = ["opencode-dark", "opencode-light", "nord", "monokai", "tokyo-night"]

export function nextThemeName(current: ThemeName): ThemeName {
  const index = themeOrder.indexOf(current)
  return themeOrder[(index + 1) % themeOrder.length]
}
