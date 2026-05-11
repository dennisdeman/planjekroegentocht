"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@lib/chat/use-chat";

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentSenderId: string;
  loading: boolean;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  } catch { return ""; }
}

function isSameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

export function ChatMessageList({ messages, currentSenderId, loading }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  if (loading) {
    return <div className="chat-messages-empty"><span className="muted">Laden...</span></div>;
  }

  if (messages.length === 0) {
    return <div className="chat-messages-empty"><span className="muted">Nog geen berichten. Stuur het eerste bericht!</span></div>;
  }

  return (
    <div className="chat-messages" ref={containerRef}>
      {messages.map((msg, i) => {
        const isOwn = msg.senderId === currentSenderId;
        const showDate = i === 0 || !isSameDay(messages[i - 1].createdAt, msg.createdAt);
        const showName = !isOwn && (i === 0 || messages[i - 1].senderId !== msg.senderId || showDate);

        return (
          <div key={msg.id}>
            {showDate && (
              <div className="chat-date-separator">
                <span>{formatDate(msg.createdAt)}</span>
              </div>
            )}
            {msg.isBroadcast ? (
              <div className="chat-broadcast-msg">
                <div className="chat-broadcast-msg-content">
                  <strong>{msg.senderName}</strong>: {msg.content}
                </div>
                <span className="chat-msg-time">{formatTime(msg.createdAt)}</span>
              </div>
            ) : (
              <div className={`chat-bubble-row ${isOwn ? "chat-bubble-own" : "chat-bubble-other"}`}>
                <div className={`chat-bubble ${isOwn ? "chat-bubble-blue" : "chat-bubble-grey"}`}>
                  {showName && !isOwn && (
                    <div className="chat-bubble-name">{msg.senderName}</div>
                  )}
                  <div className="chat-bubble-text">{msg.content}</div>
                  <div className="chat-bubble-meta">
                    <span className="chat-msg-time">{formatTime(msg.createdAt)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
