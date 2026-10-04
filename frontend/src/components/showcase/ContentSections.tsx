"use client";

import { useState } from "react";
import { CalendarDays, Clock, Download, Send } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import type { ShowcaseContent } from "../../lib/showcase";

const paragraphs = (text: string) => text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>);

/** History, values, word of the head, facilities, activities, events and downloads: shown only when filled in. */
export function ContentSections({ content }: { content: ShowcaseContent }) {
  const lists = [
    { title: "Nos infrastructures", items: content.facilities ?? [] },
    { title: "Activités et vie scolaire", items: content.activities ?? [] },
  ].filter((l) => l.items.length > 0);
  const events = content.events ?? [];
  const downloads = content.downloads ?? [];
  const hasStory = content.history || content.values || content.directorMessage;
  if (!hasStory && lists.length === 0 && events.length === 0 && downloads.length === 0 && !content.openingHours) return null;

  return (
    <section className="sc-section sc-section-alt" id="presentation">
      <div className="sc-container sc-content" data-reveal>
        {content.directorMessage && (
          <figure className="sc-word">
            <blockquote>{paragraphs(content.directorMessage)}</blockquote>
            <figcaption>{content.directorName ? `${content.directorName}, direction de l'établissement` : "La direction"}</figcaption>
          </figure>
        )}
        {(content.history || content.values) && (
          <div className="sc-content-grid">
            {content.history && (
              <div>
                <h3>Notre histoire</h3>
                {paragraphs(content.history)}
              </div>
            )}
            {content.values && (
              <div>
                <h3>Nos valeurs</h3>
                {paragraphs(content.values)}
              </div>
            )}
          </div>
        )}
        {lists.length > 0 && (
          <div className="sc-content-grid">
            {lists.map((l) => (
              <div key={l.title}>
                <h3>{l.title}</h3>
                <ul className="sc-list">
                  {l.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {(events.length > 0 || downloads.length > 0 || content.openingHours) && (
          <div className="sc-content-grid">
            {events.length > 0 && (
              <div>
                <h3>
                  <CalendarDays size={18} aria-hidden="true" /> Événements à venir
                </h3>
                <ul className="sc-list sc-events">
                  {events.map((e) => (
                    <li key={`${e.date}-${e.title}`}>
                      <strong>{new Date(e.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</strong> : {e.title}
                      {e.description && <span className="sc-event-more">{e.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(downloads.length > 0 || content.openingHours) && (
              <div>
                {content.openingHours && (
                  <>
                    <h3>
                      <Clock size={18} aria-hidden="true" /> Horaires
                    </h3>
                    <p>{content.openingHours}</p>
                  </>
                )}
                {downloads.length > 0 && (
                  <>
                    <h3>
                      <Download size={18} aria-hidden="true" /> Documents à télécharger
                    </h3>
                    <ul className="sc-list">
                      {downloads.map((d) => (
                        <li key={d.url}>
                          <a href={api.mediaUrl(d.url) ?? d.url} target="_blank" rel="noopener noreferrer">
                            {d.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const EMPTY = { name: "", email: "", phone: "", message: "", consent: false };

/** Contact form of the public page: the message reaches the office in the application and by e-mail. */
export function ContactForm({ code }: { code: string }) {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      await api.post(`/public/schools/${code}/contact`, { ...form, phone: form.phone || undefined });
      setState("sent");
      setForm(EMPTY);
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div className="alert alert-success sc-contact-form" role="status">
        <div className="alert-body">
          <span className="alert-title">Message envoyé.</span> Le secrétariat vous répondra à l&apos;adresse indiquée.
        </div>
      </div>
    );
  }

  return (
    <form className="sc-contact-form" onSubmit={submit}>
      <h3>Écrire à l&apos;établissement</h3>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ct-name" className="required">
            Votre nom
          </label>
          <input id="ct-name" className="input" required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ct-email" className="required">
            Votre e-mail
          </label>
          <input id="ct-email" type="email" className="input" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ct-phone">Téléphone</label>
          <input id="ct-phone" type="tel" className="input" maxLength={30} autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field full">
          <label htmlFor="ct-message" className="required">
            Votre message
          </label>
          <textarea id="ct-message" className="input" rows={4} required minLength={10} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
      </div>
      <label className="checkbox" style={{ display: "flex", marginBottom: 12 }}>
        <input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
        J&apos;accepte que mes coordonnées soient utilisées pour me répondre.
      </label>
      <button type="submit" className="btn btn-primary" disabled={state === "sending"}>
        <Send size={16} /> Envoyer
      </button>
    </form>
  );
}
