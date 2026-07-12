import fs from "node:fs";
const OMAP = new URL("../../map/Hadiko.omap", import.meta.url);
const xml = fs.readFileSync(OMAP, "utf8");
const xs = [], ys = [];
for (const m of xml.matchAll(/<coords[^>]*>([^<]*)<\/coords>/g)) {
  for (const pair of m[1].trim().split(";")) {
    if (!pair) continue;
    const p = pair.trim().split(/\s+/);
    const x = +p[0], y = +p[1];
    if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
  }
}
xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
const q = (arr, f) => arr[Math.floor((arr.length - 1) * f)];
const M = 0.004; // m per map unit
for (const p of [0, 0.01, 0.02, 0.05]) {
  const minX = q(xs, p), maxX = q(xs, 1 - p);
  const minY = q(ys, p), maxY = q(ys, 1 - p);
  console.log(
    `pct ${(p * 100).toFixed(0)}-${(100 - p * 100).toFixed(0)}: ` +
      `${((maxX - minX) * M).toFixed(0)} x ${((maxY - minY) * M).toFixed(0)} m ` +
      `x[${minX}..${maxX}] y[${minY}..${maxY}]`,
  );
}
console.log(`target image ground: 2069 x 2150 m  (n=${xs.length} coords)`);
