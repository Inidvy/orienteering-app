// Convert an OOM .omap (made by osm_to_omap.py) straight to WGS84 GeoJSON.
// The transform is exact and taken from that converter:
//   e = ref_e + x_oom / 250 ; n = ref_n - y_oom / 250   (COORD_SCALE=250)
//   then EPSG:32632 -> EPSG:4326
// No raster, no world file, no clicking — every feature at its true lat/lon.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import proj4 from "proj4";

const dir = path.dirname(fileURLToPath(import.meta.url));
const OMAP = path.join(dir, "..", "..", "map", "Hadiko.omap");
const OUT = path.join(dir, "..", "..", "map", "derived", "hadiko.geojson");

const REF_E = 456796.202;
const REF_N = 5431464.651;
const COORD_SCALE = 250;
const utm = "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs";
const wgs = "+proj=longlat +datum=WGS84 +no_defs";

const oomToLonLat = (x, y) => {
  const e = REF_E + x / COORD_SCALE;
  const n = REF_N - y / COORD_SCALE;
  const [lon, lat] = proj4(utm, wgs, [e, n]);
  return [lon, lat];
};

const xml = fs.readFileSync(OMAP, "utf8");

// --- symbol id -> code (objects reference symbols by their id attribute) ---
const codeById = new Map();
for (const m of xml.matchAll(/<symbol\b([^>]*)>/g)) {
  const attrs = m[1];
  const id = attrs.match(/\bid="(-?\d+)"/);
  const code = attrs.match(/\bcode="([^"]*)"/);
  if (id && code) codeById.set(+id[1], code[1]);
}

// --- objects ---
const features = [];
const byPrefix = {};
for (const m of xml.matchAll(
  /<object\b[^>]*\bsymbol="(-?\d+)"[^>]*>([\s\S]*?)<\/object>/g,
)) {
  const symIdx = +m[1];
  const code = codeById.get(symIdx) ?? "?";
  const prefix = code.split(".")[0].slice(0, 1); // 1..5 class
  const cm = m[2].match(/<coords[^>]*>([^<]*)<\/coords>/);
  if (!cm) continue;
  const raw = cm[1].trim().split(";").filter(Boolean);
  const ring = [];
  let closed = false;
  for (const c of raw) {
    const p = c.trim().split(/\s+/);
    const x = +p[0], y = +p[1];
    const flag = p[2] ? +p[2] : 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    ring.push(oomToLonLat(x, y));
    if (flag & 2) closed = true; // ClosePoint bit
  }
  if (ring.length === 0) continue;

  let geometry;
  if (ring.length === 1) {
    geometry = { type: "Point", coordinates: ring[0] };
  } else if (closed || sameXY(ring[0], ring[ring.length - 1])) {
    if (!sameXY(ring[0], ring[ring.length - 1])) ring.push(ring[0]);
    geometry = { type: "Polygon", coordinates: [ring] };
  } else {
    geometry = { type: "LineString", coordinates: ring };
  }
  features.push({ type: "Feature", properties: { code, cls: prefix }, geometry });
  byPrefix[prefix] = (byPrefix[prefix] ?? 0) + 1;
}

function sameXY(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

// bounds
let W = Infinity, S = Infinity, E = -Infinity, N = -Infinity;
for (const f of features) {
  const walk = (c) =>
    typeof c[0] === "number"
      ? ((W = Math.min(W, c[0])), (E = Math.max(E, c[0])),
         (S = Math.min(S, c[1])), (N = Math.max(N, c[1])))
      : c.forEach(walk);
  walk(f.geometry.coordinates);
}

const fc = {
  type: "FeatureCollection",
  bbox: [W, S, E, N],
  features,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(fc));
console.log(`symbols with id+code: ${codeById.size}, features: ${features.length}`);
console.log("by class:", byPrefix);
console.log(`bounds WGS84: W ${W.toFixed(5)} S ${S.toFixed(5)} E ${E.toFixed(5)} N ${N.toFixed(5)}`);
console.log(`center: ${((S + N) / 2).toFixed(5)}, ${((W + E) / 2).toFixed(5)}  (Hadiko ref 49.03455, 8.40891)`);
console.log(`file: ${OUT}  (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
