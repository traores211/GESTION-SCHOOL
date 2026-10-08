"use client";

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";

export interface ThreadMessage {
  id: string;
  fromParent: boolean;
  authorName: string;
  body: string;
  createdAt: string;
}

/** A conversation between a guardian and the office: messages in order, and the reply box. */
export default function Thread({ messages, mine, closed, onSend }: { messages: ThreadMessage[]; mine: "parent" | "school"; closed: boolean; onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await onSend(body.trim());
      setBody("");
    } catch {
      // The caller reports the error; the text stays in the box so nothing typed is lost.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="thread">
      <ol className="thread-messages" aria-label="Messages">
        {messages.map((m) => {
          const own = (mine === "parent") === m.fromParent;
          return (
            <li key={m.id} className={`thread-message${own ? " is-own" : ""}`}>
              <div className="thread-meta">
                <strong>{own ? "Vous" : m.authorName}</strong> · {new Date(m.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </div>
              <p>{m.body}</p>
            </li>
          );
        })}
      </ol>
      {closed ? (
        <p className="muted">Cette conversation est close.</p>
      ) : (
        <form className="thread-reply" onSubmit={submit}>
          <label htmlFor="thread-body" className="visually-hidden">
            Votre message
          </label>
          <textarea id="thread-body" className="input" rows={3} maxLength={4000} required placeholder="Votre message…" value={body} onChange={(e) => setBody(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={sending || !body.trim()}>
            {sending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} Envoyer
          </button>
        </form>
      )}
    </div>
  );
}
