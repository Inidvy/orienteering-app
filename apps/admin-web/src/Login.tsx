import { useState } from "react";
import { supabase } from "./supabase";

// Username + password login (no email verification). "adminjannik" maps to the
// account adminjannik@ol-ka.de; a full email is also accepted.
export function Login() {
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setMsg("");
    setBusy(true);
    const email = user.includes("@") ? user.trim() : `${user.trim()}@ol-ka.de`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setMsg(error.message);
    setBusy(false);
  };

  return (
    <div className="login">
      <h1>OL-KA admin</h1>
      <input placeholder="username" autoCapitalize="none" value={user}
        onChange={(e) => setUser(e.target.value)} />
      <input placeholder="password" type="password" value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && signIn()} />
      <button onClick={signIn} disabled={!user || !pw || busy}>
        {busy ? "…" : "Sign in"}
      </button>
      {msg && <p className="err">{msg}</p>}
    </div>
  );
}
