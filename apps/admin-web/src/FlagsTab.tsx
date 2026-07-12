import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createFlag, listFlags } from "./api";
import { Plate } from "./Plate";

type Flag = Awaited<ReturnType<typeof listFlags>>[number];

export function FlagsTab() {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const newMarkerRef = useRef<L.Marker | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [shortCode, setShortCode] = useState("");
  const [msg, setMsg] = useState("");
  const [plate, setPlate] = useState<string | null>(null); // flag number to sticker

  const refresh = async () => {
    const f = await listFlags();
    setFlags(f);
    const layer = layerRef.current!;
    layer.clearLayers();
    for (const fl of f) {
      if (!fl.lat) continue;
      L.circleMarker([fl.lat, fl.lon], { radius: 8, color: "#d10f7c", fillOpacity: 0.6 })
        .bindTooltip(`#${fl.short_code} · ${fl.ufid}`)
        .addTo(layer);
    }
  };

  useEffect(() => {
    const map = L.map("flagmap").setView([49.0184, 8.4289], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      setPicked({ lat: e.latlng.lat, lon: e.latlng.lng });
      if (newMarkerRef.current) newMarkerRef.current.remove();
      newMarkerRef.current = L.marker(e.latlng).addTo(map);
    });
    mapRef.current = map;
    void refresh();
    return () => {
      map.remove();
    };
  }, []);

  const save = async () => {
    setMsg("");
    if (!picked || !shortCode.trim()) return;
    try {
      const sc = shortCode.trim();
      await createFlag(sc, picked.lat, picked.lon);
      setMsg(`Created flag #${sc}`);
      setPlate(sc); // show the printable sticker at once
      setShortCode("");
      setPicked(null);
      newMarkerRef.current?.remove();
      await refresh();
    } catch (e: any) {
      setMsg(e.message ?? "failed (are you an admin?)");
    }
  };

  return (
    <div className="tab">
      <div id="flagmap" className="map" />
      <div className="panel">
        <h3>Add a flag</h3>
        <p className="hint">Click the map to place it, then give it a number.</p>
        {picked && (
          <p className="coord">{picked.lat.toFixed(5)}, {picked.lon.toFixed(5)}</p>
        )}
        <input placeholder="short number (e.g. 31)" value={shortCode}
          onChange={(e) => setShortCode(e.target.value)} />
        <button onClick={save} disabled={!picked || !shortCode.trim()}>
          Create flag
        </button>
        {msg && <p className="ok">{msg}</p>}
        <h3>Flags ({flags.length})</h3>
        <ul className="list">
          {flags.map((f) => (
            <li key={f.id}>
              <span>#{f.short_code}</span>
              <button className="chip" onClick={() => setPlate(f.short_code)}>
                sticker
              </button>
            </li>
          ))}
        </ul>
      </div>
      {plate && <Plate code={plate} onClose={() => setPlate(null)} />}
    </div>
  );
}
