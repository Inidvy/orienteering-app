// Public web host for QR plates + landing page. Change here if the domain
// ever moves; QR plates encode https://<HOST>/f/<UFID>.
export const WEB_HOST = "ol-ka.de";

export interface ScannedPunch {
  /** the token to resolve to a flag: a UFID (letters) or a short number */
  token: string;
  kind: "ufid" | "number" | "unknown";
}

/**
 * Parse a scanned QR / typed value.
 *   https://ol-ka.de/f/URHNCL  -> { token:"URHNCL", kind:"ufid" }
 *   URHNCL                     -> { token:"URHNCL", kind:"ufid" }
 *   4                          -> { token:"4",      kind:"number" }
 */
export function parseScan(raw: string): ScannedPunch {
  const s = raw.trim();
  // URL form: .../f/<UFID>
  const m = s.match(/\/f\/([A-Za-z0-9]+)/);
  if (m) return { token: m[1]!.toUpperCase(), kind: "ufid" };
  if (/^\d{1,4}$/.test(s)) return { token: s, kind: "number" };
  if (/^[A-Za-z]{4,10}$/.test(s)) return { token: s.toUpperCase(), kind: "ufid" };
  return { token: s, kind: "unknown" };
}
