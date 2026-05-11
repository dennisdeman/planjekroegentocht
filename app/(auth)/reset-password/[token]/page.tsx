"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Wachtwoorden komen niet overeen.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Resetten mislukt.");
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Er is iets misgegaan.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />
        <h2 style={{ margin: "0 0 8px" }}>Wachtwoord gewijzigd</h2>
        <p>Je kunt nu inloggen met je nieuwe wachtwoord.</p>
        <Link href="/login" className="button-link" style={{ marginTop: 8 }}>
          Inloggen
        </Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />
        <h2 style={{ margin: 0 }}>Nieuw wachtwoord instellen</h2>
      </div>

      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          Nieuw wachtwoord
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Minimaal 8 tekens"
          />
        </label>
        <label>
          Bevestig wachtwoord
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Herhaal wachtwoord"
          />
        </label>

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? "Opslaan..." : "Wachtwoord opslaan"}
        </button>
      </form>
    </div>
  );
}
