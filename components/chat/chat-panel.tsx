"use client";

import { useEffect, useState } from "react";
import { useChat, type ChatParticipant } from "@lib/chat/use-chat";
import { ChatMessageList } from "./chat-message-list";
import { ChatInput } from "./chat-input";
import { ChatChannelList } from "./chat-channel-list";
import { PushPermissionBanner } from "./push-permission-banner";

interface ChatPanelProps {
  mode: "admin" | "supervisor";
  identifier: string;
  currentSenderId: string;
  initialChannel?: string | null;
  onUnreadChange?: (count: number) => void;
}

export function ChatPanel({ mode, identifier, currentSenderId, initialChannel, onUnreadChange }: ChatPanelProps) {
  const [activeChannel, setActiveChannel] = useState<string | null>(initialChannel ?? null);

  useEffect(() => {
    if (initialChannel !== undefined && initialChannel !== null) {
      setActiveChannel(initialChannel);
    }
  }, [initialChannel]);

  const { messages, channels, participants, totalUnread, sendMessage, markRead, loading } = useChat({
    mode,
    identifier,
    activeChannel: activeChannel ?? "group",
  });

  useEffect(() => {
    onUnreadChange?.(totalUnread);
  }, [totalUnread, onUnreadChange]);

  useEffect(() => {
    if (activeChannel && !loading && messages.length > 0) {
      markRead();
    }
  }, [activeChannel, messages.length]);

  function handleSelectChannel(key: string) {
    setActiveChannel(key);
  }

  function handleStartDM(participant: ChatParticipant) {
    const myKey = mode === "admin" ? "admin" : `sv:${currentSenderId}`;
    const sorted = [myKey, participant.key].sort();
    setActiveChannel(`dm:${sorted[0]}+${sorted[1]}`);
  }

  function handleBack() {
    setActiveChannel(null);
  }

  if (activeChannel === null) {
    const activeInfo = channels.find((c) => c.channelKey === activeChannel);
    return (
      <div className="chat-panel">
        <div className="chat-panel-header">
          <span style={{ fontWeight: 600, flex: 1 }}>Berichten</span>
        </div>
        <div style={{ padding: "8px 12px 0" }}>
          <PushPermissionBanner mode={mode} identifier={identifier} />
        </div>
        <ChatChannelList
          channels={channels}
          participants={participants}
          activeChannel=""
          onSelectChannel={handleSelectChannel}
          onStartDM={handleStartDM}
        />
      </div>
    );
  }

  const activeInfo = channels.find((c) => c.channelKey === activeChannel);
  const activeLabel = activeInfo?.label ?? (activeChannel === "group" ? "Groepschat" : "Chat");

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <button type="button" className="chat-back-btn" onClick={handleBack}>
          ←
        </button>
        <span style={{ fontWeight: 600, flex: 1 }}>{activeLabel}</span>
      </div>
      <ChatMessageList messages={messages} currentSenderId={currentSenderId} loading={loading} />
      <ChatInput onSend={sendMessage} showBroadcast={mode === "admin" && activeChannel === "group"} showEmojiPicker={mode === "admin"} />
    </div>
  );
}
