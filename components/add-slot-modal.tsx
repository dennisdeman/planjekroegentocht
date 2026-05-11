"use client";

import { useState } from "react";
import type { TimeslotV2 } from "@core";

interface AddSlotModalProps {
  timeslots: TimeslotV2[];
  defaultDuration: number;
  onAdd: (afterSlotId: string, kind: "active" | "break", durationMinutes: number) => void;
  onClose: () => void;
}

function formatLabel(slot: TimeslotV2): string {
  const kindLabel = slot.kind === "break" ? "Pauze" : `Ronde ${slot.index}`;
  return `${kindLabel} (${slot.label ?? slot.id})`;
}

export function AddSlotModal({ timeslots, defaultDuration, onAdd, onClose }: AddSlotModalProps) {
  const sorted = [...timeslots].sort((a, b) => a.index - b.index);
  const [kind, setKind] = useState<"active" | "break">("active");
  const [afterSlotId, setAfterSlotId] = useState(sorted[sorted.length - 1]?.id ?? "");
  const [duration, setDuration] = useState(defaultDuration);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onAdd(afterSlotId, kind, duration);
    onClose();
  }

  return (
    <div className="help-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="help-modal-card" style={{ width: "min(420px, 100%)" }}>
        <div className="help-modal-header">
          <h3>Slot toevoegen</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Sluiten</button>
        </div>

        <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: 14 }}>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as "active" | "break")}>
              <option value="active">Spel</option>
              <option value="break">Pauze</option>
            </select>
          </label>

          <label>
            Invoegen na
            <select value={afterSlotId} onChange={(e) => setAfterSlotId(e.target.value)}>
              <option value="">Helemaal aan het begin</option>
              {sorted.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {formatLabel(slot)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Duur (minuten)
            <input
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || defaultDuration))}
            />
          </label>

          <div className="inline-actions" style={{ marginTop: 4 }}>
            <button type="submit" className="btn-primary">Toevoegen</button>
            <button type="button" className="btn-ghost" onClick={onClose}>Annuleren</button>
          </div>
        </form>
      </div>
    </div>
  );
}
