"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setResent(false);
    setLoading(true);

    try {
      // Pre-check: validate credentials and check email verification
      const checkRes = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const check = await checkRes.json();

      if (!check.valid) {
        setError("Ongeldig e-mailadres of wachtwoord.");
        setLoading(false);
        return;
      }

      if (!check.emailVerified) {
        setNeedsVerification(true);
        setLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Inloggen mislukt. Probeer het opnieuw.");
        setLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch {
      setError("Er is iets misgegaan. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch {
      setError("Kon verificatie-email niet versturen.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 144, margin: "0 auto 12px", display: "block" }} />
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Inloggen</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>Log in om verder te gaan</p>
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
        <label>
          Wachtwoord
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Wachtwoord"
          />
        </label>

        {error && <p className="error-text" style={{ margin: 0 }}>{error}</p>}

        {needsVerification && (
          <div className="notice notice-warning">
            <p style={{ margin: 0 }}>
              Je e-mailadres is nog niet bevestigd. Controleer je inbox.
            </p>
            {resent ? (
              <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
                Nieuwe verificatie-email verstuurd.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                style={{ marginTop: 8 }}
              >
                {resending ? "Versturen..." : "Verificatie-email opnieuw versturen"}
              </button>
            )}
          </div>
        )}

        <button type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? "Bezig..." : "Inloggen"}
        </button>
      </form>

      <div className="muted" style={{ textAlign: "center", marginTop: 16, fontSize: "0.9rem", display: "grid", gap: 4 }}>
        <p style={{ margin: 0 }}>
          <Link href="/forgot-password" style={{ color: "var(--brand)" }}>Wachtwoord vergeten?</Link>
        </p>
        <p style={{ margin: 0 }}>
          Nog geen account?{" "}
          <Link href="/register" style={{ color: "var(--brand)" }}>Registreren</Link>
        </p>
      </div>
    </div>
  );
}
