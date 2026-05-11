"use client";

import type { ChatChannelInfo, ChatParticipant } from "@lib/chat/use-chat";

interface ChatChannelListProps {
  channels: ChatChannelInfo[];
  participants: ChatParticipant[];
  activeChannel: string;
  onSelectChannel: (key: string) => void;
  onStartDM: (participant: ChatParticipant) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function ChatChannelList({ channels, participants, activeChannel, onSelectChannel, onStartDM }: ChatChannelListProps) {
  const existingDmKeys = new Set(channels.filter((c) => c.channelType === "direct").map((c) => c.channelKey));

  const availableForDM = participants.filter((p) => {
    const possibleKeys = channels.filter((c) => c.channelType === "direct" && c.channelKey.includes(p.key));
    return possibleKeys.length === 0;
  });

  return (
    <div className="chat-channel-list">
      {channels.map((ch) => (
        <button
          key={ch.channelKey}
          type="button"
          className={`chat-channel-item${ch.channelKey === activeChannel ? " chat-channel-active" : ""}`}
          onClick={() => onSelectChannel(ch.channelKey)}
        >
          <div className="chat-channel-info">
            <div className="chat-channel-name">
              {ch.channelType === "group" ? "💬 " : ""}{ch.label}
            </div>
            {ch.lastMessage && (
              <div className="chat-channel-preview">
                {ch.lastMessage.senderName}: {ch.lastMessage.content.slice(0, 50)}
                {ch.lastMessage.content.length > 50 ? "..." : ""}
              </div>
            )}
          </div>
          <div className="chat-channel-meta">
            {ch.lastMessage && (
              <span className="chat-channel-time">{formatTime(ch.lastMessage.createdAt)}</span>
            )}
            {ch.unreadCount > 0 && (
              <span className="chat-unread-badge">{ch.unreadCount}</span>
            )}
          </div>
        </button>
      ))}

      {availableForDM.length > 0 && (
        <>
          <div className="chat-channel-divider">Nieuw gesprek</div>
          {availableForDM.map((p) => (
            <button
              key={p.key}
              type="button"
              className="chat-channel-item"
              onClick={() => onStartDM(p)}
            >
              <div className="chat-channel-info">
                <div className="chat-channel-name">{p.name}</div>
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
