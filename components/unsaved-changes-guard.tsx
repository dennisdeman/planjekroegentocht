"use client";

import { useEffect, useState, useCallback } from "react";
import { usePlannerStore } from "@lib/planner/store";

/**
 * Simpele opslaan-prompt bij navigatie met onopgeslagen wijzigingen.
 * Twee opties: Opslaan of Niet opslaan.
 */
export function UnsavedChangesGuard() {
  const dirty = usePlannerStore((s) => s.dirty);
  const saveCurrent = usePlannerStore((s) => s.saveCurrent);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Browser close/refresh protection
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!usePlannerStore.getState().dirty) return;
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Intercept internal navigation via nav-link clicks
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!usePlannerStore.getState().dirty) return;

      const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;

      // Same page — let it through
      if (href === window.location.pathname) return;

      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  const navigate = useCallback((href: string) => {
    window.location.href = href;
  }, []);

  if (!pendingHref) return null;

  return (
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingHref(null); }}>
      <div className="help-modal-card" style={{ width: "min(420px, 100%)" }}>
        <h3 style={{ margin: "0 0 8px" }}>Onopgeslagen wijzigingen</h3>
        <p>Wil je de wijzigingen opslaan?</p>
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn-primary" onClick={async () => {
            await saveCurrent();
            const href = pendingHref;
            setPendingHref(null);
            navigate(href);
          }}>
            Ja, opslaan
          </button>
          <button type="button" className="btn-ghost" onClick={() => {
            const href = pendingHref;
            setPendingHref(null);
            usePlannerStore.setState({ dirty: false });
            navigate(href);
          }}>
            Nee, niet opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
