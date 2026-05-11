"use client";

import { useEffect, useRef } from "react";
import { playPing } from "@lib/audio/play-ping";

export interface LatestBroadcast {
  id: string;
  senderName: string;
  content: string;
  createdAt: string;
}

interface ChatUnreadPollerProps {
  mode: "admin" | "supervisor";
  identifier: string;
  pollInterval?: number;
  onUnreadChange: (count: number) => void;
  onBroadcast?: (broadcast: LatestBroadcast | null) => void;
}

export function ChatUnreadPoller({ mode, identifier, pollInterval = 8000, onUnreadChange, onBroadcast }: ChatUnreadPollerProps) {
  const cancelledRef = useRef(false);
  const prevUnreadRef = useRef<number | null>(null);
  const originalTitleRef = useRef("");

  useEffect(() => {
    if (typeof document !== "undefined") originalTitleRef.current = document.title;
    const handleFocus = () => {
      if (originalTitleRef.current) document.title = originalTitleRef.current;
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      if (originalTitleRef.current) document.title = originalTitleRef.current;
    };
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    const chatBase = mode === "admin"
      ? `/api/kroegentochten/${encodeURIComponent(identifier)}/chat`
      : `/api/live/supervisor/${encodeURIComponent(identifier)}/chat`;
    const channelsUrl = `${chatBase}/channels`;

    const fetchUnread = () => {
      // Fetch channels (unread counts) + broadcast berichten in één cycle
      const channelsFetch = fetch(channelsUrl).then((r) => r.json()).catch(() => null);
      const broadcastFetch = onBroadcast
        ? fetch(`${chatBase}?channel=group&limit=5`).then((r) => r.json()).catch(() => null)
        : Promise.resolve(null);

      Promise.all([channelsFetch, broadcastFetch]).then(([channelsData, broadcastData]) => {
        if (cancelledRef.current) return;

        // Unread counts
        if (channelsData?.channels) {
          const total = (channelsData.channels as { unreadCount: number }[]).reduce((sum, c) => sum + c.unreadCount, 0);
          if (prevUnreadRef.current !== null && total > prevUnreadRef.current) {
            playPing();
            if (typeof document !== "undefined" && document.hidden && originalTitleRef.current) {
              document.title = `(${total}) Nieuw bericht — ${originalTitleRef.current}`;
            }
          }
          prevUnreadRef.current = total;
          onUnreadChange(total);
        }

        // Latest broadcast
        if (onBroadcast && broadcastData?.messages) {
          const broadcasts = (broadcastData.messages as Array<{ id: string; senderName: string; content: string; createdAt: string; isBroadcast?: boolean }>)
            .filter((m) => m.isBroadcast);
          const latest = broadcasts[broadcasts.length - 1];
          onBroadcast(latest ? { id: latest.id, senderName: latest.senderName, content: latest.content, createdAt: latest.createdAt } : null);
        }
      });
    };
    fetchUnread();
    const id = setInterval(fetchUnread, pollInterval);
    return () => { cancelledRef.current = true; clearInterval(id); };
  }, [mode, identifier, pollInterval, onUnreadChange, onBroadcast]);

  return null;
}
