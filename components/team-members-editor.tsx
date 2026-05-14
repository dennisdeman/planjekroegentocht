"use client";

import { useState, useEffect, useCallback } from "react";
import { parseParticipantsCsv } from "@core";

export interface TeamMemberView {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is18Plus: boolean;
  notes: string | null;
}

interface Props {
  configId: string;
  groupId: string;
  groupName: string;
  onClose: () => void;
}

export function TeamMembersEditor({ configId, groupId, groupName, onClose }: Props) {
  const [allOrgMembers, setAllOrgMembers] = useState<TeamMemberView[]>([]);
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newIs18Plus, setNewIs18Plus] = useState(false);
  const [newNotes, setNewNotes] = useState("");

  // Bulk paste state
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkRaw, setBulkRaw] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, assignRes] = await Promise.all([
        fetch("/api/team-members"),
        fetch(`/api/team-members/assignments?configId=${encodeURIComponent(configId)}`),
      ]);
      if (!orgRes.ok) throw new Error("Kon adresboek niet laden.");
      if (!assignRes.ok) throw new Error("Kon groepstoewijzingen niet laden.");
      const orgData = (await orgRes.json()) as { members: TeamMemberView[] };
      const assignData = (await assignRes.json()) as {
        assignments: { memberId: string; groupId: string }[];
      };
      setAllOrgMembers(orgData.members);
      setGroupMemberIds(
        assignData.assignments.filter((a) => a.groupId === groupId).map((a) => a.memberId)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Laden mislukt.");
    } finally {
      setLoading(false);
    }
  }, [configId, groupId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const groupMembers = groupMemberIds
    .map((id) => allOrgMembers.find((m) => m.id === id))
    .filter((m): m is TeamMemberView => Boolean(m));

  async function saveAssignments(memberIds: string[]) {
    const res = await fetch("/api/team-members/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configId, groupId, memberIds }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Opslaan mislukt.");
    }
  }

  async function addNewMember() {
    const name = newName.trim();
    if (!name) {
      setError("Naam is verplicht.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          is18Plus: newIs18Plus,
          notes: newNotes.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Aanmaken mislukt.");
      }
      const { member } = (await res.json()) as { member: TeamMemberView };
      const nextIds = [...groupMemberIds, member.id];
      await saveAssignments(nextIds);
      setAllOrgMembers([...allOrgMembers, member]);
      setGroupMemberIds(nextIds);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewIs18Plus(false);
      setNewNotes("");
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aanmaken mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromGroup(memberId: string) {
    setBusy(true);
    setError(null);
    try {
      const nextIds = groupMemberIds.filter((id) => id !== memberId);
      await saveAssignments(nextIds);
      setGroupMemberIds(nextIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function applyBulkPaste() {
    const raw = bulkRaw.trim();
    if (!raw) {
      setShowBulkPaste(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Prepend a header so the CSV parser knows the columns.
      const withHeader = `Naam;Email;Telefoon;18+;Notitie\n${raw}`;
      const { rows, warnings } = parseParticipantsCsv(withHeader);
      if (rows.length === 0) {
        setError(warnings[0] ?? "Geen geldige regels gevonden.");
        return;
      }
      const createdIds: string[] = [];
      const createdMembers: TeamMemberView[] = [];
      for (const row of rows) {
        const res = await fetch("/api/team-members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.name,
            email: row.email ?? null,
            phone: row.phone ?? null,
            is18Plus: row.is18Plus ?? false,
            notes: row.notes ?? null,
          }),
        });
        if (!res.ok) continue;
        const { member } = (await res.json()) as { member: TeamMemberView };
        createdIds.push(member.id);
        createdMembers.push(member);
      }
      if (createdIds.length === 0) {
        setError("Aanmaken van leden mislukt.");
        return;
      }
      const nextIds = [...groupMemberIds, ...createdIds];
      await saveAssignments(nextIds);
      setAllOrgMembers([...allOrgMembers, ...createdMembers]);
      setGroupMemberIds(nextIds);
      setBulkRaw("");
      setShowBulkPaste(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk toevoegen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="help-modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="help-modal-card"
        style={{ width: "min(720px, 100%)", maxHeight: "85vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Leden van {groupName}</h3>
          <button type="button" className="btn-sm btn-ghost" onClick={onClose}>Sluit</button>
        </div>

        {error && (
          <div className="notice notice-warning" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <p className="muted">Laden…</p>
        ) : (
          <>
            {groupMembers.length === 0 ? (
              <p className="muted">Nog geen leden toegevoegd.</p>
            ) : (
              <table className="simple-table" style={{ marginBottom: 12 }}>
                <thead>
                  <tr>
                    <th>Naam</th>
                    <th>Email</th>
                    <th>Telefoon</th>
                    <th>18+</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {groupMembers.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}{m.notes ? <small className="muted" style={{ display: "block" }}>{m.notes}</small> : null}</td>
                      <td>{m.email ?? <span className="muted">—</span>}</td>
                      <td>{m.phone ?? <span className="muted">—</span>}</td>
                      <td>{m.is18Plus ? "✓" : <span className="muted">—</span>}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-sm danger-button"
                          onClick={() => removeFromGroup(m.id)}
                          disabled={busy}
                        >
                          Verwijder
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {showAddForm ? (
              <div className="form-grid" style={{ background: "var(--panel-bg, #f9f9f9)", padding: 12, borderRadius: 6 }}>
                <input placeholder="Naam *" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" />
                <input placeholder="Telefoon" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={newIs18Plus} onChange={(e) => setNewIs18Plus(e.target.checked)} />
                  18+ (NIX18 compliance)
                </label>
                <textarea placeholder="Notities (optioneel)" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn-sm" onClick={addNewMember} disabled={busy || !newName.trim()}>
                    Voeg toe
                  </button>
                  <button type="button" className="btn-sm btn-ghost" onClick={() => setShowAddForm(false)} disabled={busy}>
                    Annuleer
                  </button>
                </div>
              </div>
            ) : showBulkPaste ? (
              <div className="form-grid" style={{ background: "var(--panel-bg, #f9f9f9)", padding: 12, borderRadius: 6 }}>
                <p className="muted" style={{ margin: 0 }}>
                  Eén regel per persoon. Formaat: <code>Naam; email; telefoon; 18+; notitie</code> — alleen naam is verplicht.
                  Voor 18+: <code>ja</code> / <code>nee</code> (of <code>yes</code>/<code>no</code>/<code>1</code>/<code>0</code>). Lege velden mogen, zolang de puntkomma's blijven staan.
                </p>
                <textarea
                  value={bulkRaw}
                  onChange={(e) => setBulkRaw(e.target.value)}
                  rows={8}
                  placeholder={"Jan Jansen; jan@example.nl; +31612345678; ja\nKlaas de Vries\nPiet; piet@example.nl; ; nee; allergie noten"}
                  style={{ fontFamily: "monospace" }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn-sm" onClick={applyBulkPaste} disabled={busy || !bulkRaw.trim()}>
                    Verwerk
                  </button>
                  <button type="button" className="btn-sm btn-ghost" onClick={() => { setShowBulkPaste(false); setBulkRaw(""); }} disabled={busy}>
                    Annuleer
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn-sm" onClick={() => setShowAddForm(true)} disabled={busy}>
                  + Lid toevoegen
                </button>
                <button type="button" className="btn-sm btn-ghost" onClick={() => setShowBulkPaste(true)} disabled={busy}>
                  Plak lijst
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
