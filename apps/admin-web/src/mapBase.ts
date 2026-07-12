import L from "leaflet";

// Georeferenced O-map raster (rendered from the .omap; served from /public).
export const OMAP_BOUNDS = {
  north: 49.02494891886377,
  south: 49.01128498434936,
  west: 8.419724904970776,
  east: 8.44085649624676,
};

/**
 * Set up base layers on a Leaflet map: OSM streets + the orienteering map as
 * an overlay, with a layer switch. Centres on the O-map. Returns the map.
 * The O-map is what you need to place controls accurately (OSM lacks the
 * vegetation/rock/path detail).
 */
export function setupBaseMap(elId: string): L.Map {
  const b = OMAP_BOUNDS;
  const map = L.map(elId, { zoomControl: true });

  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "© OpenStreetMap",
  });
  const omap = L.imageOverlay(
    "/omap.png",
    [
      [b.south, b.west],
      [b.north, b.east],
    ],
    { opacity: 1 },
  );

  osm.addTo(map);
  omap.addTo(map);
  L.control.layers(
    { OSM: osm },
    { "Orienteering map": omap },
    { collapsed: false },
  ).addTo(map);

  map.fitBounds([
    [b.south, b.west],
    [b.north, b.east],
  ]);
  return map;
}
