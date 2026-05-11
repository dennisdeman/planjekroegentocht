"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Versturen mislukt.");
        setLoading(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Er is iets misgegaan.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />
        <h2 style={{ margin: "0 0 8px" }}>Controleer je inbox</h2>
        <p>
          Als er een account bestaat voor <strong>{email}</strong>, hebben we een link gestuurd om je wachtwoord te resetten.
        </p>
        <p className="muted" style={{ fontSize: "0.9rem" }}>De link is 1 uur geldig.</p>
        <Link href="/login" className="button-link" style={{ marginTop: 12 }}>
          Terug naar inloggen
        </Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />
        <h2 style={{ margin: 0 }}>Wachtwoord vergeten</h2>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Vul je e-mailadres in en we sturen een reset-link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          E-mailadres
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="naam@voorbeeld.nl"
          />
        </label>

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? "Versturen..." : "Reset-link versturen"}
        </button>
      </form>

      <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem" }}>
        <Link href="/login" style={{ color: "var(--brand)" }}>Terug naar inloggen</Link>
      </p>
    </div>
  );
}
