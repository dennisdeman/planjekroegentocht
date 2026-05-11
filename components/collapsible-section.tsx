"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  actions,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const filled = typeof count === "number" && count > 0;

  return (
    <div>
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <h3>
          {title}
          {typeof count === "number" && (
            <span className={`section-badge ${filled ? "section-badge-done" : "section-badge-empty"}`}>
              {count}
            </span>
          )}
        </h3>
        <span className={`collapsible-chevron ${open ? "open" : ""}`}>&#9660;</span>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {actions && (
            <div className="inline-actions collapsible-actions" style={{ marginBottom: 10 }}>
              {actions}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
