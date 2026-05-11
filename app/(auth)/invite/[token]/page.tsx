"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

interface InviteInfo {
  email: string;
  orgName: string;
  role: "admin" | "member";
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state (for new users)
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [existingPassword, setExistingPassword] = useState("");
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Uitnodiging ongeldig.");
          setLoading(false);
          return;
        }
        setInfo(data as InviteInfo);

        // Check if user already has an account by trying the register endpoint
        // We don't actually have a "check email" endpoint, so we'll show both options
        setLoading(false);
      } catch {
        setError("Kon uitnodiging niet laden.");
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function handleAcceptNew(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Accepteren mislukt.");
        setSubmitting(false);
        return;
      }

      // Auto-login
      const signInResult = await signIn("credentials", {
        email: info?.email,
        password,
        redirect: false,
      });
      if (signInResult?.error) {
        setAccepted(true); // Accepted but login failed — show link to login
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Er is iets misgegaan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptExisting(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // First accept the invitation (creates membership)
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Accepteren mislukt.");
        setSubmitting(false);
        return;
      }

      // Login with existing credentials
      const signInResult = await signIn("credentials", {
        email: info?.email,
        password: existingPassword,
        redirect: false,
      });
      if (signInResult?.error) {
        setError("Uitnodiging geaccepteerd, maar het wachtwoord klopt niet. Ga naar de loginpagina.");
        setSubmitting(false);
        return;
      }
      router.push("/");
    } catch {
      setError("Er is iets misgegaan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <p>Uitnodiging laden...</p>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <h2 style={{ margin: "0 0 8px" }}>Uitnodiging geaccepteerd</h2>
        <p>Je account is aangemaakt. Je kunt nu inloggen.</p>
        <Link href="/login" style={{ color: "var(--brand)" }}>Naar inlogpagina</Link>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <h2 style={{ margin: "0 0 8px" }}>Uitnodiging ongeldig</h2>
        <p className="error-text">{error}</p>
        <Link href="/login" style={{ color: "var(--brand)" }}>Naar inlogpagina</Link>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />
        <h2 style={{ margin: 0 }}>Uitnodiging</h2>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Je bent uitgenodigd voor <strong>{info.orgName}</strong> als{" "}
          <strong>{info.role === "admin" ? "beheerder" : "lid"}</strong>
        </p>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
          E-mail: {info.email}
        </p>
      </div>

      {error && <p className="error-text" style={{ margin: "0 0 10px" }}>{error}</p>}

      {!isExistingUser ? (
        <>
          <form onSubmit={handleAcceptNew} className="form-grid">
            <p style={{ margin: 0, fontWeight: 600 }}>Nieuw account aanmaken</p>
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
            <button type="submit" disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? "Bezig..." : "Account aanmaken en accepteren"}
            </button>
          </form>
          <p className="muted" style={{ textAlign: "center", marginTop: 14, fontSize: "0.9rem" }}>
            Heb je al een account?{" "}
            <button
              onClick={() => setIsExistingUser(true)}
              style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", padding: 0, font: "inherit" }}
            >
              Inloggen en accepteren
            </button>
          </p>
        </>
      ) : (
        <>
          <form onSubmit={handleAcceptExisting} className="form-grid">
            <p style={{ margin: 0, fontWeight: 600 }}>Inloggen met bestaand account</p>
            <label>
              Wachtwoord
              <input
                type="password"
                value={existingPassword}
                onChange={(e) => setExistingPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Wachtwoord"
              />
            </label>
            <button type="submit" disabled={submitting} style={{ marginTop: 4 }}>
              {submitting ? "Bezig..." : "Inloggen en accepteren"}
            </button>
          </form>
          <p className="muted" style={{ textAlign: "center", marginTop: 14, fontSize: "0.9rem" }}>
            Nog geen account?{" "}
            <button
              onClick={() => setIsExistingUser(false)}
              style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", padding: 0, font: "inherit" }}
            >
              Account aanmaken
            </button>
          </p>
        </>
      )}
    </div>
  );
}
