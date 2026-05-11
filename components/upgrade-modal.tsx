"use client";

import Link from "next/link";

interface UpgradeModalProps {
  message: string;
  onClose: () => void;
}

export function UpgradeModal({ message, onClose }: UpgradeModalProps) {
  return (
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="help-modal-card" style={{ width: "min(480px, 100%)", textAlign: "center" }}>
        <h3 style={{ margin: "0 0 12px" }}>Upgrade nodig</h3>
        <p style={{ color: "var(--muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{message}</p>
        <div className="inline-actions" style={{ justifyContent: "center" }}>
          <Link href="/upgrade" className="button-link btn-primary">Bekijk prijzen</Link>
          <button type="button" className="btn-ghost" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen blokkering voor verlopen proefperiodes.
 * Kan niet weggeklikt worden.
 */
export function TrialExpiredOverlay() {
  return (
    <div className="trial-expired-overlay">
      <div className="trial-expired-card">
        <img src="/logo.png" alt="Plan je Kroegentocht" style={{ height: 80, margin: "0 auto 20px", display: "block" }} />
        <h2 style={{ margin: "0 0 12px" }}>Je proefperiode is verlopen</h2>
        <p style={{ color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.6 }}>
          Je 7 dagen gratis proefperiode is voorbij. Je configuratie is bewaard en wacht op je.
        </p>
        <p style={{ color: "var(--muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
          Upgrade naar Pro om verder te gaan met je kroegentocht.
        </p>
        <div style={{ display: "grid", gap: 10, maxWidth: 320, margin: "0 auto" }}>
          <Link href="/upgrade" className="button-link btn-primary btn-lg" style={{ width: "100%" }}>
            Bekijk prijzen
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Banner voor bevroren plannen (Pro Event/Jaar verlopen).
 */
export function FrozenBanner() {
  return (
    <div className="notice notice-warning" style={{ textAlign: "center" }}>
      <p style={{ margin: 0 }}>
        <strong>Je plan is verlopen.</strong> Je kunt je planning nog bekijken, maar niet meer bewerken of exporteren.{" "}
        <Link href="/upgrade" style={{ color: "var(--brand)", fontWeight: 600 }}>Verleng je plan</Link>
      </p>
    </div>
  );
}
