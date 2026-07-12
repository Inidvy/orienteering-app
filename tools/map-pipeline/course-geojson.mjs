// Extract a SMALL GeoJSON for one area (course bbox + margin) so the app can
// render it as crisp VECTOR (zoom/rotate without blur), instead of a raster.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const GJ = path.join(dir, "..", "..", "map", "derived", "hadiko.geojson");
const OUT = path.join(dir, "..", "..", "apps", "mobile", "assets", "hadiko-area.json");

// demo course area (Karlsruhe) — centre + half-size metres
const CENTER = { lat: 49.0184, lon: 8.4289 };
const HALF = 450;
const dLat = HALF / 111132;
const dLon = HALF / (111320 * Math.cos((CENTER.lat * Math.PI) / 180));
const W = CENTER.lon - dLon, E = CENTER.lon + dLon;
const S = CENTER.lat - dLat, N = CENTER.lat + dLat;

const fc = JSON.parse(fs.readFileSync(GJ, "utf8"));
const inBox = ([lo, la]) => lo >= W && lo <= E && la >= S && la <= N;
const anyIn = (c) => (typeof c[0] === "number" ? inBox(c) : c.some(anyIn));
// round coords to 6 dp to shrink the file
const round = (c) =>
  typeof c[0] === "number" ? [+c[0].toFixed(6), +c[1].toFixed(6)] : c.map(round);

// Douglas-Peucker vertex simplification (~0.7 m tolerance) — the 1:4000 base
// map carries survey-level vertex density that SVG rendering on a phone
// doesn't need; this cuts most vertices without visible change at run zoom.
const TOL = 0.7 / 111132; // degrees latitude ≈ metres/111132
const sqSegDist = (p, a, b) => {
  let [x, y] = a;
  let dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
};
const dp = (pts, first, last, tol2, keep) => {
  let maxD = 0, idx = -1;
  for (let i = first + 1; i < last; i++) {
    const d = sqSegDist(pts[i], pts[first], pts[last]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol2) {
    keep[idx] = true;
    dp(pts, first, idx, tol2, keep);
    dp(pts, idx, last, tol2, keep);
  }
};
const simplifyRing = (pts) => {
  if (pts.length <= 4) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  dp(pts, 0, pts.length - 1, TOL * TOL, keep);
  return pts.filter((_, i) => keep[i]);
};
const simplify = (geom) => {
  if (geom.type === "LineString")
    return { ...geom, coordinates: simplifyRing(geom.coordinates) };
  if (geom.type === "Polygon")
    return { ...geom, coordinates: geom.coordinates.map(simplifyRing) };
  return geom;
};

let vBefore = 0, vAfter = 0;
const countV = (c) => (typeof c[0] === "number" ? 1 : c.reduce((s, x) => s + countV(x), 0));

const features = fc.features
  .filter((f) => anyIn(f.geometry.coordinates))
  .map((f) => {
    vBefore += countV(f.geometry.coordinates);
    const geometry = simplify(f.geometry);
    vAfter += countV(geometry.coordinates);
    const p = f.properties;
    return {
      type: "Feature",
      // c/s/w/z = fill, stroke, width (m), paint order — extracted from the
      // .omap's own color/symbol tables (see omap2geojson.mjs)
      properties: { code: p.code, c: p.c ?? null, s: p.s ?? null, w: p.w ?? 0, z: p.z ?? 0 },
      geometry: { type: geometry.type, coordinates: round(geometry.coordinates) },
    };
  });
console.log(`vertices: ${vBefore} -> ${vAfter} (DP ~0.7 m)`);

const out = {
  type: "FeatureCollection",
  meta: { center: CENTER, west: W, east: E, south: S, north: N },
  features,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${features.length} features -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
