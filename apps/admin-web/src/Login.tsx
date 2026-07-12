import { useState } from "react";
import { supabase } from "./supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  const send = async () => {
    setMsg("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) setMsg(error.message);
    else setSent(true);
  };
  const verify = async () => {
    setMsg("");
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) setMsg(error.message);
    // on success, App re-renders via auth listener
  };

  return (
    <div className="login">
      <h1>OL-KA admin</h1>
      {!sent ? (
        <>
          <input placeholder="your email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <button onClick={send} disabled={!email}>Send code</button>
        </>
      ) : (
        <>
          <p>Enter the 6-digit code we emailed to {email}.</p>
          <input placeholder="123456" value={code}
            onChange={(e) => setCode(e.target.value)} />
          <button onClick={verify} disabled={code.length < 6}>Sign in</button>
        </>
      )}
      {msg && <p className="err">{msg}</p>}
      <p className="hint">
        First time? After signing in, ask for your account to be granted admin.
      </p>
    </div>
  );
}
