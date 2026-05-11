"use client";

import { useEffect, useState } from "react";
import type { LatestBroadcast } from "./chat-unread-poller";

const STORAGE_KEY = "broadcast-dismissed";

function getDismissedId(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function setDismissedId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

interface ChatBroadcastBannerProps {
  broadcast: LatestBroadcast | null;
  onOpen?: () => void;
}

export function ChatBroadcastBanner({ broadcast, onOpen }: ChatBroadcastBannerProps) {
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(getDismissedId());
  }, []);

  if (!broadcast || broadcast.id === dismissed) return null;

  function handleOpen() {
    setDismissedId(broadcast!.id);
    setDismissed(broadcast!.id);
    onOpen?.();
  }

  return (
    <div className="chat-broadcast-banner" onClick={handleOpen} style={{ cursor: "pointer" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{broadcast.senderName}:</strong> {broadcast.content}
      </div>
      <span className="chat-broadcast-open">Open</span>
    </div>
  );
}
