"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface OrgEntry {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: "admin" | "member";
}

export function OrgSwitcher() {
  const { data: session, update } = useSession();
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const loadOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/org/list");
      if (!res.ok) return;
      const data = await res.json();
      setOrgs(data.orgs ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  async function switchOrg(orgId: string) {
    if (orgId === session?.user?.activeOrgId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await update({ activeOrgId: orgId });
      setOpen(false);
      // Reload to refresh all data for the new org
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  if (!session?.user || orgs.length <= 1) {
    // Single org — just show the name, no switcher
    return null;
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        style={{
          background: "none",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: "4px 10px",
          cursor: "pointer",
          font: "inherit",
          fontSize: "0.85rem",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {switching ? "Wisselen..." : session.user.activeOrgName}
        <span style={{ fontSize: "0.7rem" }}>{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 200,
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(16, 33, 52, 0.15)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          {orgs.map((org) => (
            <button
              key={org.orgId}
              onClick={() => switchOrg(org.orgId)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                border: "none",
                borderRadius: 0,
                background: org.orgId === session.user.activeOrgId ? "rgba(15, 108, 115, 0.08)" : "transparent",
                cursor: "pointer",
                font: "inherit",
                fontSize: "0.88rem",
              }}
            >
              <strong>{org.orgName}</strong>
              <span
                style={{
                  display: "block",
                  fontSize: "0.76rem",
                  color: "var(--muted)",
                  marginTop: 2,
                }}
              >
                {org.role === "admin" ? "Beheerder" : "Lid"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
