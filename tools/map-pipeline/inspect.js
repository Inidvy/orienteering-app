// Inspect the OCAD file: version, scale, georeferencing, bounds, symbol count.
const { readOcad } = require("ocad2geojson");
const path = require("path");

const file = path.resolve(__dirname, "../../map/CampusSüd5000ocd8.ocd");

readOcad(file)
  .then((ocad) => {
    const h = ocad.header;
    console.log("OCAD version:", h.version, "subversion:", h.subVersion);
    const setup = ocad.parameterStrings?.[1039] ?? null; // scale/georef param
    console.log("scale param (1039):", JSON.stringify(setup));
    console.log("objects:", ocad.objects.length);
    console.log("symbols:", ocad.symbols.length);
    // bounds in map coords
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of ocad.objects) {
      for (const c of o.coordinates ?? []) {
        const x = c.x ?? c[0], y = c.y ?? c[1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    console.log("map-coord bounds:", { minX, minY, maxX, maxY });
  })
  .catch((e) => {
    console.error("PARSE FAILED:", e.message);
    process.exit(1);
  });
