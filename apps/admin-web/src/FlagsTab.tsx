import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createFlag, deleteFlag, listFlagUsage, listFlags } from "./api";
import { Plate } from "./Plate";
import { setupBaseMap } from "./mapBase";

type Flag = Awaited<ReturnType<typeof listFlags>>[number];

export function FlagsTab() {
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const newMarkerRef = useRef<L.Marker | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [usage, setUsage] = useState<Record<string, string[]>>({});
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [plate, setPlate] = useState<string | null>(null); // UFID to sticker

  const refresh = async () => {
    const [f, u] = await Promise.all([listFlags(), listFlagUsage()]);
    setFlags(f);
    setUsage(u);
    const layer = layerRef.current!;
    layer.clearLayers();
    for (const fl of f) {
      if (!fl.lat) continue;
      L.circleMarker([fl.lat, fl.lon], { radius: 8, color: "#d10f7c", fillOpacity: 0.6 })
        .bindTooltip(fl.ufid, { permanent: true, direction: "top", className: "flabel" })
        .addTo(layer);
    }
  };

  useEffect(() => {
    const map = setupBaseMap("flagmap");
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
    if (!picked) return;
    try {
      const { ufid } = await createFlag(picked.lat, picked.lon);
      setMsg(`Created flag ${ufid}`);
      setPlate(ufid); // show the printable sticker at once
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
        <p className="hint">Click the map where the flag stands, then create it. It gets a 4-letter code automatically.</p>
        {picked && (
          <p className="coord">{picked.lat.toFixed(5)}, {picked.lon.toFixed(5)}</p>
        )}
        <button onClick={save} disabled={!picked}>
          Create flag here
        </button>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
        <h3>Flags ({flags.length})</h3>
        <ul className="list">
          {flags.map((f) => {
            const inCourses = usage[f.id] ?? [];
            const used = inCourses.length > 0;
            return (
              <li key={f.id}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <code>{f.ufid}</code>
                  {used && (
                    <span className="usage">in {inCourses.join(", ")}</span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="chip" onClick={() => setPlate(f.ufid)}>sticker</button>
                  <button
                    className="chip danger"
                    title={used ? `Used in ${inCourses.join(", ")}` : "delete flag"}
                    onClick={async () => {
                      setErr("");
                      if (used) {
                        setErr(
                          `${f.ufid} is used in ${inCourses.join(", ")}. Remove it from ` +
                            `${inCourses.length > 1 ? "those courses" : "that course"} first, then delete it.`,
                        );
                        return;
                      }
                      if (!confirm(`Delete flag ${f.ufid}? This can't be undone.`)) return;
                      try { await deleteFlag(f.id); await refresh(); }
                      catch (e: any) { setErr(e.message ?? "Can't delete (flag has recorded runs?)"); }
                    }}
                  >
                    delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {plate && <Plate code={plate} onClose={() => setPlate(null)} />}
    </div>
  );
}
