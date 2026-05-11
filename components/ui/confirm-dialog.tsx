"use client";

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

interface AlertOptions {
  title?: string;
  message: string;
  variant?: "default" | "error" | "success";
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Drop-in replacement voor window.confirm().
 * Returns a Promise<boolean> — true als bevestigd, false als geannuleerd.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    mountDialog({
      mode: "confirm",
      title: options.title ?? "Bevestigen",
      message: options.message,
      confirmLabel: options.confirmLabel ?? "Bevestigen",
      cancelLabel: options.cancelLabel ?? "Annuleren",
      variant: options.variant ?? "default",
      onResult: resolve,
    });
  });
}

/**
 * Drop-in replacement voor window.alert().
 * Returns a Promise<void> — resolved wanneer de gebruiker op OK klikt.
 */
export function alertDialog(options: AlertOptions): Promise<void> {
  return new Promise((resolve) => {
    mountDialog({
      mode: "alert",
      title: options.title ?? (options.variant === "error" ? "Fout" : "Melding"),
      message: options.message,
      confirmLabel: "OK",
      cancelLabel: "",
      variant: options.variant === "error" ? "danger" : "default",
      onResult: () => resolve(),
    });
  });
}

// ── Internal ────────────────────────────────────────────────────────

interface DialogConfig {
  mode: "confirm" | "alert";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "default" | "danger";
  onResult: (value: boolean) => void;
}

function mountDialog(config: DialogConfig) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function cleanup() {
    root.unmount();
    container.remove();
  }

  root.render(
    <DialogRenderer config={config} onDone={(result) => { cleanup(); config.onResult(result); }} />
  );
}

function DialogRenderer({ config, onDone }: { config: DialogConfig; onDone: (result: boolean) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback((result: boolean) => {
    setVisible(false);
    setTimeout(() => onDone(result), 150);
  }, [onDone]);

  // ESC key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleClose]);

  const isDanger = config.variant === "danger";

  return (
    <div
      className={`cd-backdrop${visible ? " cd-visible" : ""}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(false); }}
    >
      <div className={`cd-panel${visible ? " cd-visible" : ""}`}>
        <h3 className="cd-title">{config.title}</h3>
        <p className="cd-message">{config.message}</p>
        <div className="cd-actions">
          {config.mode === "confirm" && (
            <button
              type="button"
              className="cd-btn cd-btn-cancel"
              onClick={() => handleClose(false)}
            >
              {config.cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`cd-btn ${isDanger ? "cd-btn-danger" : "cd-btn-primary"}`}
            onClick={() => handleClose(true)}
            autoFocus
          >
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
