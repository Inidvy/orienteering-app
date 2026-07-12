import { useEffect, useState } from "react";
import { createCourse, listCourses, listFlags } from "./api";

type Flag = Awaited<ReturnType<typeof listFlags>>[number];
type Course = Awaited<ReturnType<typeof listCourses>>[number];

export function CoursesTab() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState("");
  const [order, setOrder] = useState<string[]>([]); // flag ids, start..finish
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void (async () => {
      setFlags(await listFlags());
      setCourses(await listCourses());
    })();
  }, []);

  const toggle = (id: string) =>
    setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const save = async () => {
    setMsg("");
    if (!name.trim() || order.length < 2) {
      setMsg("Name it and pick at least a start and finish (in order).");
      return;
    }
    try {
      await createCourse(name.trim(), order);
      setMsg(`Course "${name}" created (${order.length} flags).`);
      setName("");
      setOrder([]);
      setCourses(await listCourses());
    } catch (e: any) {
      setMsg(e.message ?? "failed (are you an admin?)");
    }
  };

  const shortOf = (id: string) => flags.find((f) => f.id === id)?.short_code ?? "?";

  return (
    <div className="tab">
      <div className="panel wide">
        <h3>Create a course</h3>
        <input placeholder="course name" value={name}
          onChange={(e) => setName(e.target.value)} />
        <p className="hint">
          Click flags in run order: first = start, last = finish.
        </p>
        <div className="chips">
          {flags.map((f) => {
            const idx = order.indexOf(f.id);
            return (
              <button key={f.id}
                className={idx >= 0 ? "chip on" : "chip"}
                onClick={() => toggle(f.id)}>
                {idx >= 0 ? `${idx + 1}. ` : ""}#{f.short_code}
              </button>
            );
          })}
        </div>
        {order.length > 0 && (
          <p className="coord">Order: {order.map(shortOf).join(" → ")}</p>
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
