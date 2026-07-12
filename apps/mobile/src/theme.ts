// Design tokens (decision P5-11A). The numbers are the contract; the typeface
// is swappable on taste. The O-map itself is sacred — ISOM colors, never
// tinted; panels over the map are always SOLID (sunlight readability).

export const color = {
  panel: "#16130f", // map ink
  onPanel: "#ffffff",
  surface: "#ffffff",
  onSurface: "#16130f",
  /** ISOM course overprint magenta — course overlay AND primary actions */
  accent: "#e6007e",
  /** control-flag orange */
  orange: "#ff7f2a",
  verified: "#0A7A0A",
  warning: "#B45309",
  error: "#B91C1C",
  muted: "#6b7280",
  hair: "#e7e3dc",
} as const;

export const type = {
  /** elapsed timer — mono, tabular */
  timer: 48,
  nextControl: 24,
  body: 17,
  /** floor — nothing smaller, ever */
  min: 16,
} as const;

export const touch = {
  /** run screen: wet/gloved hands */
  run: 60,
  /** everywhere else */
  default: 44,
  /** the PUNCH button (P2-5A) */
  punchButton: 72,
} as const;

// OL-KA type system (loaded in App.tsx). Archivo = display/headlines,
// IBM Plex Sans = body, IBM Plex Mono = codes / times / data.
export const font = {
  display: "Archivo_800ExtraBold",
  sans: "IBMPlexSans_400Regular",
  sansBold: "IBMPlexSans_600SemiBold",
  mono: "IBMPlexMono_700Bold",
  monoReg: "IBMPlexMono_400Regular",
} as const;
