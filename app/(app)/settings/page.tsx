"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePlanState } from "@lib/use-plan-state";
import { confirmDialog } from "@ui/ui/confirm-dialog";
import { useCallback, useEffect, useState } from "react";
import { usePlannerStore } from "@lib/planner/store";

// ── Types ──────────────────────────────────────────────────────────────

interface Member {
  id: string;
  user_id: string;
  role: "admin" | "member";
  user_name: string;
  user_email: string;
}

interface Invitation {
  id: string;
  email: string;
  role: "admin" | "member";
  expires_at: string;
}

type ModalType = "account" | "rename" | "members" | "storage" | "logo" | null;

// ── Component ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const { storageMode, setStorageMode } = usePlannerStore();
  const [modal, setModal] = useState<ModalType>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Sessie verversen bij laden zodat planState actueel is
  useEffect(() => { update({ refreshPlanState: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rename state
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);

  // Account state
  const [accountName, setAccountName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);

  // Members state
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  // Logo state
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  // Logo ophalen bij laden
  useEffect(() => {
    fetch("/api/org/logo").then((r) => r.json()).then((d) => { setLogoData(d.logoData ?? null); setLogoLoaded(true); }).catch(() => setLogoLoaded(true));
  }, []);

  if (!session?.user) {
    return <div className="card"><p>Laden...</p></div>;
  }

  const isAdmin = session.user.activeOrgRole === "admin";

  function openAccount() {
    setAccountName(session!.user.name);
    setCurrentPassword("");
    setNewPassword("");
    setMessage(null);
    setModal("account");
  }

  async function saveAccountName(e: React.FormEvent) {
    e.preventDefault();
    setAccountSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-name", name: accountName }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ text: data.error ?? "Opslaan mislukt.", type: "error" }); return; }
      await update({ activeOrgId: session!.user.activeOrgId });
      setMessage({ text: "Naam opgeslagen. Log opnieuw in om de wijziging overal te zien.", type: "success" });
    } catch {
      setMessage({ text: "Opslaan mislukt.", type: "error" });
    } finally {
      setAccountSaving(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setAccountSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ text: data.error ?? "Wijzigen mislukt.", type: "error" }); return; }
      setCurrentPassword("");
      setNewPassword("");
      setMessage({ text: "Wachtwoord gewijzigd.", type: "success" });
    } catch {
      setMessage({ text: "Wijzigen mislukt.", type: "error" });
    } finally {
      setAccountSaving(false);
    }
  }

  function openRename() {
    setOrgName(session!.user.activeOrgName);
    setMessage(null);
    setModal("rename");
  }

  async function saveOrgName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/org/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ text: data.error ?? "Opslaan mislukt.", type: "error" }); return; }
      await update({ activeOrgId: session!.user.activeOrgId });
      setModal(null);
      setMessage({ text: "Organisatienaam opgeslagen.", type: "success" });
    } catch {
      setMessage({ text: "Opslaan mislukt.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function openMembers() {
    setMessage(null);
    setModal("members");
    setMembersLoading(true);
    try {
      const [membersRes, invitationsRes] = await Promise.all([
        fetch("/api/org/members"),
        isAdmin ? fetch("/api/org/invitations") : Promise.resolve(null),
      ]);
      const membersData = await membersRes.json();
      setMembers(membersData.members ?? []);
      if (invitationsRes) {
        const invitationsData = await invitationsRes.json();
        setInvitations(invitationsData.invitations ?? []);
      }
    } catch {
      setMessage({ text: "Laden mislukt.", type: "error" });
    } finally {
      setMembersLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/org/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ text: data.error ?? "Uitnodigen mislukt.", type: "error" }); return; }
      setInviteEmail("");
      setMessage({ text: "Uitnodiging verstuurd.", type: "success" });
      await openMembers();
    } catch {
      setMessage({ text: "Uitnodigen mislukt.", type: "error" });
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!(await confirmDialog({ title: "Lid verwijderen", message: "Weet je zeker dat je dit lid wilt verwijderen?", confirmLabel: "Verwijderen", variant: "danger" }))) return;
    try {
      const res = await fetch("/api/org/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ text: data.error ?? "Verwijderen mislukt.", type: "error" }); return; }
      setMessage({ text: "Lid verwijderd.", type: "success" });
      await openMembers();
    } catch {
      setMessage({ text: "Verwijderen mislukt.", type: "error" });
    }
  }

  function openStorage() {
    setMessage(null);
    setModal("storage");
  }

  function openLogo() {
    setMessage(null);
    setModal("logo");
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ text: "Selecteer een afbeelding (PNG, JPG).", type: "error" });
      return;
    }
    if (file.size > 500 * 1024) {
      setMessage({ text: "Bestand te groot. Maximaal 500KB.", type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setLogoLoading(true);
      try {
        const res = await fetch("/api/org/logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logoData: base64 }),
        });
        if (res.ok) {
          setLogoData(base64);
          setMessage({ text: "Logo opgeslagen.", type: "success" });
        } else {
          const data = await res.json();
          setMessage({ text: data.error || "Logo opslaan mislukt.", type: "error" });
        }
      } catch {
        setMessage({ text: "Logo opslaan mislukt.", type: "error" });
      }
      setLogoLoading(false);
    };
    reader.readAsDataURL(file);
  }

  async function handleLogoDelete() {
    setLogoLoading(true);
    try {
      const res = await fetch("/api/org/logo", { method: "DELETE" });
      if (res.ok) {
        setLogoData(null);
        setMessage({ text: "Logo verwijderd. Het standaard logo wordt gebruikt bij exports.", type: "success" });
      }
    } catch { /* ignore */ }
    setLogoLoading(false);
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 style={{ margin: 0 }}>Instellingen</h2>

      {message && !modal && (
        <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`}>
          <p>{message.text}</p>
        </div>
      )}

      <SubscriptionCard />
      <InvoicesCard />

      <div className="split-grid">
        {/* Linker kolom */}
        <div className="settings-column" style={{ display: "grid", gap: 14, gridAutoRows: "120px" }}>
          <div className="card" style={{ cursor: "pointer" }} onClick={openAccount}>
            <h3 style={{ margin: "0 0 8px" }}>Account</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(14, 46, 80, 0.12)", display: "grid", placeItems: "center", fontWeight: 700, color: "var(--brand)", fontSize: "1.1rem", flexShrink: 0 }}>
                {session.user.name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{session.user.name}</p>
                <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>{session.user.email}</p>
              </div>
            </div>
          </div>

          <div className="card" style={isAdmin ? { cursor: "pointer" } : undefined} onClick={isAdmin ? openRename : undefined}>
            <h3 style={{ margin: "0 0 8px" }}>Organisatie</h3>
            <p style={{ margin: 0, fontWeight: 600 }}>{session.user.activeOrgName}</p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.85rem" }}>
              Jouw rol: {isAdmin ? "Beheerder" : "Lid"}{isAdmin ? " — klik om te hernoemen" : ""}
            </p>
          </div>
        </div>

        {/* Rechter kolom */}
        <div className="settings-column" style={{ display: "grid", gap: 14, gridAutoRows: "120px" }}>
          {isAdmin && (
            <div className="card" style={{ cursor: "pointer" }} onClick={openMembers}>
              <h3 style={{ margin: "0 0 8px" }}>Leden</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                Nodig teamleden uit, beheer rollen en verwijder leden.
              </p>
            </div>
          )}

          <Link href="/settings/spellen" className="card" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
            <h3 style={{ margin: "0 0 8px" }}>Spellen</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Beheer je drankspellen: materialen, speluitleg en veldopzet.
            </p>
          </Link>

          <div className="card" style={{ cursor: "pointer" }} onClick={openLogo}>
            <h3 style={{ margin: "0 0 8px" }}>Logo</h3>
            {logoLoaded && logoData ? (
              <img src={logoData} alt="Organisatie logo" style={{ maxWidth: "100%", maxHeight: 48, objectFit: "contain" }} />
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                {logoLoaded ? "Geen logo ingesteld. Klik om te uploaden." : "Laden..."}
              </p>
            )}
          </div>

          <div className="card" style={{ cursor: "pointer" }} onClick={openStorage}>
            <h3 style={{ margin: "0 0 8px" }}>Opslag</h3>
            <p style={{ margin: 0, fontWeight: 600 }}>{storageMode === "cloud" ? "Cloud" : "Lokaal (browser)"}</p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.85rem" }}>
              Klik om te wijzigen
            </p>
          </div>

          {session.user.isSuperadmin && (
            <Link href="/admin" className="card" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
              <h3 style={{ margin: "0 0 8px", color: "var(--accent)" }}>Superadmin</h3>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                Gebruikers, organisaties en activiteitenlog beheren.
              </p>
            </Link>
          )}
        </div>
      </div>

      {/* ── Modal: Account ───────────────────────────────────────────── */}
      {modal === "account" && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="help-modal-card" style={{ width: "min(440px, 100%)" }}>
            <div className="help-modal-header">
              <h3>Account bewerken</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setModal(null)}>Sluiten</button>
            </div>
            {message && (
              <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`} style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>{message.text}</p>
              </div>
            )}

            <form onSubmit={saveAccountName} style={{ display: "grid", gap: 12, marginBottom: 20 }}>
              <label>
                Naam
                <input type="text" value={accountName} onChange={(e) => setAccountName(e.target.value)} required autoFocus />
              </label>
              <div className="inline-actions">
                <button type="submit" disabled={accountSaving} className="btn-primary">Naam opslaan</button>
              </div>
            </form>

            <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "0 0 16px" }} />

            <form onSubmit={savePassword} style={{ display: "grid", gap: 12 }}>
              <h4 style={{ margin: 0 }}>Wachtwoord wijzigen</h4>
              <label>
                Huidig wachtwoord
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
              </label>
              <label>
                Nieuw wachtwoord
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Minimaal 8 tekens" />
              </label>
              <div className="inline-actions">
                <button type="submit" disabled={accountSaving || newPassword.length < 8} className="btn-primary">Wachtwoord wijzigen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Hernoemen ──────────────────────────────────────────── */}
      {modal === "rename" && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="help-modal-card" style={{ width: "min(440px, 100%)" }}>
            <div className="help-modal-header">
              <h3>Organisatie hernoemen</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setModal(null)}>Sluiten</button>
            </div>
            {message && (
              <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`} style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>{message.text}</p>
              </div>
            )}
            <form onSubmit={saveOrgName} style={{ display: "grid", gap: 12 }}>
              <label>
                Naam
                <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} required autoFocus />
              </label>
              <div className="inline-actions">
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Opslaan..." : "Opslaan"}</button>
                <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Annuleren</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Leden ──────────────────────────────────────────────── */}
      {modal === "members" && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="help-modal-card" style={{ width: "min(560px, 100%)", maxHeight: "85vh", overflow: "auto" }}>
            <div className="help-modal-header">
              <h3>Leden beheren</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setModal(null)}>Sluiten</button>
            </div>

            {message && (
              <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`} style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>{message.text}</p>
              </div>
            )}

            {membersLoading ? (
              <p className="muted">Laden...</p>
            ) : (
              <>
                {/* Invite form */}
                {isAdmin && (
                  <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--line)" }}>
                    <label style={{ flex: "1 1 200px" }}>
                      E-mailadres
                      <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="naam@voorbeeld.nl" />
                    </label>
                    <label style={{ flex: "0 0 130px" }}>
                      Rol
                      <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}>
                        <option value="member">Lid</option>
                        <option value="admin">Beheerder</option>
                      </select>
                    </label>
                    <button type="submit" disabled={inviting} className="btn-primary">{inviting ? "Bezig..." : "Uitnodigen"}</button>
                  </form>
                )}

                {/* Members list */}
                <h4 style={{ margin: "0 0 8px" }}>Leden ({members.length})</h4>
                <ul className="simple-list">
                  {members.map((m) => (
                    <li key={m.id}>
                      <div>
                        <strong>{m.user_name}</strong>
                        <small>{m.user_email}</small>
                      </div>
                      <div className="inline-actions">
                        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{m.role === "admin" ? "Beheerder" : "Lid"}</span>
                        {isAdmin && m.user_id !== session.user.id && (
                          <button className="danger-button btn-sm" onClick={() => handleRemoveMember(m.id)}>Verwijderen</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Pending invitations */}
                {isAdmin && invitations.length > 0 && (
                  <>
                    <h4 style={{ margin: "16px 0 8px" }}>Openstaande uitnodigingen ({invitations.length})</h4>
                    <ul className="simple-list">
                      {invitations.map((inv) => (
                        <li key={inv.id}>
                          <div>
                            <strong>{inv.email}</strong>
                            <small>{inv.role === "admin" ? "Beheerder" : "Lid"} — verloopt {new Date(inv.expires_at).toLocaleDateString("nl-NL")}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Opslag ─────────────────────────────────────────────── */}
      {modal === "storage" && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="help-modal-card" style={{ width: "min(400px, 100%)" }}>
            <div className="help-modal-header">
              <h3>Opslag instellen</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setModal(null)}>Sluiten</button>
            </div>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.85rem" }}>
              Bepaalt waar configuraties en planningen worden opgeslagen.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              <button
                type="button"
                className={storageMode === "cloud" ? "dashboard-start-link dashboard-start-cta" : "dashboard-start-link"}
                style={{ textAlign: "left", width: "100%", cursor: "pointer", background: storageMode === "cloud" ? undefined : "transparent" }}
                onClick={() => { void setStorageMode("cloud"); setModal(null); }}
              >
                <strong>Cloud</strong>
                <small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>Opgeslagen op de server. Toegankelijk vanaf elk apparaat.</small>
              </button>
              <button
                type="button"
                className={storageMode === "local" ? "dashboard-start-link dashboard-start-cta" : "dashboard-start-link"}
                style={{ textAlign: "left", width: "100%", cursor: "pointer", background: storageMode === "local" ? undefined : "transparent" }}
                onClick={() => { void setStorageMode("local"); setModal(null); }}
              >
                <strong>Lokaal (browser)</strong>
                <small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>Opgeslagen in je browser. Alleen op dit apparaat beschikbaar.</small>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal: Logo ──────────────────────────────────────────────── */}
      {modal === "logo" && (
        <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="help-modal-card" style={{ width: "min(440px, 100%)" }}>
            <div className="help-modal-header">
              <h3>Logo voor exports</h3>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setModal(null)}>Sluiten</button>
            </div>
            {message && (
              <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`} style={{ marginBottom: 12 }}>
                <p style={{ margin: 0 }}>{message.text}</p>
              </div>
            )}
            <p className="muted" style={{ margin: "0 0 16px", fontSize: "0.85rem" }}>
              Upload je eigen logo om te gebruiken op PDF-exports. Aanbevolen formaat: horizontaal, max 500KB. PNG of JPG.
            </p>
            {logoLoading ? (
              <p className="muted">Laden...</p>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {logoData && (
                  <div style={{ padding: 16, background: "var(--bg-alt)", borderRadius: 8, textAlign: "center" }}>
                    <img src={logoData} alt="Huidig logo" style={{ maxWidth: "100%", maxHeight: 80, objectFit: "contain" }} />
                  </div>
                )}
                <div className="inline-actions">
                  <label className="btn-primary" style={{ cursor: "pointer", margin: 0 }}>
                    {logoData ? "Ander logo uploaden" : "Logo uploaden"}
                    <input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} style={{ display: "none" }} />
                  </label>
                  {logoData && (
                    <button type="button" className="btn-ghost" onClick={handleLogoDelete}>Verwijderen</button>
                  )}
                </div>
                {!logoData && (
                  <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                    Geen eigen logo ingesteld. Het standaard Plan je Kroegentocht logo wordt gebruikt.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoicesCard() {
  const [invoices, setInvoices] = useState<Array<{ id: string; invoice_number: string; description: string; total_cents: number; created_at: string }>>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/org/invoices").then((r) => r.json()).then((d) => { setInvoices(d.invoices ?? []); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  if (!loaded) return null;
  if (invoices.length === 0) return null;

  return (
    <div className="card">
      <h3 style={{ margin: "0 0 10px" }}>Facturen</h3>
      <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <td style={{ padding: "6px 8px 6px 0" }}>{inv.invoice_number}</td>
              <td style={{ padding: "6px 8px" }}>{inv.description}</td>
              <td style={{ padding: "6px 8px", textAlign: "right" }}>&euro;{(inv.total_cents / 100).toFixed(2).replace(".", ",")}</td>
              <td style={{ padding: "6px 8px" }}>{new Date(inv.created_at).toLocaleDateString("nl-NL")}</td>
              <td style={{ padding: "6px 0", textAlign: "right" }}>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={async () => {
                    const res = await fetch(`/api/org/invoices?id=${inv.id}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data.invoice?.pdf_data) {
                      const link = document.createElement("a");
                      link.href = data.invoice.pdf_data;
                      link.download = `factuur-${inv.invoice_number}.pdf`;
                      link.click();
                    }
                  }}
                >
                  PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscriptionCard() {
  const planState = usePlanState();

  const planLabels: Record<string, string> = {
    free: "Gratis proefperiode",
    pro_event: "Pro Event",
    pro_year: "Pro Jaar",
  };

  const statusLabels: Record<string, string> = {
    active: "Actief",
    expired: "Verlopen",
    frozen: "Bevroren",
  };

  const expiresDate = planState.expiresAt ?? planState.trialExpiresAt;
  const formattedExpires = expiresDate
    ? new Date(expiresDate).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="card">
      <h3 style={{ margin: "0 0 10px" }}>Abonnement</h3>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>{planLabels[planState.plan] ?? planState.plan}</p>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.85rem" }}>
            Status: {statusLabels[planState.status] ?? planState.status}
            {formattedExpires && ` — ${planState.status === "active" ? "geldig tot" : "verlopen op"} ${formattedExpires}`}
          </p>
        </div>
        {(planState.plan === "free" || planState.status === "frozen" || planState.status === "expired") && (
          <Link href="/upgrade" className="button-link btn-primary">Upgraden</Link>
        )}
      </div>
    </div>
  );
}
