"use client";

import { invokeAI } from "@/lib/api";
import { useState } from "react";

function randomPassword() {
  return "GURU-" + Math.random().toString(36).slice(2, 8);
}

export function CreateBetaAccount() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [role, setRole] = useState("athlete");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null); setResult(null);
    try {
      await invokeAI<{ ok?: boolean; error?: string }>("admin-create-user", { email: email.trim(), password, full_name: name.trim(), role });
      setResult(`✅ Created ${email} — password: ${password} (share these, they can change it later).`);
      setEmail(""); setName(""); setPassword(randomPassword());
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setError(
        /admins only|403/.test(m)
          ? "Rejected. Set SUPABASE_SERVICE_ROLE_KEY on the Cloudflare Worker (wrangler secret put) and redeploy — it's needed to verify your admin role and create users."
          : m || "Failed to create the account."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="field-label mb-1">Create beta account</h2>
      <p className="mb-3 text-xs text-slate-400">Instantly provision a tester (email is auto-confirmed — they can sign in right away).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tester@email.com" type="email" />
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name (optional)" />
        <input className="field" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temp password" />
        <select className="field [color-scheme:dark]" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="athlete">Athlete</option>
          <option value="coach">Coach</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button onClick={create} disabled={busy || !email.trim() || password.length < 6} className="btn-primary mt-3">
        {busy ? "Creating…" : "Create account"}
      </button>
      {result && <p className="mt-2 break-words text-sm text-pitch-400">{result}</p>}
      {error && <p className="mt-2 text-sm text-readiness-red">{error}</p>}
    </div>
  );
}
