"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface Member {
  id: string;
  user_id: string;
  org_id: string;
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

export default function MembersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.activeOrgRole === "admin";

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
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
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setInviting(true);

    try {
      const res = await fetch("/api/org/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Uitnodigen mislukt.", type: "error" });
        setInviting(false);
        return;
      }
      setInviteEmail("");
      setMessage({ text: "Uitnodiging verstuurd.", type: "success" });
      await loadData();
    } catch {
      setMessage({ text: "Uitnodigen mislukt.", type: "error" });
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!await confirmDialog({ title: "Lid verwijderen", message: "Weet je zeker dat je dit lid wilt verwijderen?", confirmLabel: "Verwijderen", variant: "danger" })) return;
    setMessage(null);

    try {
      const res = await fetch("/api/org/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Verwijderen mislukt.", type: "error" });
        return;
      }
      setMessage({ text: "Lid verwijderd.", type: "success" });
      await loadData();
    } catch {
      setMessage({ text: "Verwijderen mislukt.", type: "error" });
    }
  }

  if (!session?.user) {
    return <div className="card"><p>Laden...</p></div>;
  }

  if (loading) {
    return <div className="card"><p>Leden laden...</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 700 }}>
      <div>
        <Link href="/settings" style={{ color: "var(--brand)", fontSize: "0.9rem" }}>
          &larr; Terug naar instellingen
        </Link>
      </div>

      {message && (
        <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`}>
          <p>{message.text}</p>
        </div>
      )}

      {/* Invite form (admin only) */}
      {isAdmin && (
        <div className="card">
          <h2 style={{ margin: "0 0 12px" }}>Uitnodigen</h2>
          <form onSubmit={handleInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ flex: "1 1 200px" }}>
              E-mailadres
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="naam@voorbeeld.nl"
              />
            </label>
            <label style={{ flex: "0 0 140px" }}>
              Rol
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}>
                <option value="member">Lid</option>
                <option value="admin">Beheerder</option>
              </select>
            </label>
            <button type="submit" disabled={inviting} style={{ height: 38 }}>
              {inviting ? "Bezig..." : "Uitnodigen"}
            </button>
          </form>
        </div>
      )}

      {/* Members list */}
      <div className="card">
        <h2 style={{ margin: "0 0 12px" }}>Leden ({members.length})</h2>
        <ul className="simple-list">
          {members.map((member) => (
            <li key={member.id}>
              <div>
                <strong>{member.user_name}</strong>
                <small>{member.user_email}</small>
              </div>
              <div className="inline-actions">
                <span className="chip">
                  {member.role === "admin" ? "Beheerder" : "Lid"}
                </span>
                {isAdmin && member.user_id !== session.user.id && (
                  <button
                    className="danger-button"
                    style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                    onClick={() => handleRemoveMember(member.id)}
                  >
                    Verwijderen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Pending invitations (admin only) */}
      {isAdmin && invitations.length > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 12px" }}>Openstaande uitnodigingen ({invitations.length})</h2>
          <ul className="simple-list">
            {invitations.map((inv) => (
              <li key={inv.id}>
                <div>
                  <strong>{inv.email}</strong>
                  <small>
                    {inv.role === "admin" ? "Beheerder" : "Lid"} — verloopt{" "}
                    {new Date(inv.expires_at).toLocaleDateString("nl-NL")}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
