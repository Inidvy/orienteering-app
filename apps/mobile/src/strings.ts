// The app's voice (decision P4-10A). These strings ARE the copy table in
// docs/design.md — keep them in sync verbatim. Tone: calm, specific, never
// blames the runner, never exposes crypto/GPS jargon.

export const strings = {
  punchSuccess: (flagNo: string, legTime: string, delta: string) =>
    `Flag ${flagNo} ✓ · Leg ${legTime} · ${delta}`,
  wrongFlag: (punched: string, expected: string) =>
    `That's flag ${punched} — next is flag ${expected}.`,
  nfcReadFail: "Tag won't read? Scan the QR code or type the flag number.",
  nfcOff: "NFC is switched off. Turn it on to punch.",
  trackingGap: (seconds: number) =>
    `GPS was interrupted for ${seconds} s. Affected legs will show as partial.`,
  resumePrompt: "You have a run in progress. Continue where you left off?",
  resumeYes: "Resume",
  resumeNo: "End run",
  preSyncChip: "Provisionally verified — syncing when you're back online",
  rankPending: "— (pending sync)",
  demotion: (flagNo: string) =>
    `The tap at flag ${flagNo} couldn't be verified, so this run is listed as unverified. Your times and track are saved.`,
  anchored: "You're anchored — your runs will count.",
  permLocation: "Always-on location lets your track record with the screen off.",
  permNfc: "Tapping flags proves you were there.",
  permBattery: "Keeps the system from stopping your run mid-forest.",
  emptyLeaderboard: "No verified runs yet — be the first name here.",
  reportFlag: "Flag missing or damaged? Report it and punch by QR or number.",
  preStart: "Tap the start flag to begin",
  punchButton: (flagNo: string) => `PUNCH — flag #${flagNo}`,
  scanning: "Hold phone to the flag",
  abandonPrompt: "Abandon run?",
} as const;
