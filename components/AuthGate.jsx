"use client";
import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(isSupabaseConfigured());
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // No Supabase configured = no auth, app runs in local-only mode
  if (!isSupabaseConfigured()) return children;

  if (checking) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0a0a",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}>
        <div style={{
          width: 32, height: 32, border: "2px solid rgba(255,255,255,0.1)",
          borderTopColor: "#fff", borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (session) return children;

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Account created. If email confirmation is on in Supabase, check your inbox. Otherwise just log in.");
        setMode("login");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', -apple-system, sans-serif"
    }}>
      <div style={{
        width: 380, maxWidth: "92vw",
        background: "#141414", borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.08)",
        padding: 36, boxShadow: "0 24px 80px rgba(0,0,0,0.7)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🗄️</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
            Media Vault
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#555" }}>
            {mode === "login" ? "Sign in to your vault" : "Create your vault account"}
          </p>
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          placeholder="Password"
          style={{ ...inputStyle, marginBottom: 18 }}
        />

        {error && (
          <div style={{
            fontSize: 12, color: "#ff6b6b", marginBottom: 14,
            background: "rgba(255,60,60,0.08)", borderRadius: 6, padding: "8px 12px"
          }}>{error}</div>
        )}
        {info && (
          <div style={{
            fontSize: 12, color: "#34A853", marginBottom: 14,
            background: "rgba(52,168,83,0.08)", borderRadius: 6, padding: "8px 12px"
          }}>{info}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={busy || !email.trim() || !password.trim()}
          style={{
            width: "100%", padding: 13,
            background: busy ? "#1a1a1a" : "#fff",
            color: busy ? "#444" : "#000",
            border: "none", borderRadius: 9,
            fontSize: 14, fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            marginBottom: 16
          }}
        >
          {busy ? "Working..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>

        <div style={{ textAlign: "center", fontSize: 12, color: "#555" }}>
          {mode === "login" ? (
            <>No account?{" "}
              <button onClick={() => { setMode("signup"); setError(""); }} style={linkBtn}>Sign up</button>
            </>
          ) : (
            <>Already have one?{" "}
              <button onClick={() => { setMode("login"); setError(""); }} style={linkBtn}>Sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "12px 14px",
  background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 9, color: "#fff", fontSize: 14,
  outline: "none", boxSizing: "border-box", marginBottom: 12
};

const linkBtn = {
  background: "none", border: "none", color: "#34A853",
  cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0
};
