"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playPing } from "@lib/audio/play-ping";

export interface ChatMessage {
  id: string;
  kroegentochtId: string;
  channelKey: string;
  senderType: "admin" | "supervisor";
  senderId: string;
  senderName: string;
  content: string;
  isBroadcast: boolean;
  createdAt: string;
}

export interface ChatChannelInfo {
  channelKey: string;
  channelType: "group" | "direct";
  label: string;
  participantName?: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
}

export interface ChatParticipant {
  key: string;
  name: string;
  scopeId: string | null;
}

interface UseChatConfig {
  mode: "admin" | "supervisor";
  identifier: string;
  activeChannel: string;
  pollInterval?: number;
}

function buildBaseUrl(mode: "admin" | "supervisor", identifier: string): string {
  if (mode === "admin") return `/api/kroegentochten/${encodeURIComponent(identifier)}/chat`;
  return `/api/live/supervisor/${encodeURIComponent(identifier)}/chat`;
}

export function useChat({ mode, identifier, activeChannel, pollInterval = 4000 }: UseChatConfig) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channels, setChannels] = useState<ChatChannelInfo[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [broadcasts, setBroadcasts] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);
  const lastMessageTimeRef = useRef<string | null>(null);
  const prevChannelRef = useRef(activeChannel);
  const originalTitleRef = useRef<string>("");
  const baseUrl = buildBaseUrl(mode, identifier);

  useEffect(() => {
    if (typeof document === "undefined") return;
    originalTitleRef.current = document.title;
    const handleFocus = () => { document.title = originalTitleRef.current; };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.title = originalTitleRef.current;
    };
  }, []);

  const knownIdsRef = useRef(new Set<string>());

  const fetchMessages = useCallback(() => {
    const sinceParam = lastMessageTimeRef.current ? `&since=${encodeURIComponent(lastMessageTimeRef.current)}` : "";
    fetch(`${baseUrl}?channel=${encodeURIComponent(activeChannel)}${sinceParam}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelledRef.current || !d.messages) return;
        const isIncremental = !!lastMessageTimeRef.current;
        if (isIncremental && d.messages.length > 0) {
          const incoming = d.messages as ChatMessage[];
          const newMsgs = incoming.filter((m) => !knownIdsRef.current.has(m.id));
          if (newMsgs.length > 0) {
            for (const m of newMsgs) knownIdsRef.current.add(m.id);
            setMessages((prev) => [...prev, ...newMsgs]);
            // Side-effects buiten setState updater
            playPing();
            if (typeof document !== "undefined" && document.hidden && originalTitleRef.current) {
              document.title = `(Nieuw) bericht — ${originalTitleRef.current}`;
            }
          }
        } else if (!isIncremental) {
          const msgs = d.messages as ChatMessage[];
          knownIdsRef.current = new Set(msgs.map((m) => m.id));
          setMessages(msgs);
        }
        const msgs = d.messages as ChatMessage[];
        if (msgs.length > 0) {
          lastMessageTimeRef.current = msgs[msgs.length - 1].createdAt;
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [baseUrl, activeChannel]);

  const fetchChannels = useCallback(() => {
    fetch(`${baseUrl}/channels`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelledRef.current) return;
        if (d.channels) {
          setChannels(d.channels);
          const total = (d.channels as ChatChannelInfo[]).reduce((sum, c) => sum + c.unreadCount, 0);
          setTotalUnread(total);
        }
        if (d.participants) setParticipants(d.participants);
      })
      .catch(() => {});
  }, [baseUrl]);

  useEffect(() => {
    if (prevChannelRef.current !== activeChannel) {
      setMessages([]);
      lastMessageTimeRef.current = null;
      knownIdsRef.current = new Set();
      setLoading(true);
      prevChannelRef.current = activeChannel;
    }
  }, [activeChannel]);

  useEffect(() => {
    cancelledRef.current = false;
    fetchMessages();
    fetchChannels();
    const msgId = setInterval(fetchMessages, pollInterval);
    const chId = setInterval(fetchChannels, pollInterval * 2);
    return () => { cancelledRef.current = true; clearInterval(msgId); clearInterval(chId); };
  }, [fetchMessages, fetchChannels, pollInterval]);

  const sendMessage = useCallback(async (content: string, isBroadcast = false) => {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: activeChannel, content, isBroadcast }),
    });
    if (!res.ok) throw new Error("Bericht sturen mislukt.");
    const d = await res.json();
    if (d.message) {
      knownIdsRef.current.add(d.message.id);
      setMessages((prev) => [...prev, d.message]);
      lastMessageTimeRef.current = d.message.createdAt;
    }
  }, [baseUrl, activeChannel]);

  const markRead = useCallback(async () => {
    await fetch(`${baseUrl}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: activeChannel }),
    }).catch(() => {});
    fetchChannels();
  }, [baseUrl, activeChannel, fetchChannels]);

  return { messages, channels, participants, totalUnread, broadcasts, sendMessage, markRead, loading };
}
