"use client";

import { useState } from "react";
import { api, errorMessage } from "../../../lib/api";

export default function ContactForm({ code }: { code: string }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
      await api.post(`/public/schools/${encodeURIComponent(code)}/contact`, payload);
      setState("sent");
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <p className="alert alert-success" role="status">
        Merci, votre message a bien été transmis à l&apos;établissement.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="c-name">Nom</label>
          <input id="c-name" className="input" autoComplete="name" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input id="c-email" type="email" className="input" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="c-phone">Téléphone (facultatif)</label>
          <input id="c-phone" type="tel" className="input" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="c-msg">Message</label>
        <textarea id="c-msg" className="input" required maxLength={3000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </div>
      <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="c-website">Ne pas remplir</label>
        <input id="c-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={state === "sending"}>
        {state === "sending" ? "Envoi…" : "Envoyer le message"}
      </button>
    </form>
  );
}
