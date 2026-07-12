// Map-based course builder: flags shown as pins on the O-map; click them in
// run order (start..finish) to build the course. Numbered as you go, with the
// legs drawn between them.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createCourse, listCourses, listFlags } from "./api";
import { setupBaseMap } from "./mapBase";

type Flag = Awaited<ReturnType<typeof listFlags>>[number];
type Course = Awaited<ReturnType<typeof listCourses>>[number];

export function CoursesTab() {
  const mapRef = useRef<L.Map | null>(null);
  const pinLayer = useRef<L.LayerGroup | null>(null);
  const legLayer = useRef<L.LayerGroup | null>(null);
  const flagsRef = useRef<Flag[]>([]);
  const orderRef = useRef<string[]>([]);

  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  const draw = () => {
    const flags = flagsRef.current;
    const order = orderRef.current;
    const pins = pinLayer.current!;
    const legs = legLayer.current!;
    pins.clearLayers();
    legs.clearLayers();
    // legs
    const pts = order
      .map((id) => flags.find((f) => f.id === id))
      .filter(Boolean)
      .map((f) => [f!.lat, f!.lon] as [number, number]);
    if (pts.length > 1) L.polyline(pts, { color: "#d10f7c", weight: 3 }).addTo(legs);
    // pins
    for (const f of flags) {
      if (!f.lat) continue;
      const idx = order.indexOf(f.id);
      const marker = L.circleMarker([f.lat, f.lon], {
        radius: idx >= 0 ? 11 : 7,
        color: "#d10f7c",
        fillColor: idx >= 0 ? "#d10f7c" : "#fff",
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(idx >= 0 ? `${idx + 1}. ${f.ufid}` : f.ufid, {
          permanent: idx >= 0,
          direction: "top",
        })
        .addTo(pins);
      marker.on("click", () => {
        const o = orderRef.current;
        orderRef.current = o.includes(f.id) ? o.filter((x) => x !== f.id) : [...o, f.id];
        setOrder([...orderRef.current]);
        draw();
      });
    }
  };

  useEffect(() => {
    const map = setupBaseMap("coursemap");
    mapRef.current = map;
    pinLayer.current = L.layerGroup().addTo(map);
    legLayer.current = L.layerGroup().addTo(map);
    void (async () => {
      flagsRef.current = await listFlags();
      setCourses(await listCourses());
      draw();
    })();
    return () => {
      map.remove();
    };
  }, []);

  const save = async () => {
    setMsg("");
    if (!name.trim() || order.length < 2) {
      setMsg("Name it and click at least a start and finish (in order).");
      return;
    }
    try {
      await createCourse(name.trim(), order);
      setMsg(`Course "${name}" created (${order.length} flags).`);
      setName("");
      orderRef.current = [];
      setOrder([]);
      draw();
      setCourses(await listCourses());
    } catch (e: any) {
      setMsg(e.message ?? "failed (are you an admin?)");
    }
  };

  const ufidOf = (id: string) => flagsRef.current.find((f) => f.id === id)?.ufid ?? "?";

  return (
    <div className="tab">
      <div id="coursemap" className="map" />
      <div className="panel">
        <h3>Create a course</h3>
        <input placeholder="course name" value={name}
          onChange={(e) => setName(e.target.value)} />
        <p className="hint">
          Click flags on the map in run order: first = start, last = finish.
          Click a flag again to remove it.
        </p>
        {order.length > 0 && (
          <p className="coord">{order.map(ufidOf).join(" → ")}</p>
        )}
        <button onClick={save} disabled={order.length < 2 || !name.trim()}>
          Create course
        </button>
        {msg && <p className="ok">{msg}</p>}
        <h3>Courses ({courses.length})</h3>
        <ul className="list">
          {courses.map((c) => <li key={c.id}>{c.name}</li>)}
        </ul>
      </div>
    </div>
  );
}
