// Design tokens (decision P5-11A). The numbers are the contract; the typeface
// is swappable on taste. The O-map itself is sacred — ISOM colors, never
// tinted; panels over the map are always SOLID (sunlight readability).

export const color = {
  panel: "#141414",
  onPanel: "#ffffff",
  surface: "#ffffff",
  onSurface: "#141414",
  /** ISOM magenta — course overlay AND primary actions */
  accent: "#D10F7C",
  verified: "#0A7A0A",
  warning: "#B45309",
  error: "#B91C1C",
  muted: "#6b7280",
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

// IBM Plex ships via @expo-google-fonts later; until loaded we fall back to
// the platform mono/sans WITHOUT pretending that's the final typography.
export const font = {
  sans: "IBMPlexSans_400Regular",
  sansBold: "IBMPlexSans_700Bold",
  mono: "IBMPlexMono_700Bold",
} as const;
