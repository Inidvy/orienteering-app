import { useEffect, useState } from "react";
import { listReports, resolveReport } from "./api";
import type { Report } from "./supabase";

export function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const refresh = () => listReports().then(setReports).catch(() => {});
  useEffect(() => { refresh(); }, []);

  return (
    <div className="tab">
      <div className="panel wide">
        <h3>Open flag reports ({reports.length})</h3>
        {reports.length === 0 && <p className="hint">No open reports. Good.</p>}
        <ul className="list">
          {reports.map((r) => (
            <li key={r.id}>
              <span>flag {r.flag_id.slice(0, 8)}… · {new Date(r.created_at).toLocaleDateString()}
                {r.note ? ` · "${r.note}"` : ""}</span>
              <button onClick={async () => { await resolveReport(r.id); refresh(); }}>
                Resolve
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
