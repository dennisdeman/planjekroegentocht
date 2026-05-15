"use client";

import type { ConfigWarning } from "@lib/planner/store";

interface Props {
  warnings: ConfigWarning[];
  onProceed: () => void;
  onCancel: () => void;
}

export function GenerationWarningsModal({ warnings, onProceed, onCancel }: Props) {
  return (
    <div
      className="help-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="help-modal-card"
        style={{
          width: "min(640px, 100%)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border, #ddd)",
          }}
        >
          <h3 style={{ margin: 0 }}>
            ⚠️ Let op — {warnings.length} aandachtspunt{warnings.length > 1 ? "en" : ""}
          </h3>
          <button type="button" className="btn-sm btn-ghost" onClick={onCancel}>
            Sluit
          </button>
        </header>

        <div style={{ padding: "16px", overflowY: "auto", flex: 1 }}>
          <p style={{ marginTop: 0 }}>
            Je configuratie wijkt af van de ideale 1-op-1 indeling. Het schema kan wel
            gemaakt worden, maar lees onderstaande even door zodat je weet wat je krijgt.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            {warnings.map((w, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #f59e0b",
                  borderRadius: 8,
                  padding: "10px 12px",
                  background: "#fffbeb",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{w.title}</div>
                <div style={{ fontSize: "0.9rem", marginBottom: 8 }}>{w.body}</div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#92400e",
                    background: "#fef3c7",
                    padding: "6px 8px",
                    borderRadius: 4,
                  }}
                >
                  💡 <strong>Tip:</strong> {w.advice}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 16px",
            borderTop: "1px solid var(--border, #ddd)",
          }}
        >
          <button type="button" className="btn-sm btn-ghost" onClick={onCancel}>
            Aanpassen
          </button>
          <button type="button" className="btn-sm" onClick={onProceed}>
            Akkoord, genereer toch
          </button>
        </footer>
      </div>
    </div>
  );
}
