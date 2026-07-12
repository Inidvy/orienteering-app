import { useState } from "react";
import { supabase } from "./supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  const send = async () => {
    setMsg("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin, // click the link -> back here, logged in
      },
    });
    if (error) setMsg(error.message);
    else setSent(true);
  };

  return (
    <div className="login">
      <h1>OL-KA admin</h1>
      {!sent ? (
        <>
          <input placeholder="your email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <button onClick={send} disabled={!email}>Email me a sign-in link</button>
        </>
      ) : (
        <>
          <p>Check your inbox — we sent a sign-in link to <b>{email}</b>.</p>
          <p className="hint">
            Open it on this device (this browser). It'll bring you straight back
            here, signed in. If nothing happens, make sure the admin is running
            at this same address.
          </p>
        </>
      )}
      {msg && <p className="err">{msg}</p>}
    </div>
  );
}
