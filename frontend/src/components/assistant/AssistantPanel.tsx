"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, LoaderCircle, MessageCircle, RotateCcw, Send, Sparkles, Square, Wrench, X } from "lucide-react";
import { api, authorizedFetch } from "../../lib/api";

type Mode = "chatbot" | "agent";

interface Thought {
  id: string;
  tool: string;
  input: string;
  observation: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  thoughts?: Thought[];
  error?: boolean;
  pending?: boolean;
}

interface Status {
  chatbot: boolean;
  agent: boolean;
}

const MODES: Record<Mode, { label: string; hint: string; icon: typeof Bot; suggestions: string[] }> = {
  chatbot: {
    label: "Assistant",
    hint: "Questions sur l'utilisation de School ERP",
    icon: MessageCircle,
    suggestions: ["Comment faire l'appel d'une classe ?", "Comment enregistrer un paiement Mobile Money ?", "Comment importer un emploi du temps Excel ?"],
  },
  agent: {
    label: "Agent",
    hint: "Interroge les données de votre établissement",
    icon: Sparkles,
    suggestions: ["Donne-moi les chiffres clés de l'école", "Quels sont les plus gros impayés ?", "Quelles classes ont le plus d'absences ce mois-ci ?", "Cherche l'élève Kouamé"],
  },
};

/** French names of the agent's tools, as shown in the thought chips. */
const TOOL_LABELS: Record<string, string> = {
  school_overview: "Chiffres clés de l'école",
  search_students: "Recherche d'élèves",
  student_summary: "Fiche élève",
  overdue_invoices: "Factures impayées",
  attendance_report: "Présence par classe",
  timetable_day: "Emploi du temps",
};

const STORE = "assistant:v1";
const uid = () => Math.random().toString(36).slice(2, 10);

function load(): { mode: Mode; conv: Record<Mode, string | undefined>; msgs: Record<Mode, Message[]> } {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { mode: "agent", conv: { chatbot: undefined, agent: undefined }, msgs: { chatbot: [], agent: [] } };
}

/** Light formatting for model answers: paragraphs, bullet lists and **bold**, without injecting HTML. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        const inline = (s: string) =>
          s.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>));
        return isList ? (
          <ul key={i}>
            {lines.map((l, j) => (
              <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

export default function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(load);
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mode = state.mode;
  const messages = state.msgs[mode];

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ ...state, msgs: { chatbot: state.msgs.chatbot.slice(-40), agent: state.msgs.agent.slice(-40) } }));
    } catch {
      /* storage unavailable: the conversation just won't survive a reload */
    }
  }, [state]);

  useEffect(() => {
    if (!open || status) return;
    api
      .get<Status>("/assistant/status")
      .then(setStatus)
      .catch(() => setStatus({ chatbot: false, agent: false }));
  }, [open, status]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open, mode]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const patchLast = useCallback(
    (m: Mode, fn: (msg: Message) => Message) =>
      setState((s) => {
        const list = [...s.msgs[m]];
        list[list.length - 1] = fn(list[list.length - 1]);
        return { ...s, msgs: { ...s.msgs, [m]: list } };
      }),
    [],
  );

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const m = mode;
    setDraft("");
    setBusy(true);
    setState((s) => ({
      ...s,
      msgs: { ...s.msgs, [m]: [...s.msgs[m], { id: uid(), role: "user", text: message }, { id: uid(), role: "assistant", text: "", thoughts: [], pending: true }] },
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await authorizedFetch(`${api.apiUrl}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: m, message, conversationId: state.conv[m] }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Erreur ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const line = buffer.slice(0, sep).replace(/^data:\s*/, "");
          buffer = buffer.slice(sep + 2);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "token") patchLast(m, (msg) => ({ ...msg, text: msg.text + ev.text }));
          else if (ev.type === "thought")
            patchLast(m, (msg) => {
              const thoughts = [...(msg.thoughts || [])];
              const i = thoughts.findIndex((t) => t.id === ev.id);
              const t = { id: ev.id, tool: ev.tool, input: ev.input, observation: ev.observation };
              if (i === -1) thoughts.push(t);
              else thoughts[i] = t;
              return { ...msg, thoughts };
            });
          else if (ev.type === "end") setState((s) => ({ ...s, conv: { ...s.conv, [m]: ev.conversationId } }));
          else if (ev.type === "error") patchLast(m, (msg) => ({ ...msg, text: msg.text || ev.message, error: !msg.text }));
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") patchLast(m, (msg) => ({ ...msg, text: msg.text || (err as Error).message || "L'assistant est injoignable.", error: !msg.text }));
    } finally {
      patchLast(m, (msg) => ({ ...msg, pending: false, text: msg.text || (controller.signal.aborted ? "Réponse interrompue." : msg.text) }));
      abortRef.current = null;
      setBusy(false);
    }
  };

  const reset = () => setState((s) => ({ ...s, conv: { ...s.conv, [mode]: undefined }, msgs: { ...s.msgs, [mode]: [] } }));
  const configured = status ? status[mode] : true;
  const ModeIcon = MODES[mode].icon;

  return (
    <>
      <button type="button" className={`assistant-fab${open ? " is-open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="assistant-panel">
        {open ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
        <span>{open ? "Fermer" : "Assistant"}</span>
      </button>

      {open && (
        <section id="assistant-panel" className="assistant" role="dialog" aria-label="Assistant School ERP">
          <header className="assistant-head">
            <div className="assistant-title">
              <span className="assistant-avatar" aria-hidden="true">
                <ModeIcon size={18} />
              </span>
              <div>
                <strong>{MODES[mode].label}</strong>
                <small>{MODES[mode].hint}</small>
              </div>
            </div>
            <div className="assistant-head-actions">
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={reset} disabled={busy || !messages.length} aria-label="Nouvelle conversation" title="Nouvelle conversation">
                <RotateCcw size={16} />
              </button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Fermer l'assistant">
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="assistant-modes" role="tablist" aria-label="Mode de l'assistant">
            {(Object.keys(MODES) as Mode[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} className="assistant-mode" onClick={() => setState((s) => ({ ...s, mode: k }))} disabled={busy}>
                {k === "chatbot" ? <MessageCircle size={15} aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                {MODES[k].label}
              </button>
            ))}
          </div>

          <div className="assistant-list" ref={listRef} aria-live="polite">
            {!configured && (
              <div className="assistant-empty">
                <Bot size={28} aria-hidden="true" />
                <strong>{mode === "agent" ? "Agent non configuré" : "Chatbot non configuré"}</strong>
                <p>
                  L&apos;administrateur doit renseigner la clé de l&apos;application Dify ({mode === "agent" ? "DIFY_AGENT_API_KEY" : "DIFY_CHATBOT_API_KEY"}) du serveur. Voir
                  dify/README.md.
                </p>
              </div>
            )}
            {configured && messages.length === 0 && (
              <div className="assistant-empty">
                <ModeIcon size={28} aria-hidden="true" />
                <strong>{mode === "agent" ? "Que voulez-vous savoir sur votre école ?" : "Comment puis-je vous aider ?"}</strong>
                <p>
                  {mode === "agent"
                    ? "L'agent consulte les données que votre profil peut voir : effectifs, présence, élèves, impayés, emploi du temps."
                    : "Posez vos questions sur l'utilisation de l'application."}
                </p>
                <div className="assistant-suggestions">
                  {MODES[mode].suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`assistant-msg is-${msg.role}${msg.error ? " is-error" : ""}`}>
                {msg.thoughts && msg.thoughts.length > 0 && (
                  <div className="assistant-thoughts">
                    {msg.thoughts.map((t) => (
                      <details key={t.id} className="assistant-thought">
                        <summary>
                          {t.observation ? <Wrench size={13} aria-hidden="true" /> : <LoaderCircle size={13} className="spin" aria-hidden="true" />}
                          {TOOL_LABELS[t.tool] || t.tool}
                          <ChevronDown size={13} className="chev" aria-hidden="true" />
                        </summary>
                        {t.observation && <pre>{t.observation.length > 900 ? `${t.observation.slice(0, 900)}…` : t.observation}</pre>}
                      </details>
                    ))}
                  </div>
                )}
                {msg.text ? (
                  <div className="assistant-bubble">{msg.role === "assistant" ? <RichText text={msg.text} /> : msg.text}</div>
                ) : msg.pending ? (
                  <div className="assistant-bubble assistant-typing" aria-label="L'assistant écrit">
                    <i />
                    <i />
                    <i />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={4000}
              placeholder={mode === "agent" ? "Ex. : quels élèves de 6ème A ont le plus d'absences ?" : "Posez votre question…"}
              aria-label="Votre message"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              disabled={!configured}
            />
            {busy ? (
              <button type="button" className="btn btn-outline btn-icon" onClick={() => abortRef.current?.abort()} aria-label="Arrêter la réponse">
                <Square size={16} />
              </button>
            ) : (
              <button type="submit" className="btn btn-primary btn-icon" disabled={!draft.trim() || !configured} aria-label="Envoyer">
                <Send size={17} />
              </button>
            )}
          </form>
          <p className="assistant-foot">Réponses générées par IA via Dify : vérifiez les informations importantes.</p>
        </section>
      )}
    </>
  );
}
