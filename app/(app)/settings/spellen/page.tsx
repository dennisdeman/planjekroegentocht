"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MaterialItem, SpelExplanation } from "@core";
import { findSpelByKey } from "@core";
import { confirmDialog } from "@ui/ui/confirm-dialog";

interface OrgSpel {
  id: string;
  baseKey: string | null;
  name: string;
  materials: MaterialItem[];
  explanation: SpelExplanation;
  isActive: boolean;
}

export default function SpellenSettingsPage() {
  const [spellen, setSpellen] = useState<OrgSpel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OrgSpel | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  function refresh() {
    fetch("/api/org/spellen")
      .then((r) => r.json())
      .then((d) => setSpellen(d.spellen ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { refresh(); }, []);

  const filtered = search
    ? spellen.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : spellen;

  const active = filtered.filter((s) => s.isActive);
  const inactive = filtered.filter((s) => !s.isActive);

  async function handleAdd() {
    const name = prompt("Naam van de nieuwe spel:");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/org/spellen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage({ text: body.error ?? "Aanmaken mislukt.", type: "error" });
        return;
      }
      const data = await res.json();
      setMessage({ text: `"${data.spel.name}" toegevoegd.`, type: "success" });
      refresh();
    } catch {
      setMessage({ text: "Aanmaken mislukt.", type: "error" });
    }
  }

  async function handleSave(spel: OrgSpel) {
    setSaving(true);
    try {
      const res = await fetch(`/api/org/spellen/${encodeURIComponent(spel.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: spel.name,
          materials: spel.materials,
          explanation: spel.explanation,
          isActive: spel.isActive,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage({ text: body.error ?? "Opslaan mislukt.", type: "error" });
        return;
      }
      setMessage({ text: "Opgeslagen.", type: "success" });
      setEditing(null);
      refresh();
    } catch {
      setMessage({ text: "Opslaan mislukt.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(spelId: string) {
    if (!await confirmDialog({ title: "Spel resetten", message: "Weet je zeker dat je deze spel wilt resetten naar de standaardwaarden?", confirmLabel: "Resetten", variant: "danger" })) return;
    try {
      const res = await fetch(`/api/org/spellen/${encodeURIComponent(spelId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage({ text: body.error ?? "Resetten mislukt.", type: "error" });
        return;
      }
      setMessage({ text: "Teruggezet naar standaard.", type: "success" });
      setEditing(null);
      refresh();
    } catch {
      setMessage({ text: "Resetten mislukt.", type: "error" });
    }
  }

  async function handleToggleActive(spel: OrgSpel) {
    try {
      await fetch(`/api/org/spellen/${encodeURIComponent(spel.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !spel.isActive }),
      });
      refresh();
    } catch {}
  }

  if (loading) {
    return <div style={{ display: "grid", placeItems: "center", minHeight: 200 }}><p className="muted">Laden...</p></div>;
  }

  if (editing) {
    return (
      <SpelEditor
        spel={editing}
        onChange={setEditing}
        onSave={() => handleSave(editing)}
        onReset={editing.baseKey ? () => handleReset(editing.id) : undefined}
        onDelete={async () => {
          const hint = editing.baseKey
            ? `"${editing.name}" verwijderen? Je kunt deze standaardspel later opnieuw toevoegen.`
            : `"${editing.name}" definitief verwijderen?`;
          if (!await confirmDialog({ title: "Spel verwijderen", message: hint, confirmLabel: "Verwijderen", variant: "danger" })) return;
          try {
            const res = await fetch(`/api/org/spellen/${encodeURIComponent(editing.id)}`, { method: "DELETE" });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              setMessage({ text: body.error ?? "Verwijderen mislukt.", type: "error" });
              return;
            }
            setMessage({ text: `"${editing.name}" verwijderd.`, type: "success" });
            setEditing(null);
            refresh();
          } catch {
            setMessage({ text: "Verwijderen mislukt.", type: "error" });
          }
        }}
        onCancel={() => setEditing(null)}
        saving={saving}
        message={message}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Drankspellen</h2>
          <p className="muted" style={{ margin: "2px 0 0" }}>Materialen en speluitleg per spel. Beschikbaar bij al je kroegentochten.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/settings" className="button-link btn-ghost">Terug</Link>
          <button type="button" className="btn-primary" onClick={handleAdd}>+ Spel toevoegen</button>
        </div>
      </div>

      {message && (
        <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      {spellen.length > 10 && (
        <input
          type="text"
          placeholder="Zoek spel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", fontSize: "0.88rem", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--line)", textAlign: "left" }}>
              <th style={{ padding: "10px 12px" }}>Spel</th>
              <th className="hide-mobile" style={{ padding: "10px 12px", width: 90, textAlign: "center" }}>Materialen</th>
              <th className="hide-mobile" style={{ padding: "10px 12px", width: 90, textAlign: "center" }}>Speluitleg</th>
              <th style={{ padding: "10px 12px", width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {active.map((spel) => (
              <SpelRow key={spel.id} spel={spel} onEdit={() => setEditing({ ...spel })} onToggle={() => handleToggleActive(spel)} />
            ))}
            {inactive.length > 0 && (
              <>
                <tr><td colSpan={4} style={{ padding: "12px 12px 6px", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>Inactief</td></tr>
                {inactive.map((spel) => (
                  <SpelRow key={spel.id} spel={spel} onEdit={() => setEditing({ ...spel })} onToggle={() => handleToggleActive(spel)} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpelRow({ spel, onEdit, onToggle }: { spel: OrgSpel; onEdit: () => void; onToggle: () => void }) {
  const hasExplanation = !!(spel.explanation?.summary || spel.explanation?.rules);
  return (
    <tr style={{ borderBottom: "1px solid var(--line)", opacity: spel.isActive ? 1 : 0.5 }}>
      <td style={{ padding: "8px 12px" }}>
        <div style={{ fontWeight: 500 }}>{spel.name}</div>
        {spel.baseKey && (
          <span className="muted" style={{ fontSize: "0.75rem" }}>standaardspel</span>
        )}
      </td>
      <td className="hide-mobile" style={{ padding: "8px 12px", textAlign: "center" }}>{spel.materials.length > 0 ? spel.materials.length : "—"}</td>
      <td className="hide-mobile" style={{ padding: "8px 12px", textAlign: "center" }}>{hasExplanation ? "Ja" : "—"}</td>
      <td style={{ padding: "8px 12px" }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <button type="button" className="btn-sm btn-ghost" onClick={onEdit}>Bewerken</button>
          <button type="button" className="btn-sm btn-ghost" onClick={onToggle}>
            {spel.isActive ? "Deactiveren" : "Activeren"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function SpelEditor({
  spel,
  onChange,
  onSave,
  onReset,
  onDelete,
  onCancel,
  saving,
  message,
}: {
  spel: OrgSpel;
  onChange: (s: OrgSpel) => void;
  onSave: () => void;
  onReset?: () => void;
  onDelete: () => void;
  onCancel: () => void;
  saving: boolean;
  message: { text: string; type: "success" | "error" } | null;
}) {
  const [tab, setTab] = useState<"algemeen" | "materialen" | "speluitleg">("algemeen");
  const explanation = spel.explanation ?? { summary: "", rules: "", fieldSetup: "", playersPerTeam: "", duration: "" };

  function updateExplanation(field: keyof SpelExplanation, value: string) {
    onChange({ ...spel, explanation: { ...explanation, [field]: value } });
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>{spel.name}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-ghost" onClick={onCancel}>Annuleren</button>
          {onReset && <button type="button" className="btn-ghost" onClick={onReset}>Reset naar standaard</button>}
          <button type="button" className="danger-button" onClick={onDelete}>Verwijderen</button>
          <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>

      {message && (
        <div className={`notice ${message.type === "success" ? "notice-success" : "notice-warning"}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      <div className="planner-view-toggle">
        <button type="button" className={tab === "algemeen" ? "is-active" : ""} onClick={() => setTab("algemeen")}>Algemeen</button>
        <button type="button" className={tab === "materialen" ? "is-active" : ""} onClick={() => setTab("materialen")}>Materialen</button>
        <button type="button" className={tab === "speluitleg" ? "is-active" : ""} onClick={() => setTab("speluitleg")}>Speluitleg</button>
      </div>

      {tab === "algemeen" && (
        <div className="card" style={{ display: "grid", gap: 14, padding: 16 }}>
          <label>
            Naam
            <input type="text" value={spel.name} onChange={(e) => onChange({ ...spel, name: e.target.value })} />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.88rem" }}>Status:</span>
            <button
              type="button"
              className={spel.isActive ? "btn-sm btn-primary" : "btn-sm btn-ghost"}
              onClick={() => onChange({ ...spel, isActive: !spel.isActive })}
            >
              {spel.isActive ? "Actief" : "Inactief"}
            </button>
          </div>
          {spel.baseKey && (
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              Gebaseerd op standaardspel: {findSpelByKey(spel.baseKey)?.name ?? spel.baseKey}
            </p>
          )}
        </div>
      )}

      {tab === "materialen" && (
        <div className="card" style={{ display: "grid", gap: 10, padding: 16 }}>
          {spel.materials.map((item, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px auto", gap: 6, alignItems: "center" }} className="material-edit-row">
              <input
                value={item.name}
                onChange={(e) => {
                  const next = [...spel.materials];
                  next[i] = { ...next[i], name: e.target.value };
                  onChange({ ...spel, materials: next });
                }}
                placeholder="Materiaal"
              />
              <input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) => {
                  const next = [...spel.materials];
                  next[i] = { ...next[i], quantity: Math.max(0, Number(e.target.value) || 0) };
                  onChange({ ...spel, materials: next });
                }}
                style={{ textAlign: "center" }}
              />
              <input
                value={item.unit}
                onChange={(e) => {
                  const next = [...spel.materials];
                  next[i] = { ...next[i], unit: e.target.value };
                  onChange({ ...spel, materials: next });
                }}
                placeholder="eenheid"
              />
              <button
                type="button"
                className="danger-button"
                style={{ padding: "4px 8px" }}
                onClick={() => onChange({ ...spel, materials: spel.materials.filter((_, j) => j !== i) })}
              >
                x
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => onChange({ ...spel, materials: [...spel.materials, { name: "", quantity: 1, unit: "stuks", optional: false }] })}
          >
            + Materiaal
          </button>
        </div>
      )}

      {tab === "speluitleg" && (
        <div className="card" style={{ display: "grid", gap: 14, padding: 16 }}>
          <label>
            Korte omschrijving
            <textarea
              rows={2}
              value={explanation.summary}
              onChange={(e) => updateExplanation("summary", e.target.value)}
              placeholder="1-2 zinnen: wat is dit spel?"
            />
          </label>
          <label>
            Spelregels
            <textarea
              rows={8}
              value={explanation.rules}
              onChange={(e) => updateExplanation("rules", e.target.value)}
              placeholder="Stap-voor-stap spelregels. Elke regel op een eigen regel."
            />
          </label>
          <label>
            Veldopzet
            <textarea
              rows={5}
              value={explanation.fieldSetup}
              onChange={(e) => updateExplanation("fieldSetup", e.target.value)}
              placeholder="Hoe moet het veld/speelveld worden ingericht?"
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="responsive-two-col">
            <label>
              Spelers per team
              <input
                type="text"
                value={explanation.playersPerTeam}
                onChange={(e) => updateExplanation("playersPerTeam", e.target.value)}
                placeholder="bijv. 6-8 spelers"
              />
            </label>
            <label>
              Speelduur
              <input
                type="text"
                value={explanation.duration}
                onChange={(e) => updateExplanation("duration", e.target.value)}
                placeholder="bijv. 10-15 minuten"
              />
            </label>
          </div>
          <label>
            Varianten (optioneel)
            <textarea
              rows={3}
              value={explanation.variants ?? ""}
              onChange={(e) => updateExplanation("variants", e.target.value)}
              placeholder="Optionele varianten of aanpassingen voor verschillende niveaus."
            />
          </label>
        </div>
      )}
    </div>
  );
}
