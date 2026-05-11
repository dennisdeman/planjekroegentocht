"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePlanState } from "@lib/use-plan-state";

interface CouponResult {
  code: string;
  discountFormatted: string;
  finalFormatted: string;
  finalCents: number;
}

interface BillingInfo {
  type: "private" | "business";
  companyName: string;
  address: string;
  postalCode: string;
  city: string;
  vatNumber: string;
}

export default function UpgradePage() {
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const planState = usePlanState();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponResults, setCouponResults] = useState<Record<string, CouponResult>>({});
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponsAvailable, setCouponsAvailable] = useState(false);

  // Billing modal state
  const [billingModalPlan, setBillingModalPlan] = useState<"pro_event" | "pro_year" | null>(null);
  const [billing, setBilling] = useState<BillingInfo>({
    type: "private", companyName: "", address: "", postalCode: "", city: "", vatNumber: "",
  });

  // Org usage (voor downgrade-check)
  const [usage, setUsage] = useState<{ planCount: number; memberCount: number } | null>(null);

  useEffect(() => {
    refreshSession({ refreshPlanState: true });
    fetch("/api/payments/coupons-active").then((r) => r.json()).then((d) => setCouponsAvailable(d.hasActive)).catch(() => {});
    fetch("/api/org/usage").then((r) => r.json()).then((d) => {
      if (typeof d.planCount === "number" && typeof d.memberCount === "number") {
        setUsage({ planCount: d.planCount, memberCount: d.memberCount });
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pro Event downgrade-blokker: actief Pro Jaar OF te veel plannen/leden voor Pro Event-limieten
  const PRO_EVENT_MAX_PLANS = 1;
  const PRO_EVENT_MAX_MEMBERS = 1;
  const proEventBlockedReason: string | null = (() => {
    if (planState.plan === "pro_year" && planState.status === "active") {
      return "Beschikbaar zodra je Pro Jaar afloopt.";
    }
    if (usage && usage.planCount > PRO_EVENT_MAX_PLANS) {
      return `Je hebt ${usage.planCount} opgeslagen planningen. Pro Event staat er ${PRO_EVENT_MAX_PLANS} toe.`;
    }
    if (usage && usage.memberCount > PRO_EVENT_MAX_MEMBERS) {
      return `Je hebt ${usage.memberCount} teamleden. Pro Event staat er ${PRO_EVENT_MAX_MEMBERS} toe.`;
    }
    return null;
  })();

  async function validateCouponForAll() {
    if (!couponCode.trim()) {
      setCouponResults({});
      setCouponError(null);
      return;
    }
    setCouponChecking(true);
    setCouponError(null);
    const results: Record<string, CouponResult> = {};
    let lastError: string | null = null;

    for (const plan of ["pro_event", "pro_year"]) {
      try {
        const res = await fetch("/api/payments/validate-coupon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: couponCode, plan }),
        });
        const data = await res.json();
        if (res.ok) {
          results[plan] = data;
        } else {
          lastError = data.error;
        }
      } catch {
        lastError = "Coupon valideren mislukt.";
      }
    }

    if (Object.keys(results).length === 0 && lastError) {
      setCouponError(lastError);
    }
    setCouponResults(results);
    setCouponChecking(false);
  }

  function handleBuyClick(plan: "pro_event" | "pro_year") {
    if (couponResults[plan]?.finalCents === 0) {
      void purchase(plan, null);
      return;
    }
    setBillingModalPlan(plan);
    setBilling({ type: "private", companyName: "", address: "", postalCode: "", city: "", vatNumber: "" });
    setError(null);
  }

  async function purchase(plan: "pro_event" | "pro_year", billingData: typeof billing | null) {
    setLoading(plan);
    setError(null);
    setBillingModalPlan(null);

    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          couponCode: couponResults[plan] ? couponCode : undefined,
          billing: billingData
            ? {
                type: billingData.type,
                companyName: billingData.companyName.trim() || undefined,
                address: billingData.address.trim() || undefined,
                postalCode: billingData.postalCode.trim() || undefined,
                city: billingData.city.trim() || undefined,
                vatNumber: billingData.vatNumber.trim() || undefined,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Er ging iets mis.");
        setLoading(null);
        return;
      }
      if (data.activated) {
        await refreshSession({ refreshPlanState: true });
        router.push(data.redirectUrl);
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setError("Betaling starten mislukt. Probeer het opnieuw.");
      setLoading(null);
    }
  }

  async function handleConfirmBuy() {
    if (!billingModalPlan) return;
    const plan = billingModalPlan;

    if (billing.type === "business") {
      if (!billing.companyName.trim() || !billing.address.trim() || !billing.postalCode.trim() || !billing.city.trim()) {
        setError("Vul alle verplichte velden in voor een zakelijke factuur.");
        return;
      }
    }

    await purchase(plan, billing);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Upgraden</h2>

      {planState.plan !== "free" && planState.status === "active" && (
        <div className="notice notice-success">
          <p style={{ margin: 0 }}>
            Je hebt momenteel <strong>{planState.plan === "pro_event" ? "Pro Event" : "Pro Jaar"}</strong>.
            {planState.expiresAt && ` Geldig tot ${new Date(planState.expiresAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}.`}
            {planState.plan === "pro_event" && " Upgrade naar Pro Jaar en je resterende Pro Event-waarde wordt verrekend."}
          </p>
        </div>
      )}

      {error && (
        <div className="notice notice-error">
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      <section className="card" style={{ padding: 20 }}>

      {couponsAvailable && <div style={{ maxWidth: 720, margin: "0 auto 16px", width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 200px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Couponcode</span>
            <input
              type="text"
              value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponResults({}); setCouponError(null); }}
              placeholder="Vul hier je couponcode in..."
              style={{ textTransform: "uppercase" }}
            />
          </label>
          <button
            type="button"
            className="btn-ghost"
            disabled={!couponCode.trim() || couponChecking}
            onClick={validateCouponForAll}
          >
            {couponChecking ? "Checken..." : "Toepassen"}
          </button>
        </div>
        {couponError && <p style={{ margin: "4px 0 0", color: "var(--danger)", fontSize: "0.85rem" }}>{couponError}</p>}
        {Object.keys(couponResults).length > 0 && <p style={{ margin: "4px 0 0", color: "var(--success)", fontSize: "0.85rem" }}>Korting van {couponResults.pro_event?.discountFormatted ?? couponResults.pro_year?.discountFormatted} toegepast!</p>}
      </div>}

      <div className="upgrade-grid">
        {/* Pro Event */}
        <div className={`card upgrade-card ${planState.plan === "pro_event" && planState.status === "active" ? "upgrade-current" : ""}`}>
          <span className="upgrade-badge" style={{ background: "var(--success)", color: "#fff" }}>Eenmalige kroegentocht</span>
          <h3 style={{ margin: "0 0 4px" }}>Pro Event</h3>
          <div className="upgrade-price">
            {couponResults.pro_event ? (
              <><s style={{ color: "var(--muted)", fontSize: "0.7em" }}>&euro;9,95</s> {couponResults.pro_event.finalFormatted}</>
            ) : (
              <>&euro;9,95</>
            )}
          </div>
          <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.85rem" }}>Eenmalig &middot; voor &eacute;&eacute;n kroegentocht</p>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.6 }}>
            Alles wat je nodig hebt voor &eacute;&eacute;n kroegentocht. Van planning tot groepskaarten en scorebord.
          </p>
          <ul className="upgrade-features">
            <li>Tot 30 groepen</li>
            <li>30 dagen bewerken</li>
            <li>PDF, Excel en CSV exports</li>
            <li>Advies-systeem</li>
            <li>Volledige validatie</li>
            <li>E-mail support</li>
          </ul>
          {planState.plan === "pro_event" && planState.status === "active" ? (
            <button type="button" className="btn-ghost" style={{ width: "100%" }} disabled>Huidig plan</button>
          ) : proEventBlockedReason ? (
            <>
              <p className="muted" style={{ margin: "0 0 6px", fontSize: "0.78rem", textAlign: "center" }}>
                {proEventBlockedReason}
              </p>
              <button type="button" className="btn-ghost" style={{ width: "100%" }} disabled title={proEventBlockedReason}>
                Niet beschikbaar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={loading !== null}
              onClick={() => handleBuyClick("pro_event")}
            >
              {loading === "pro_event" ? "Bezig..." : couponResults.pro_event?.finalCents === 0 ? "Gratis activeren" : "Pro Event kopen"}
            </button>
          )}
        </div>

        {/* Pro Jaar */}
        <div className={`card upgrade-card ${planState.plan === "pro_year" && planState.status === "active" ? "upgrade-current" : ""}`}>
          <span className="upgrade-badge">Meest gekozen</span>
          <h3 style={{ margin: "0 0 4px" }}>Pro Jaar</h3>
          <div className="upgrade-price">
            {couponResults.pro_year ? (
              <><s style={{ color: "var(--muted)", fontSize: "0.7em" }}>&euro;24,95</s> {couponResults.pro_year.finalFormatted}</>
            ) : (
              <>&euro;24,95</>
            )}
          </div>
          <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.85rem" }}>Per jaar</p>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.6 }}>
            Voor scholen die elk jaar een kroegentocht organiseren. Bewaar je sjablonen en werk samen met collega&apos;s.
          </p>
          <ul className="upgrade-features">
            <li>Alles uit Pro Event</li>
            <li>Onbeperkt kroegentochten</li>
            <li>Tot 3 planningen tegelijk</li>
            <li>Eigen sjablonen opslaan</li>
            <li>Tot 5 teamleden</li>
            <li>Prioriteit support</li>
          </ul>
          {planState.plan === "pro_year" && planState.status === "active" ? (
            <button type="button" className="btn-ghost" style={{ width: "100%" }} disabled>Huidig plan</button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={loading !== null}
              onClick={() => handleBuyClick("pro_year")}
            >
              {loading === "pro_year" ? "Bezig..." : couponResults.pro_year?.finalCents === 0 ? "Gratis activeren" : "Pro Jaar starten"}
            </button>
          )}
        </div>
      </div>

      </section>

      <p className="muted" style={{ textAlign: "center", fontSize: "0.85rem", marginTop: 8 }}>
        Betaling via iDEAL of bankoverschrijving. Je ontvangt een factuur per e-mail.
      </p>

      {/* Billing modal */}
      {billingModalPlan && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setBillingModalPlan(null); }}>
          <div className="help-modal-card" style={{ width: "min(480px, 100%)" }}>
            <div className="help-modal-header">
              <h3>Factuurgegevens</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setBillingModalPlan(null)}>Sluiten</button>
            </div>

            {error && (
              <div className="notice notice-warning" style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                className={billing.type === "private" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                onClick={() => setBilling((b) => ({ ...b, type: "private" }))}
              >
                Particulier
              </button>
              <button
                type="button"
                className={billing.type === "business" ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
                onClick={() => setBilling((b) => ({ ...b, type: "business" }))}
              >
                Zakelijk
              </button>
            </div>

            {billing.type === "private" && (
              <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.85rem" }}>
                Je factuur wordt verstuurd naar je geregistreerde e-mailadres.
              </p>
            )}

            {billing.type === "business" && (
              <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                <label>
                  <span style={{ fontSize: "0.85rem" }}>Bedrijfsnaam *</span>
                  <input type="text" value={billing.companyName} onChange={(e) => setBilling((b) => ({ ...b, companyName: e.target.value }))} required />
                </label>
                <label>
                  <span style={{ fontSize: "0.85rem" }}>Adres *</span>
                  <input type="text" value={billing.address} onChange={(e) => setBilling((b) => ({ ...b, address: e.target.value }))} required />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                  <label>
                    <span style={{ fontSize: "0.85rem" }}>Postcode *</span>
                    <input type="text" value={billing.postalCode} onChange={(e) => setBilling((b) => ({ ...b, postalCode: e.target.value }))} required />
                  </label>
                  <label>
                    <span style={{ fontSize: "0.85rem" }}>Plaats *</span>
                    <input type="text" value={billing.city} onChange={(e) => setBilling((b) => ({ ...b, city: e.target.value }))} required />
                  </label>
                </div>
                <label>
                  <span style={{ fontSize: "0.85rem" }}>BTW-nummer (optioneel)</span>
                  <input type="text" value={billing.vatNumber} onChange={(e) => setBilling((b) => ({ ...b, vatNumber: e.target.value }))} placeholder="NL000000000B00" />
                </label>
              </div>
            )}

            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              onClick={handleConfirmBuy}
            >
              Doorgaan naar betaling
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
