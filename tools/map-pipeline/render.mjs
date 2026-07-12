// Render the georeferenced GeoJSON to a styled O-map PNG at a known WGS84 bbox.
// We control the extent, so placement in the app is exact (no world-file guess).
// Outliers trimmed to the dense campus cluster via a percentile bbox.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));
const GJ = path.join(dir, "..", "..", "map", "derived", "hadiko.geojson");
const OUT_PNG = path.join(dir, "..", "..", "apps", "admin-web", "public", "omap.png");
const OUT_BOUNDS = path.join(dir, "..", "..", "apps", "admin-web", "public", "omap-bounds.json");

const fc = JSON.parse(fs.readFileSync(GJ, "utf8"));

// Content extent via percentile trim of vertices (drops far strays). This
// covers the whole mapped area; the app crops to a course's flags at runtime.
const lons = [], lats = [];
const walk0 = (c, f) =>
  typeof c[0] === "number" ? f(c) : c.forEach((x) => walk0(x, f));
for (const ft of fc.features) walk0(ft.geometry.coordinates, ([lo, la]) => {
  lons.push(lo); lats.push(la);
});
lons.sort((a, b) => a - b); lats.sort((a, b) => a - b);
const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
const W = q(lons, 0.02), E = q(lons, 0.98);
const S = q(lats, 0.02), N = q(lats, 0.98);

// pixel canvas: keep aspect ratio, ~2000px on the long side
const midLat = (S + N) / 2;
const mPerDegLon = 111320 * Math.cos((midLat * Math.PI) / 180);
const groundW = (E - W) * mPerDegLon;
const groundH = (N - S) * 111132;
const LONG = 2200;
const PW = groundW >= groundH ? LONG : Math.round((LONG * groundW) / groundH);
const PH = groundW >= groundH ? Math.round((LONG * groundH) / groundW) : LONG;

const px = (lon) => ((lon - W) / (E - W)) * PW;
const py = (lat) => ((N - lat) / (N - S)) * PH; // north up

// ISOM/ISSprOM-ish colors by symbol code
function styleFor(code) {
  const c = code;
  const cls = c[0];
  // water
  if (cls === "3") return { fill: "#00c8ff", stroke: "#00a0d8", w: 1 };
  // vegetation greens / open yellow
  if (c.startsWith("401") || c.startsWith("403")) return { fill: "#ffd24d", stroke: null };
  if (c.startsWith("406")) return { fill: "#c8f0b0", stroke: null };
  if (c.startsWith("408")) return { fill: "#8fd96f", stroke: null };
  if (c.startsWith("410") || c.startsWith("411") || c.startsWith("413"))
    return { fill: "#3fb24a", stroke: null };
  if (cls === "4") return { fill: "#dff0d0", stroke: null };
  // man-made: buildings dark, walls/fences/paths black lines, paved grey
  if (c.startsWith("521") || c.startsWith("526")) return { fill: "#7a7a7a", stroke: "#333", w: 1 };
  if (c.startsWith("520") || c.startsWith("501.7") || c.startsWith("501.8"))
    return { fill: "#c9b79c", stroke: null }; // paved / area
  if (cls === "5") return { fill: null, stroke: "#1a1a1a", w: 2 }; // walls, fences, paths, roads
  // landforms brown, rock black
  if (cls === "1") return { fill: null, stroke: "#b06a2c", w: 1.5 };
  if (cls === "2") return { fill: "#000", stroke: "#000", w: 1 };
  return { fill: null, stroke: "#888", w: 1 };
}

function ptsOf(coords) {
  return coords.map(([lo, la]) => `${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join(" ");
}

const parts = [];
// paint order: areas (veg/paved) first, then water, then lines/buildings
const order = (f) => {
  const c = f.properties.code;
  if (c[0] === "4") return 0;
  if (c.startsWith("520") || c.startsWith("501.7") || c.startsWith("501.8")) return 1;
  if (c[0] === "3") return 2;
  if (c.startsWith("521") || c.startsWith("526")) return 3;
  return 4;
};
// keep only features with at least one vertex inside the box (perf + relevance)
const inBox = ([lo, la]) => lo >= W && lo <= E && la >= S && la <= N;
const anyIn = (c) =>
  typeof c[0] === "number" ? inBox(c) : c.some((x) => anyIn(x));
const kept = fc.features.filter((f) => anyIn(f.geometry.coordinates));
const sorted = kept.sort((a, b) => order(a) - order(b));

for (const f of sorted) {
  const st = styleFor(f.properties.code);
  const g = f.geometry;
  if (g.type === "Polygon") {
    const pts = ptsOf(g.coordinates[0]);
    parts.push(
      `<polygon points="${pts}" fill="${st.fill ?? "none"}" ` +
        `stroke="${st.stroke ?? "none"}" stroke-width="${st.w ?? 0}"/>`,
    );
  } else if (g.type === "LineString") {
    const pts = ptsOf(g.coordinates);
    parts.push(
      `<polyline points="${pts}" fill="none" stroke="${st.stroke ?? "#888"}" ` +
        `stroke-width="${st.w ?? 1}" stroke-linejoin="round" stroke-linecap="round"/>`,
    );
  } else if (g.type === "Point") {
    const [lo, la] = g.coordinates;
    parts.push(
      `<circle cx="${px(lo).toFixed(1)}" cy="${py(la).toFixed(1)}" r="2" ` +
        `fill="${st.fill ?? st.stroke ?? "#000"}"/>`,
    );
  }
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" ` +
  `viewBox="0 0 ${PW} ${PH}"><rect width="${PW}" height="${PH}" fill="#ffffff"/>` +
  parts.join("") +
  `</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT_PNG);
const bounds = { north: N, south: S, west: W, east: E, width: PW, height: PH };
fs.writeFileSync(OUT_BOUNDS, JSON.stringify(bounds, null, 2) + "\n");
console.log(`rendered ${PW}x${PH}px, ${sorted.length} features`);
console.log(`ground ~${groundW.toFixed(0)} x ${groundH.toFixed(0)} m`);
console.log(`bounds`, bounds);
console.log(`png ${(fs.statSync(OUT_PNG).size / 1024).toFixed(0)} KB`);
