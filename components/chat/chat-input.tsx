"use client";

import { useEffect, useRef, useState } from "react";

interface ChatInputProps {
  onSend: (content: string, isBroadcast?: boolean) => Promise<void>;
  showBroadcast?: boolean;
  showEmojiPicker?: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, showBroadcast = false, showEmojiPicker = false, disabled = false }: ChatInputProps) {
  const [text, setText] = useState("");
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Sluit emoji picker bij klik buiten
  useEffect(() => {
    if (!emojiOpen) return;
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [emojiOpen]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed, isBroadcast);
      setText("");
      setIsBroadcast(false);
      inputRef.current?.focus();
    } catch { /* ignore */ }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleEmojiSelect(emoji: { native: string }) {
    setText((prev) => prev + emoji.native);
    setEmojiOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="chat-input-bar">
      {showBroadcast && (
        <label className="chat-broadcast-toggle">
          <input
            type="checkbox"
            checked={isBroadcast}
            onChange={(e) => setIsBroadcast(e.target.checked)}
            disabled={disabled || sending}
          />
          <span>Broadcast</span>
        </label>
      )}
      <div className="chat-input-row">
        {showEmojiPicker && (
          <div style={{ position: "relative" }} ref={emojiRef}>
            <button
              type="button"
              className="chat-emoji-btn"
              onClick={() => setEmojiOpen((v) => !v)}
              disabled={disabled || sending}
              aria-label="Emoji"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                <line x1="9" y1="9" x2="9.01" y2="9"/>
                <line x1="15" y1="9" x2="15.01" y2="9"/>
              </svg>
            </button>
            {emojiOpen && <EmojiPickerDropdown onSelect={handleEmojiSelect} />}
          </div>
        )}
        <textarea
          ref={inputRef}
          className="chat-textarea"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht..."
          rows={1}
          disabled={disabled || sending}
        />
        <button
          type="button"
          className="chat-send-btn"
          onClick={handleSend}
          disabled={disabled || sending || !text.trim()}
        >
          {sending ? "..." : "Stuur"}
        </button>
      </div>
    </div>
  );
}

function EmojiPickerDropdown({ onSelect }: { onSelect: (emoji: { native: string }) => void }) {
  const [Picker, setPicker] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [pickerData, setPickerData] = useState<unknown>(null);

  useEffect(() => {
    // Dynamic import zodat de bundle niet groter wordt voor supervisor
    Promise.all([
      import("@emoji-mart/react"),
      import("@emoji-mart/data"),
    ]).then(([mod, data]) => {
      setPicker(() => mod.default);
      setPickerData(data.default);
    });
  }, []);

  if (!Picker || !pickerData) {
    return (
      <div className="chat-emoji-dropdown">
        <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: "0.82rem" }}>Laden...</div>
      </div>
    );
  }

  return (
    <div className="chat-emoji-dropdown">
      <Picker
        data={pickerData}
        onEmojiSelect={onSelect}
        locale="nl"
        theme="light"
        previewPosition="none"
        skinTonePosition="search"
        maxFrequentRows={2}
        perLine={8}
      />
    </div>
  );
}
