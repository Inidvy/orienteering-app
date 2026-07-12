// Convert an OOM .omap straight to WGS84 GeoJSON. The georeferencing (map
// scale, projected ref point, PROJ spec) is read FROM THE FILE, so any
// properly georeferenced .omap works (reworked 2026-07-12 for
// map/karlsruhe_10k.omap; previously hardcoded to the Hadiko export).
//
//   usage: node omap2geojson.mjs [path/to/file.omap]
//
// OMAP coords are 1/1000 mm of map paper:
//   metres = coord * scale / 1e6  ->  divisor = 1e6 / scale
//   e = ref_x + x/divisor ; n = ref_y - y/divisor ; then PROJ spec -> WGS84
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import proj4 from "proj4";

const dir = path.dirname(fileURLToPath(import.meta.url));
const OMAP =
  process.argv[2] ?? path.join(dir, "..", "..", "map", "karlsruhe_10k.omap");
const OUT = path.join(dir, "..", "..", "map", "derived", "hadiko.geojson");

const xml = fs.readFileSync(OMAP, "utf8");

// --- georeferencing from the file ---
const geo = xml.match(/<georeferencing\b[\s\S]*?<\/georeferencing>/);
if (!geo) throw new Error(`no <georeferencing> block in ${OMAP}`);
const mapScale = +geo[0].match(/<georeferencing[^>]*\bscale="(\d+)"/)[1];
const projSpec = geo[0]
  .match(/<projected_crs[\s\S]*?<spec[^>]*>([^<]*)<\/spec>/)[1]
  .trim();
const refMatch = geo[0].match(/<ref_point x="([-\d.]+)" y="([-\d.]+)"/);
const REF_E = +refMatch[1];
const REF_N = +refMatch[2];
const COORD_SCALE = 1e6 / mapScale; // 1:4000 -> 250, 1:10000 -> 100
const wgs = "+proj=longlat +datum=WGS84 +no_defs";
console.log(
  `georeferencing: 1:${mapScale}, ref ${REF_E}/${REF_N}, "${projSpec}"`,
);

const oomToLonLat = (x, y) => {
  const e = REF_E + x / COORD_SCALE;
  const n = REF_N - y / COORD_SCALE;
  const [lon, lat] = proj4(projSpec, wgs, [e, n]);
  return [lon, lat];
};

// --- symbol id -> code (objects reference symbols by their id attribute) ---
const codeById = new Map();
for (const m of xml.matchAll(/<symbol\b([^>]*)>/g)) {
  const attrs = m[1];
  const id = attrs.match(/\bid="(-?\d+)"/);
  const code = attrs.match(/\bcode="([^"]*)"/);
  if (id && code) codeById.set(+id[1], code[1]);
}

// --- render style FROM THE FILE, like OpenOrienteering Mapper (2026-07-12):
// the .omap carries the full color table (priority + RGB) and per-symbol
// color refs/line widths. Mapper paints colors bottom-up: LOWER priority is
// painted ON TOP (src/core/map_color.h). We embed per-feature fill/stroke/
// width/paint-order so renderers stop guessing colors from ISOM codes. ---
const colorByPrio = new Map();
for (const m of xml.matchAll(/<color priority="(\d+)"[^>]*>([\s\S]*?)<\/color>/g)) {
  const rgb = m[2].match(
    /<rgb[^>]*\br="([\d.]+)"[^>]*\bg="([\d.]+)"[^>]*\bb="([\d.]+)"/,
  );
  if (!rgb) continue;
  const hex =
    "#" +
    [rgb[1], rgb[2], rgb[3]]
      .map((v) => Math.round(+v * 255).toString(16).padStart(2, "0"))
      .join("");
  colorByPrio.set(+m[1], hex);
}

// pass 1: raw per-symbol info (combined symbols reference parts by id)
const rawById = new Map();
{
  // symbols nest (mid/sub symbols without id) — depth-scan top-level blocks
  const re = /<symbol\b[^>]*?(\/)?>|<\/symbol>/g;
  let m, depth = 0, start = -1, startTag = "";
  while ((m = re.exec(xml))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0 && start >= 0) {
        handleSymbol(startTag, xml.slice(start, re.lastIndex));
        start = -1;
      }
    } else if (m[1]) {
      if (depth === 0) handleSymbol(m[0], m[0]); // self-closing, no children
    } else {
      if (depth === 0) { start = m.index; startTag = m[0]; }
      depth++;
    }
  }
}

function handleSymbol(tag, block) {
  const id = tag.match(/\bid="(-?\d+)"/);
  if (!id) return;
  const type = +(tag.match(/\btype="(\d+)"/)?.[1] ?? 0);
  const rec = { type };
  if (type === 8) { rec.text = true; rawById.set(+id[1], rec); return; }
  const area = block.match(/<area_symbol[^>]*\binner_color="(-?\d+)"/);
  if (area && +area[1] >= 0) rec.fillPrio = +area[1];
  const line = block.match(
    /<line_symbol[^>]*\bcolor="(-?\d+)"[^>]*\bline_width="(\d+)"/,
  );
  if (line && +line[1] >= 0) { rec.strokePrio = +line[1]; rec.wMm = +line[2] / 1000; }
  // point symbols: dot color = inner_color — unless that's white (invisible
  // as a plain dot), then the outer ring color carries the symbol
  const pt = block.match(
    /<point_symbol[^>]*\binner_color="(-?\d+)"[^>]*\bouter_color="(-?\d+)"/,
  );
  if (rec.fillPrio == null && pt) {
    const inner = +pt[1], outer = +pt[2];
    const innerWhite = inner >= 0 && colorByPrio.get(inner) === "#ffffff";
    if (inner >= 0 && !innerWhite) rec.fillPrio = inner;
    else if (outer >= 0) rec.fillPrio = outer;
    else if (inner >= 0) rec.fillPrio = inner;
  }
  // combined symbols (e.g. water/building = area part + border-line part)
  const comb = block.match(/<combined_symbol[\s\S]*?<\/combined_symbol>/);
  if (comb) {
    rec.parts = [...comb[0].matchAll(/<part symbol="(-?\d+)"/g)].map((x) => +x[1]);
  }
  if (rec.fillPrio == null && rec.strokePrio == null && !rec.parts) {
    // patterned area: first plain color ref in the pattern
    const any = block.match(/\bcolor="(\d+)"/);
    if (any) rec.fillPrio = +any[1];
  }
  rawById.set(+id[1], rec);
}

// pass 2: resolve combined-symbol parts, then emit hex styles
function resolveRec(rec, depth = 0) {
  if (!rec.parts || depth > 3) return rec;
  for (const pid of rec.parts) {
    const part = rawById.get(pid);
    if (!part) continue;
    const pr = resolveRec(part, depth + 1);
    if (rec.fillPrio == null && pr.fillPrio != null) rec.fillPrio = pr.fillPrio;
    if (rec.strokePrio == null && pr.strokePrio != null) {
      rec.strokePrio = pr.strokePrio;
      rec.wMm = pr.wMm;
    }
  }
  return rec;
}

const styleById = new Map();
for (const [id, rec] of rawById) {
  if (rec.text) { styleById.set(id, { text: true }); continue; }
  resolveRec(rec);
  const prio = rec.fillPrio ?? rec.strokePrio;
  if (prio == null) continue;
  styleById.set(id, {
    c: rec.fillPrio != null ? colorByPrio.get(rec.fillPrio) ?? null : null,
    s: rec.strokePrio != null ? colorByPrio.get(rec.strokePrio) ?? null : null,
    // line width: mm on paper -> metres on the ground
    w: +(((rec.wMm ?? 0) * mapScale) / 1000).toFixed(2),
    z: 100 - prio, // low priority paints ON TOP -> higher z paints later
  });
}
console.log(`colors: ${colorByPrio.size}, symbol styles: ${styleById.size}`);

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
  const st = styleById.get(symIdx);
  if (st?.text) continue; // text labels don't render in the app
  features.push({
    type: "Feature",
    properties: { code, cls: prefix, ...(st ?? {}) },
    geometry,
  });
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
