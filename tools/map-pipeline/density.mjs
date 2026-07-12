import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.dirname(fileURLToPath(import.meta.url));
const fc = JSON.parse(
  fs.readFileSync(path.join(dir, "..", "..", "map", "derived", "hadiko.geojson"), "utf8"),
);
// grid histogram of feature centroids at ~0.002 deg (~150m) cells
const cells = new Map();
const walk = (c, f) => (typeof c[0] === "number" ? f(c) : c.forEach((x) => walk(x, f)));
for (const ft of fc.features) {
  let sx = 0, sy = 0, k = 0;
  walk(ft.geometry.coordinates, ([lo, la]) => { sx += lo; sy += la; k++; });
  if (!k) continue;
  const lo = sx / k, la = sy / k;
  const key = `${(la / 0.002 | 0)},${(lo / 0.002 | 0)}`;
  const cur = cells.get(key) ?? { n: 0, lo: 0, la: 0 };
  cur.n++; cur.lo += lo; cur.la += la;
  cells.set(key, cur);
}
const top = [...cells.values()]
  .map((c) => ({ n: c.n, lat: c.la / c.n, lon: c.lo / c.n }))
  .sort((a, b) => b.n - a.n)
  .slice(0, 8);
console.log("densest ~150m cells (feature count, center):");
for (const t of top) console.log(`  ${t.n}\t${t.lat.toFixed(5)}, ${t.lon.toFixed(5)}`);
// weighted centroid of all features
let sx = 0, sy = 0, k = 0;
for (const ft of fc.features)
  walk(ft.geometry.coordinates, ([lo, la]) => { sx += lo; sy += la; k++; });
console.log(`\nvertex centroid: ${(sy / k).toFixed(5)}, ${(sx / k).toFixed(5)}`);
