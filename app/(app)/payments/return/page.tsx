"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

type PaymentStatus = "loading" | "paid" | "pending" | "canceled" | "expired" | "failed" | "error";

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}><h2>Betaling verwerken...</h2></div>}>
      <PaymentReturnContent />
    </Suspense>
  );
}

function PaymentReturnContent() {
  const searchParams = useSearchParams();
  const { update: refreshSession } = useSession();
  const refreshRef = useRef(refreshSession);
  refreshRef.current = refreshSession;
  const [status, setStatus] = useState<PaymentStatus>("loading");
  const paymentId = searchParams.get("id");
  const isFree = searchParams.get("free") === "1";
  const resolved = useRef(false);

  useEffect(() => {
    // 100% coupon korting — al geactiveerd
    if (isFree && paymentId) {
      setStatus("paid");
      refreshRef.current({ refreshPlanState: true });
      return;
    }

    if (!paymentId || resolved.current) {
      if (!paymentId) setStatus("error");
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;
    let cancelled = false;

    async function checkStatus() {
      if (cancelled || resolved.current) return;
      try {
        const res = await fetch(`/api/payments/status?id=${paymentId}`);
        if (!res.ok) { setStatus("error"); resolved.current = true; return; }
        const data = await res.json();

        if (data.status === "paid") {
          resolved.current = true;
          setStatus("paid");
          await refreshRef.current({ refreshPlanState: true });
          return;
        }

        if (data.status === "canceled" || data.status === "expired" || data.status === "failed") {
          resolved.current = true;
          setStatus(data.status);
          return;
        }

        // Nog open/pending — opnieuw proberen
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 2000);
        } else {
          resolved.current = true;
          setStatus("pending");
        }
      } catch {
        resolved.current = true;
        setStatus("error");
      }
    }

    checkStatus();
    return () => { cancelled = true; };
  }, [paymentId]);

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center", display: "grid", gap: 20 }}>
      {status === "loading" && (
        <>
          <h2 style={{ margin: 0 }}>Betaling verwerken...</h2>
          <p className="muted">Even geduld, we controleren je betaling bij Mollie.</p>
        </>
      )}

      {status === "paid" && (
        <>
          <div style={{ fontSize: 48 }}>&#10003;</div>
          <h2 style={{ margin: 0, color: "var(--success)" }}>
            {isFree ? "Plan geactiveerd!" : "Betaling geslaagd!"}
          </h2>
          <p>
            {isFree
              ? "Je coupon is toegepast. Je hebt nu toegang tot alle Pro-functies."
              : "Je plan is geactiveerd. Je hebt nu toegang tot alle Pro-functies."}
          </p>
          <Link href="/dashboard" className="btn-primary" style={{ justifySelf: "center", padding: "10px 32px" }}>
            Naar dashboard
          </Link>
        </>
      )}

      {status === "pending" && (
        <>
          <h2 style={{ margin: 0 }}>Betaling in behandeling</h2>
          <p>Je betaling wordt nog verwerkt. Dit kan enkele minuten duren. Je plan wordt automatisch geactiveerd zodra de betaling bevestigd is.</p>
          <Link href="/dashboard" className="btn-primary" style={{ justifySelf: "center", padding: "10px 32px" }}>
            Naar dashboard
          </Link>
        </>
      )}

      {(status === "canceled" || status === "expired") && (
        <>
          <h2 style={{ margin: 0 }}>Betaling geannuleerd</h2>
          <p>De betaling is niet afgerond. Je kunt het opnieuw proberen.</p>
          <Link href="/upgrade" className="btn-primary" style={{ justifySelf: "center", padding: "10px 32px" }}>
            Opnieuw proberen
          </Link>
        </>
      )}

      {(status === "failed" || status === "error") && (
        <>
          <h2 style={{ margin: 0 }}>Er ging iets mis</h2>
          <p>We konden je betaling niet verifiëren. Neem contact op met support@planjekroegentocht.nl als het probleem aanhoudt.</p>
          <Link href="/upgrade" className="btn-primary" style={{ justifySelf: "center", padding: "10px 32px" }}>
            Opnieuw proberen
          </Link>
        </>
      )}
    </div>
  );
}
