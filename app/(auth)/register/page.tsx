"use client";

import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, orgName: orgName.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registratie mislukt.");
        setLoading(false);
        return;
      }
      setRegistered(true);
    } catch {
      setError("Er is iets misgegaan. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  if (registered) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />
        <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem" }}>Controleer je inbox</h1>
        <p>
          We hebben een verificatie-email gestuurd naar <strong>{email}</strong>.
        </p>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Klik op de link in de email om je account te activeren. Daarna kun je inloggen.
        </p>
        <Link href="/login" className="button-link" style={{ marginTop: 12 }}>
          Naar inlogpagina
        </Link>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Account aanmaken</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>Maak een account aan om te beginnen</p>
      </div>

      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          Naam
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Jouw naam"
          />
        </label>
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
        <label>
          Wachtwoord
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
          Organisatienaam
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            autoComplete="organization"
            placeholder="Bijv. Basisschool De Fontein"
          />
          <small className="muted">Optioneel — kun je later wijzigen</small>
        </label>

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? "Bezig..." : "Registreren"}
        </button>
      </form>

      <p className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem" }}>
        Heb je al een account?{" "}
        <Link href="/login" style={{ color: "var(--brand)" }}>Inloggen</Link>
      </p>
    </div>
  );
}
