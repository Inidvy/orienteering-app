// Derive the exported PNG's geographic corners from the .omap georeferencing.
// grivation=0 (no attribute) => map axes parallel to UTM, north-up. Ref point
// is map-coord (0,0) -> UTM (456796.202, 5431464.651). 1 map unit (1/1000 mm)
// = scale/1e6 m ground = 4000/1e6 = 0.004 m.
import fs from "node:fs";
import proj4 from "proj4";

const OMAP = new URL("../../map/Hadiko.omap", import.meta.url);
const PGW = new URL("../../map/export_300dpi.pgw", import.meta.url);
const PNG = new URL("../../map/export_300dpi.png", import.meta.url);

const utm = "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs";
const wgs = "+proj=longlat +datum=WGS84 +no_defs";

const REF_UTM = { e: 456796.202, n: 5431464.651 };
const M_PER_MAPUNIT = 0.004; // scale 4000 / 1e6

// --- PNG dimensions ---
const png = fs.readFileSync(PNG);
const W = png.readUInt32BE(16);
const H = png.readUInt32BE(20);

// --- world file: pixel size (trust scale & rotation, ignore its origin) ---
const pgw = fs.readFileSync(PGW, "utf8").trim().split(/\s+/).map(Number);
const [pxSizeX, , , pxSizeYneg] = pgw;
const mPerPx = pxSizeX; // 0.3386667
console.log(`PNG ${W}x${H}px  pixel=${mPerPx} m  (rot ${pgw[1]},${pgw[2]})`);

// --- object bounding box in map coordinates ---
const xml = fs.readFileSync(OMAP, "utf8");
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
let coordCount = 0;
for (const m of xml.matchAll(/<coords[^>]*>([^<]*)<\/coords>/g)) {
  for (const pair of m[1].trim().split(";")) {
    if (!pair) continue;
    const parts = pair.trim().split(/\s+/);
    const x = +parts[0], y = +parts[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    coordCount++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
console.log(`coords parsed: ${coordCount}`);
console.log(`map bbox: x[${minX}..${maxX}] y[${minY}..${maxY}]`);

const bboxWmap = maxX - minX;
const bboxHmap = maxY - minY;
const bboxWm = bboxWmap * M_PER_MAPUNIT;
const bboxHm = bboxHmap * M_PER_MAPUNIT;
console.log(`map bbox ground: ${bboxWm.toFixed(1)} x ${bboxHm.toFixed(1)} m`);
console.log(`image ground:    ${(W * mPerPx).toFixed(1)} x ${(H * mPerPx).toFixed(1)} m`);
console.log(
  `ratio img/bbox: ${(W * mPerPx / bboxWm).toFixed(3)} x ${(H * mPerPx / bboxHm).toFixed(3)}`,
);

// map coord -> UTM (grivation 0). OMAP y is +DOWN (screen), north is -y.
const toUtm = (mx, my) => ({
  e: REF_UTM.e + mx * M_PER_MAPUNIT,
  n: REF_UTM.n - my * M_PER_MAPUNIT,
});

// image top-left = (minX map, minY map) since y+ is down => top of image is min y
const tlUtm = toUtm(minX, minY);
const brUtm = toUtm(maxX, maxY);
const [wlon, nlat] = proj4(utm, wgs, [tlUtm.e, tlUtm.n]);
const [elon, slat] = proj4(utm, wgs, [brUtm.e, brUtm.n]);
const [clon, clat] = proj4(utm, wgs, [
  (tlUtm.e + brUtm.e) / 2,
  (tlUtm.n + brUtm.n) / 2,
]);

const bounds = {
  north: nlat, south: slat, west: wlon, east: elon,
  center: { lat: clat, lon: clon },
};
console.log("\nGEO BOUNDS (WGS84):");
console.log(JSON.stringify(bounds, null, 2));
console.log(
  `\ncenter vs ref_point_deg (49.03454835, 8.40891000): ` +
    `Δlat=${(clat - 49.03454835).toFixed(5)} Δlon=${(clon - 8.40891).toFixed(5)}`,
);

fs.writeFileSync(
  new URL("../../map/Hadiko.bounds.json", import.meta.url),
  JSON.stringify(bounds, null, 2) + "\n",
);
