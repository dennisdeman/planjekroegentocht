"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function VerifyPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Verificatie mislukt.");
          setStatus("error");
          return;
        }
        setStatus("success");
      } catch {
        setError("Er is iets misgegaan.");
        setStatus("error");
      }
    }
    verify();
  }, [token]);

  return (
    <div className="card" style={{ padding: 24, textAlign: "center" }}>
      <img src="/logo.png" alt="Plan je Kroegentocht" className="auth-logo" style={{ height: 96, margin: "0 auto 12px", display: "block" }} />

      {status === "loading" && (
        <>
          <h2 style={{ margin: "0 0 8px" }}>E-mailadres verifiëren...</h2>
          <p className="muted">Even geduld.</p>
        </>
      )}

      {status === "success" && (
        <>
          <h2 style={{ margin: "0 0 8px" }}>E-mailadres bevestigd</h2>
          <p>Je account is geactiveerd. Je kunt nu inloggen.</p>
          <Link href="/login" className="button-link" style={{ marginTop: 8 }}>
            Inloggen
          </Link>
        </>
      )}

      {status === "error" && (
        <>
          <h2 style={{ margin: "0 0 8px" }}>Verificatie mislukt</h2>
          <p className="error-text">{error}</p>
          <p className="muted" style={{ marginTop: 8 }}>
            De link is mogelijk verlopen. Je kunt een nieuwe aanvragen op de{" "}
            <Link href="/login" style={{ color: "var(--brand)" }}>loginpagina</Link>.
          </p>
        </>
      )}
    </div>
  );
}
