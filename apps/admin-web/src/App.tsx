import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Login } from "./Login";
import { FlagsTab } from "./FlagsTab";
import { CoursesTab } from "./CoursesTab";
import { ReportsTab } from "./ReportsTab";
import "./App.css";

type Tab = "flags" | "courses" | "reports";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>("flags");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!session) return <Login />;

  return (
    <div className="app">
      <header>
        <b className="brand">OL·KA admin</b>
        <nav>
          {(["flags", "courses", "reports"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <button className="out" onClick={() => supabase.auth.signOut()}>sign out</button>
      </header>
      {tab === "flags" && <FlagsTab />}
      {tab === "courses" && <CoursesTab />}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}
