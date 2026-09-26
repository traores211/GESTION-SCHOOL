"use client";

import { useEffect, useRef, useState } from "react";
import Shell from "../../components/Shell";
import type { ViewComponent } from "../../components/ViewRenderer";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/session";
import { EmptyState, ErrorAlert, useToast } from "../../components/ui/States";

interface Pending {
  id: string;
  tool: string;
  summary: string;
  expiresAt: string;
  state?: "done" | "cancelled" | "error";
  result?: string;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; status: string }[];
  pending?: Pending[];
  views?: { title: string; components: ViewComponent[] }[];
}
interface Status {
  configured: boolean;
  enabled: boolean;
  model: string | null;
  quota: number;
  used: number;
  tools: { name: string; description: string; sensitive: boolean }[];
}

const EXAMPLES = [
  "Combien d'élèves ont des impayés ?",
  "Prépare la liste des élèves ayant une moyenne inférieure à 10",
  "Quelles sont les présences aujourd'hui ?",
  "Crée une nouvelle classe 6ème B",
  "Crée-moi un tableau de bord pour suivre les impayés",
  "Ajoute une section actualités sur ma vitrine",
];

const TOOL_LABELS: Record<string, string> = {
  search_students: "Recherche d'élèves",
  get_student: "Fiche élève",
  list_classes: "Classes",
  create_class: "Création de classe",
  get_unpaid_invoices: "Impayés",
  get_finance_stats: "Finances",
  send_payment_reminders: "Relances",
  get_attendance_today: "Présences",
  list_students_below_average: "Moyennes",
  get_payroll_summary: "Paie",
  get_schedule: "Emploi du temps",
  generate_timetable: "Génération d'EDT",
  list_document_templates: "Modèles",
  generate_document: "Document",
  update_showcase_section: "Vitrine",
  build_dashboard: "Tableau de bord",
};

export default function AssistantPage() {
  const { hasFeature } = useSession();
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Status>("/ai/status").then(setStatus).catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [turns]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: message }]);
    setBusy(true);
    try {
      const r = await api.post<{ reply: string; toolCalls: Turn["toolCalls"]; pendingActions: Pending[]; views: { title: string; components: ViewComponent[] }[] }>("/ai/chat", { message, history });
      const views = r.views ?? [];
      setTurns((t) => [...t, { role: "assistant", content: r.reply || "(pas de réponse)", toolCalls: r.toolCalls, pending: r.pendingActions, views }]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resolvePending = async (turnIdx: number, p: Pending, confirm: boolean) => {
    try {
      const r = await api.post<{ result?: unknown }>(`/ai/actions/${p.id}/${confirm ? "confirm" : "cancel"}`);
      setTurns((all) =>
        all.map((t, i) =>
          i === turnIdx
            ? { ...t, pending: t.pending?.map((x) => (x.id === p.id ? { ...x, state: confirm ? "done" : "cancelled", result: confirm ? JSON.stringify(r.result ?? {}).slice(0, 200) : undefined } : x)) }
            : t,
        ),
      );
      toast(confirm ? "Action exécutée" : "Action annulée");
    } catch (err) {
      setTurns((all) => all.map((t, i) => (i === turnIdx ? { ...t, pending: t.pending?.map((x) => (x.id === p.id ? { ...x, state: "error", result: errorMessage(err) } : x)) } : t)));
    }
  };

  const saveView = async (view: { title: string; components: ViewComponent[] }) => {
    try {
      await api.post("/ai/views", { spec: { title: view.title, components: view.components.map(({ data, error, ...c }) => c) } });
      toast("Tableau de bord enregistré — retrouvez-le dans « Mes tableaux »");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const unavailable = status && (!status.configured || !status.enabled);

  return (
    <Shell title="Assistant IA">
      <div className="page-header">
        <div>
          <h1>Assistant</h1>
          <p>Posez vos questions en langage naturel. L&apos;assistant n&apos;accède qu&apos;aux données et actions autorisées pour votre profil.</p>
        </div>
        {status?.configured && (
          <span className="chip" title="Consommation mensuelle de l'établissement">
            {status.used} / {status.quota} requêtes ce mois
          </span>
        )}
      </div>

      <ErrorAlert message={error} />

      {unavailable ? (
        <EmptyState
          title="Assistant indisponible"
          text={!status.enabled ? "L'assistant IA n'est pas inclus dans l'offre de votre établissement." : "L'assistant IA n'est pas encore configuré sur cette plateforme (clé d'API absente). Contactez l'administrateur de la plateforme."}
        />
      ) : (
        <div className="stack" style={{ maxWidth: 900 }}>
          <div className="chat" aria-live="polite">
            {turns.length === 0 && (
              <div className="card">
                <p style={{ marginBottom: 12 }}>Exemples :</p>
                <div className="row">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" className="btn btn-outline btn-sm" onClick={() => send(ex)}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className="stack" style={{ alignItems: t.role === "user" ? "flex-end" : "flex-start" }}>
                <div className={`msg msg-${t.role}`}>
                  <span className="sr-only">{t.role === "user" ? "Vous : " : "Assistant : "}</span>
                  {t.content}
                </div>
                {t.toolCalls && t.toolCalls.length > 0 && (
                  <div className="row" aria-label="Données consultées">
                    {t.toolCalls.map((c, j) => (
                      <span key={j} className="chip">
                        {TOOL_LABELS[c.tool] ?? c.tool}
                        {c.status === "error" ? " — refusé/erreur" : c.status === "pending" ? " — à confirmer" : ""}
                      </span>
                    ))}
                  </div>
                )}
                {t.pending?.map((p) => (
                  <div key={p.id} className="card" style={{ borderLeft: "4px solid var(--accent)", maxWidth: 640 }} role="group" aria-label="Action à confirmer">
                    <strong>Action à confirmer</strong>
                    <p style={{ margin: "6px 0 12px" }}>{p.summary}</p>
                    {p.state ? (
                      <p className={p.state === "error" ? "text-danger" : "muted"}>
                        {p.state === "done" ? "Exécutée." : p.state === "cancelled" ? "Annulée." : `Échec : ${p.result}`}
                      </p>
                    ) : (
                      <div className="row">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => resolvePending(i, p, true)}>
                          Confirmer
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => resolvePending(i, p, false)}>
                          Annuler
                        </button>
                        <span className="muted" style={{ fontSize: 12 }}>
                          Expire à {new Date(p.expiresAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                {t.views?.map((v, j) => (
                  <div key={j} className="card" style={{ width: "100%" }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                      <strong>{v.title}</strong>
                      {hasFeature("ai.views") && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveView(v)}>
                          Enregistrer ce tableau de bord
                        </button>
                      )}
                    </div>
                    <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                      Blocs proposés : {v.components.map((c) => `${c.type} « ${c.title ?? c.source} »`).join(", ")}. Les données s&apos;affichent une fois le tableau enregistré.
                    </p>
                  </div>
                ))}
              </div>
            ))}
            {busy && (
              <div className="msg msg-assistant" aria-busy="true">
                <span className="skeleton" style={{ display: "inline-block", width: 160, height: 14 }} />
                <span className="sr-only">L&apos;assistant réfléchit…</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="card row"
            style={{ position: "sticky", bottom: 8, padding: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="ai-input" className="sr-only">
              Votre question
            </label>
            <textarea
              id="ai-input"
              className="input"
              rows={1}
              style={{ flex: 1, minHeight: 44 }}
              placeholder="Ex. : Montre-moi les élèves de la 6ème A"
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
              Envoyer
            </button>
          </form>
        </div>
      )}
    </Shell>
  );
}
