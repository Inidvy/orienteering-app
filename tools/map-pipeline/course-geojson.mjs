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

const features = fc.features
  .filter((f) => anyIn(f.geometry.coordinates))
  .map((f) => ({
    type: "Feature",
    properties: { code: f.properties.code },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  }));

const out = {
  type: "FeatureCollection",
  meta: { center: CENTER, west: W, east: E, south: S, north: N },
  features,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${features.length} features -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
