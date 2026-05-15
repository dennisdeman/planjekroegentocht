"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface ProgramItem {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  icon: string;
  createdAt: string;
}

interface ScheduleConfig {
  timeslots: Array<{ id: string; index: number; kind: string; start: string; end: string; label?: string }>;
}

const ICON_OPTIONS = [
  { value: "event", label: "Algemeen", emoji: "📋" },
  { value: "coffee", label: "Koffie/thee", emoji: "☕" },
  { value: "food", label: "Eten/BBQ", emoji: "🍖" },
  { value: "trophy", label: "Prijsuitreiking", emoji: "🏆" },
  { value: "music", label: "Muziek/feest", emoji: "🎵" },
  { value: "speech", label: "Toespraak", emoji: "🎤" },
  { value: "flag", label: "Opening/sluiting", emoji: "🚩" },
];

function iconEmoji(icon: string): string {
  return ICON_OPTIONS.find((o) => o.value === icon)?.emoji ?? "📋";
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function toLocalDatetimeValue(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

interface ProgramItemsSectionProps {
  kroegentochtId: string;
}

export function ProgramItemsSection({ kroegentochtId }: ProgramItemsSectionProps) {
  const [items, setItems] = useState<ProgramItem[]>([]);
  const [config, setConfig] = useState<ScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [icon, setIcon] = useState("event");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(() => {
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/program-items`)
      .then((r) => r.json())
      .then((d) => { if (d.items) setItems(d.items); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [kroegentochtId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/matches`)
      .then((r) => r.json())
      .then((d) => { if (d.config) setConfig(d.config); })
      .catch(() => {});
  }, [kroegentochtId]);

  const allTimeslots = useMemo(() => {
    if (!config) return [];
    return [...config.timeslots].sort((a, b) => a.index - b.index);
  }, [config]);

  const activeTimeslots = useMemo(
    () => allTimeslots.filter((t) => t.kind === "active"),
    [allTimeslots]
  );

  // Bouw tijdlijn: schema-blokken + eigen items, gesorteerd
  type TimelineEntry =
    | { type: "round"; slot: typeof allTimeslots[number]; roundNum: number; sortMs: number }
    | { type: "break"; slot: typeof allTimeslots[number]; sortMs: number }
    | { type: "transition"; minutes: number; sortMs: number }
    | { type: "item"; item: ProgramItem; sortMs: number };

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];
    let roundNum = 0;
    for (let i = 0; i < allTimeslots.length; i++) {
      const slot = allTimeslots[i];
      if (i > 0) {
        const prevEnd = new Date(allTimeslots[i - 1].end).getTime();
        const curStart = new Date(slot.start).getTime();
        const gapMin = Math.round((curStart - prevEnd) / 60_000);
        if (gapMin > 0) {
          entries.push({ type: "transition", minutes: gapMin, sortMs: prevEnd + 1 });
        }
      }
      if (slot.kind === "active") {
        roundNum++;
        entries.push({ type: "round", slot, roundNum, sortMs: new Date(slot.start).getTime() });
      } else {
        entries.push({ type: "break", slot, sortMs: new Date(slot.start).getTime() });
      }
    }
    for (const item of items) {
      // Normaliseer naar fake-UTC datum (zelfde als timeslots) voor correcte sortering
      const d = new Date(item.startTime);
      const fakeSortMs = Date.UTC(2026, 0, 1, d.getHours(), d.getMinutes(), 0, 0);
      entries.push({ type: "item", item, sortMs: fakeSortMs });
    }
    entries.sort((a, b) => a.sortMs - b.sortMs);
    return entries;
  }, [allTimeslots, items]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setTitle("");
    setDescription("");
    setStartTime("");
    setEndTime("");
    setIcon("event");
  }

  function startEdit(item: ProgramItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setStartTime(toLocalDatetimeValue(item.startTime));
    setEndTime(item.endTime ? toLocalDatetimeValue(item.endTime) : "");
    setIcon(item.icon);
    setShowForm(true);
  }

  async function handleSave() {
    if (!title.trim() || !startTime) return;
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        icon,
      };
      if (editingId) {
        await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/program-items/${editingId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/program-items`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      resetForm();
      fetchItems();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(itemId: string) {
    if (!(await confirmDialog({ title: "Item verwijderen", message: "Weet je zeker dat je dit programma-item wilt verwijderen?", confirmLabel: "Verwijderen", variant: "danger" }))) return;
    await fetch(`/api/kroegentochten/${encodeURIComponent(kroegentochtId)}/program-items/${itemId}`, { method: "DELETE" }).catch(() => {});
    fetchItems();
  }

  if (loading) {
    return (
      <section className="card" style={{ marginTop: 12 }}>
        <p className="muted" style={{ textAlign: "center", padding: 20 }}>Laden...</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Dagprogramma</h3>
        {!showForm && (
          <button type="button" className="btn-primary btn-sm" onClick={() => { resetForm(); setShowForm(true); }}>
            + Item toevoegen
          </button>
        )}
      </div>
      <p className="muted" style={{ margin: "0 0 14px", fontSize: "0.82rem" }}>
        Voeg eigen items toe aan het dagprogramma. Het vaste schema wordt grijs weergegeven.
      </p>

      {showForm && (
        <div style={{ border: "1px solid var(--brand)", borderRadius: 8, padding: 12, marginBottom: 12, background: "rgba(14, 46, 80,0.04)" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 200))}
                placeholder="Titel, bijv. Ontvangst met koffie"
                style={{ fontSize: "0.88rem" }}
                autoFocus
              />
              <select value={icon} onChange={(e) => setIcon(e.target.value)} style={{ fontSize: "0.85rem", padding: "4px 8px" }}>
                {ICON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Beschrijving (optioneel)"
              style={{ fontSize: "0.82rem" }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem" }}>
                <span className="muted">Start</span>
                <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ fontSize: "0.82rem" }} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem" }}>
                <span className="muted">Einde</span>
                <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ fontSize: "0.82rem" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn-ghost btn-sm" onClick={resetForm} disabled={saving}>Annuleren</button>
              <button type="button" className="btn-primary btn-sm" onClick={handleSave} disabled={saving || !title.trim() || !startTime}>
                {saving ? "Opslaan..." : editingId ? "Opslaan" : "Toevoegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {timeline.map((entry, idx) => {
          if (entry.type === "round") {
            const roundLabel = `Ronde ${entry.roundNum}/${activeTimeslots.length}`;
            return <FixedBlock key={entry.slot.id} emoji="⚽" label={roundLabel} time={entry.slot.label || `${fmtTime(entry.slot.start)} – ${fmtTime(entry.slot.end)}`} />;
          }
          if (entry.type === "break") {
            return <FixedBlock key={entry.slot.id} emoji="☕" label="Pauze" time={entry.slot.label || `${fmtTime(entry.slot.start)} – ${fmtTime(entry.slot.end)}`} />;
          }
          if (entry.type === "transition") {
            return (
              <div key={`trans-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span className="muted" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>Wisseltijd · {entry.minutes} min</span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>
            );
          }
          // entry.type === "item"
          const item = entry.item;
          return (
            <div
              key={item.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                border: "1px solid var(--brand)", borderRadius: 8, background: "rgba(14, 46, 80,0.04)", fontSize: "0.88rem",
              }}
            >
              <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{iconEmoji(item.icon)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                {item.description && <div className="muted" style={{ fontSize: "0.78rem" }}>{item.description}</div>}
              </div>
              <div className="muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap", flexShrink: 0 }}>
                {fmtTime(item.startTime)}{item.endTime ? ` – ${fmtTime(item.endTime)}` : ""}
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={() => startEdit(item)} style={{ padding: "4px 8px", fontSize: "0.78rem" }}>Bewerk</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => handleDelete(item.id)} style={{ padding: "4px 8px", fontSize: "0.78rem", color: "var(--error)" }}>&times;</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FixedBlock({ emoji, label, time }: { emoji: string; label: string; time: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "6px 12px",
      borderRadius: 6, background: "var(--bg-offset, #f5f7fa)", border: "1px solid var(--line)",
      fontSize: "0.84rem", color: "var(--muted)", opacity: 0.7,
    }}>
      <span style={{ fontSize: "0.9rem" }}>{emoji}</span>
      <div style={{ flex: 1, fontWeight: 500 }}>{label}</div>
      <span style={{ fontSize: "0.78rem" }}>{time}</span>
    </div>
  );
}
