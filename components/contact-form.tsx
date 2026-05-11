"use client";

import { useState } from "react";

export function ContactForm() {
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [onderwerp, setOnderwerp] = useState("");
  const [bericht, setBericht] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, email, onderwerp, bericht }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: "error", text: data.error ?? "Versturen mislukt." });
      } else {
        setResult({ type: "success", text: "Bericht verstuurd. We nemen zo snel mogelijk contact op." });
        setNaam("");
        setEmail("");
        setOnderwerp("");
        setBericht("");
      }
    } catch {
      setResult({ type: "error", text: "Versturen mislukt. Probeer het later opnieuw." });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {result && (
        <div className={`notice ${result.type === "success" ? "notice-success" : "notice-warning"}`} style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>{result.text}</p>
        </div>
      )}
      <form className="pub-contact-form" onSubmit={handleSubmit}>
        <label>
          Naam
          <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} required placeholder="Je naam" />
        </label>
        <label>
          E-mailadres
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="je@email.nl" />
        </label>
        <label>
          Onderwerp
          <select value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} required>
            <option value="">Kies een onderwerp</option>
            <option value="Vraag over de tool">Vraag over de tool</option>
            <option value="Hulp bij mijn kroegentocht">Hulp bij mijn kroegentocht</option>
            <option value="Feedback">Feedback</option>
            <option value="Samenwerking">Samenwerking</option>
            <option value="Anders">Anders</option>
          </select>
        </label>
        <label>
          Bericht
          <textarea value={bericht} onChange={(e) => setBericht(e.target.value)} required placeholder="Waar kunnen we je mee helpen?" rows={6} />
        </label>
        <button type="submit" className="button-link btn-primary" style={{ width: "100%" }} disabled={sending}>
          {sending ? "Versturen..." : "Verstuur bericht"}
        </button>
      </form>
    </>
  );
}
