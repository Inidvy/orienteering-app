// Map-based course builder: flags shown as pins on the O-map; click them in
// run order (start..finish) to build the course. Numbered as you go, with the
// legs drawn between them.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createCourse, deleteCourse, listCourses, listFlags } from "./api";
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
      // every position this flag occupies in the order (butterfly = multiple)
      const positions = order
        .map((id, i) => (id === f.id ? i + 1 : 0))
        .filter(Boolean);
      const used = positions.length > 0;
      const marker = L.circleMarker([f.lat, f.lon], {
        radius: used ? 11 : 7,
        color: "#d10f7c",
        fillColor: used ? "#d10f7c" : "#fff",
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(used ? `${positions.join(",")} · ${f.ufid}` : f.ufid, {
          permanent: true,
          direction: "top",
          className: "flabel",
        })
        .addTo(pins);
      // APPEND on click — a flag may be added multiple times (butterfly loops,
      // where a central control is visited more than once).
      marker.on("click", () => {
        orderRef.current = [...orderRef.current, f.id];
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

  const remove = async (c: Course) => {
    const warning =
      `⚠  Delete the course "${c.name}"?\n\n` +
      `This permanently removes the course. It disappears from the app and ` +
      `nobody can run it again. The flags themselves stay on the map.\n\n` +
      `This cannot be undone.`;
    if (!confirm(warning)) return;
    setMsg("");
    try {
      await deleteCourse(c.id);
      setCourses(await listCourses());
      setMsg(`Deleted course "${c.name}".`);
    } catch (e: any) {
      setMsg(
        e?.code === "23503" || /foreign key|violates/i.test(e?.message ?? "")
          ? `Can't delete "${c.name}" — runs have already been recorded on it.`
          : e?.message ?? "failed (are you an admin?)",
      );
    }
  };

  return (
    <div className="tab">
      <div id="coursemap" className="map" />
      <div className="panel">
        <h3>Create a course</h3>
        <input placeholder="course name" value={name}
          onChange={(e) => setName(e.target.value)} />
        <p className="hint">
          Click flags on the map in run order: first = start, last = finish.
          Click the same flag again to visit it twice (butterfly loops).
        </p>
        {order.length > 0 && (
          <div className="chips">
            {order.map((id, i) => (
              <button key={i} className="chip on" title="remove"
                onClick={() => {
                  orderRef.current = orderRef.current.filter((_, j) => j !== i);
                  setOrder([...orderRef.current]);
                  draw();
                }}>
                {i + 1}. {ufidOf(id)} ✕
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={order.length < 2 || !name.trim()}>
            Create course
          </button>
          <button className="chip" disabled={!order.length}
            onClick={() => { orderRef.current = []; setOrder([]); draw(); }}>
            clear
          </button>
        </div>
        {msg && <p className="ok">{msg}</p>}
        <h3>Courses ({courses.length})</h3>
        <ul className="list">
          {courses.map((c) => (
            <li key={c.id}>
              <span>{c.name}</span>
              <button className="chip danger" onClick={() => remove(c)}>delete</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
