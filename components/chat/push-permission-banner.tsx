"use client";

import { useState } from "react";
import { usePush } from "@lib/push/use-push";

interface PushPermissionBannerProps {
  mode: "admin" | "supervisor";
  identifier: string;
}

export function PushPermissionBanner({ mode, identifier }: PushPermissionBannerProps) {
  const { permission, subscribed, supported, subscribe } = usePush({ mode, identifier });
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!supported || subscribed || permission === "denied" || dismissed) return null;

  async function handleEnable() {
    setLoading(true);
    const ok = await subscribe();
    setLoading(false);
    if (!ok) setDismissed(true);
  }

  return (
    <div className="push-permission-banner">
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>Meldingen</strong>
        <span style={{ marginLeft: 6 }}>Ontvang een melding bij nieuwe berichten.</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setDismissed(true)} disabled={loading}>
          Later
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={handleEnable} disabled={loading}>
          {loading ? "..." : "Inschakelen"}
        </button>
      </div>
    </div>
  );
}
