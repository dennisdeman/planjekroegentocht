"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePlannerStore } from "@lib/planner/store";
import { LiveBanner } from "@ui/live-banner";
import { CompletedKroegentochten } from "@ui/completed-kroegentochten";
import { confirmDialog } from "@ui/ui/confirm-dialog";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function DashboardPage() {
  const {
    init,
    refreshDashboard,
    dashboardLoading,
    storageError,
    configRecords,
    planRecords,
    deleteConfigRecord,
    deletePlanRecord,
  } = usePlannerStore();

  useEffect(() => {
    void init();
    void refreshDashboard();
  }, [init, refreshDashboard]);

  const hasConfigs = configRecords.length > 0;

  return (
    <div className="dashboard">
      {/* Hero + quick start */}
      <div className="hero-grid">
        <section className="card hero-card">
          <h2>Welkom bij Plan je Kroegentocht</h2>
          <p>
            Organiseer in een paar stappen een kroegentocht die klopt. Stel groepen, spellen en velden in via de wizard,
            en het systeem genereert automatisch een eerlijk schema zonder conflicten. Elke groep speelt zoveel mogelijk
            verschillende spellen, tegenstanders worden eerlijk verdeeld, en het rooster past op jouw tijdschema.
          </p>
          <p style={{ margin: "8px 0 0" }}>
            Pas het schema daarna live aan met drag-and-drop, of laat de optimizer verbeteringen voorstellen.
            Geschikt voor basisscholen, spelverenigingen en bedrijfsevenementen.
          </p>
          {storageError ? <p className="error-text">Opslag fout: {storageError}</p> : null}
        </section>

        <section className="card">
          <h3 style={{ margin: "0 0 10px" }}>Aan de slag</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <Link href="/configurator?mode=wizard" className="dashboard-start-link dashboard-start-cta">
              <strong>Stap voor stap instellen</strong>
              <small>Een wizard begeleidt je door alle instellingen.</small>
            </Link>
            <Link href="/configurator?mode=template" className="dashboard-start-link">
              <strong>Sjabloon laden</strong>
              <small>Start met een voorbeeld of gebruik een eerder opgeslagen configuratie.</small>
            </Link>
            <Link href="/configurator?mode=import" className="dashboard-start-link">
              <strong>Bestand importeren</strong>
              <small>Upload een CSV of Excel met groepen of deelnemers.</small>
            </Link>
            <Link href="/configurator?mode=empty" className="dashboard-start-link">
              <strong>Leeg beginnen</strong>
              <small>Vul alles handmatig in, voor ervaren gebruikers.</small>
            </Link>
          </div>
        </section>
      </div>

      <LiveBanner />

      <hr className="dashboard-divider" />

      {/* Saved configs & plans */}
      <div className="split-grid">
        <section className="card">
          <h3 style={{ margin: "0 0 10px" }}>Configuraties</h3>
          {dashboardLoading && <p className="muted">Laden...</p>}
          {!dashboardLoading && !hasConfigs && (
            <p className="muted" style={{ margin: 0 }}>
              Nog geen opgeslagen configuraties.
            </p>
          )}
          <ul className="simple-list">
            {configRecords.map((record) => (
              <li key={record.id}>
                <div>
                  <strong>{record.config.name}</strong>
                  <small>{formatDate(record.updatedAtIso)}</small>
                </div>
                <div className="inline-actions">
                  <Link href={`/configurator?configId=${record.id}`} className="button-link btn-sm">
                    Openen
                  </Link>
                  <button
                    type="button"
                    className="danger-button btn-sm"
                    onClick={async () => { if (await confirmDialog({ title: "Configuratie verwijderen", message: `Configuratie "${record.config.name}" verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) void deleteConfigRecord(record.id); }}
                  >
                    Verwijder
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3 style={{ margin: "0 0 10px" }}>Planningen</h3>
          {!dashboardLoading && planRecords.length === 0 && (
            <p className="muted" style={{ margin: 0 }}>
              Nog geen opgeslagen planningen.
            </p>
          )}
          <ul className="simple-list">
            {planRecords.map((record) => {
              const config = configRecords.find((c) => c.id === record.configId);
              return (
                <li key={record.id}>
                  <div>
                    <strong>{config?.config.name ?? "Planning"}</strong>
                    <small>{formatDate(record.updatedAtIso)}</small>
                  </div>
                  <div className="inline-actions">
                    <Link href={`/planner?planId=${record.id}`} className="button-link btn-sm">
                      Openen
                    </Link>
                    <button
                      type="button"
                      className="danger-button btn-sm"
                      onClick={async () => { if (await confirmDialog({ title: "Planning verwijderen", message: `Planning "${config?.config.name ?? "Planning"}" verwijderen?`, confirmLabel: "Verwijderen", variant: "danger" })) void deletePlanRecord(record.id); }}
                    >
                      Verwijder
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <CompletedKroegentochten />
    </div>
  );
}
