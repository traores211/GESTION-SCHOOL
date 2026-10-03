"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  FilePlus2,
  FileCheck2,
  GraduationCap,
  LoaderCircle,
  MessagesSquare,
  Pencil,
  Phone,
  School,
  Send,
  StickyNote,
} from "lucide-react";
import { STATUS_LABELS, TimelineEvent, formatDate, relativeTime } from "../../lib/admissions";

const ICONS: Record<TimelineEvent["type"], typeof ArrowRight> = {
  CREATED: FilePlus2,
  STATUS: ArrowRight,
  NOTE: StickyNote,
  CONTACT: Phone,
  PIECE: FileCheck2,
  TEST: ClipboardList,
  INTERVIEW: MessagesSquare,
  CLASS: School,
  UPDATED: Pencil,
  ENROLLED: GraduationCap,
};

type Filter = "all" | "steps" | "pieces" | "notes";
const FILTERS: { id: Filter; label: string; match: (e: TimelineEvent) => boolean }[] = [
  { id: "all", label: "Tout", match: () => true },
  { id: "steps", label: "Étapes", match: (e) => ["CREATED", "STATUS", "TEST", "INTERVIEW", "CLASS", "ENROLLED"].includes(e.type) },
  { id: "pieces", label: "Pièces", match: (e) => e.type === "PIECE" },
  { id: "notes", label: "Notes & échanges", match: (e) => e.type === "NOTE" || e.type === "CONTACT" || e.type === "UPDATED" },
];

function show(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Everything that happened to the application, newest first, with a composer for notes. */
export default function Timeline({ events, onAdd, canWrite }: { events: TimelineEvent[]; onAdd?: (message: string, kind: "NOTE" | "CONTACT") => Promise<boolean>; canWrite: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"NOTE" | "CONTACT">("NOTE");
  const [sending, setSending] = useState(false);
  const visible = useMemo(() => events.filter(FILTERS.find((f) => f.id === filter)!.match), [events, filter]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !onAdd) return;
    setSending(true);
    if (await onAdd(message.trim(), kind)) setMessage("");
    setSending(false);
  };

  return (
    <div className="adm-timeline">
      {canWrite && onAdd && (
        <form className="adm-composer" onSubmit={submit}>
          <div className="segmented" role="group" aria-label="Type d'entrée">
            <button type="button" aria-pressed={kind === "NOTE"} onClick={() => setKind("NOTE")}>
              <StickyNote size={14} /> Note interne
            </button>
            <button type="button" aria-pressed={kind === "CONTACT"} onClick={() => setKind("CONTACT")}>
              <Phone size={14} /> Échange famille
            </button>
          </div>
          <label htmlFor="adm-note" className="visually-hidden">
            {kind === "NOTE" ? "Note interne" : "Compte rendu de l'échange avec la famille"}
          </label>
          <textarea
            id="adm-note"
            className="input"
            rows={2}
            maxLength={2000}
            placeholder={kind === "NOTE" ? "Ajouter une note visible par l'équipe…" : "Ex. Appel de la mère : bulletins déposés lundi…"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="btn-row end">
            <button type="submit" className="btn btn-secondary btn-sm" disabled={sending || !message.trim()}>
              {sending ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />} Ajouter à l&apos;historique
            </button>
          </div>
        </form>
      )}

      <div className="segmented adm-timeline-filters" role="group" aria-label="Filtrer l'historique">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Rien à afficher pour ce filtre.
        </p>
      ) : (
        <ol className="adm-events">
          {visible.map((e) => {
            const Icon = ICONS[e.type] ?? ArrowRight;
            return (
              <li key={e.id} className={`adm-event is-${e.type.toLowerCase()}${e.toStatus === "REJETE" ? " is-rejected" : ""}${e.toStatus === "CONFIRME" ? " is-confirmed" : ""}`}>
                <span className="adm-event-icon" aria-hidden="true">
                  <Icon size={14} />
                </span>
                <div className="adm-event-body">
                  <div className="adm-event-title">{e.title}</div>
                  {e.type === "STATUS" && e.fromStatus && e.toStatus && (
                    <div className="adm-event-move">
                      <span>{STATUS_LABELS[e.fromStatus] ?? e.fromStatus}</span>
                      <ArrowRight size={12} aria-label="vers" />
                      <span>{STATUS_LABELS[e.toStatus] ?? e.toStatus}</span>
                    </div>
                  )}
                  {e.message && <p className="adm-event-message">{e.message}</p>}
                  {e.data?.changes && (
                    <ul className="adm-event-changes">
                      {e.data.changes.map((c, i) => (
                        <li key={i}>
                          <strong>{c.field}</strong> : <s>{show(c.before)}</s> → {show(c.after)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="adm-event-meta">
                    {e.userName ?? "—"} · <time dateTime={e.createdAt} title={formatDate(e.createdAt, true)}>{relativeTime(e.createdAt)}</time>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
