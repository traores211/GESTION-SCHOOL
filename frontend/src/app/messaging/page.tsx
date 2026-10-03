"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, LoaderCircle, MessageSquareText, Send, TriangleAlert } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, Pagination, TableSkeleton, useFeedback } from "../../components/ui";
import { KpiCard } from "../../components/dashboard/ui";
import { api, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";

interface Status {
  provider: string;
  live: boolean;
  channels: string[];
  quota: number;
  used: number;
  failed: number;
  events: string[];
}

interface Message {
  id: string;
  createdAt: string;
  channel: string;
  to: string;
  event: string;
  body: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  error: string | null;
  segments: number;
}

const EVENTS: Record<string, { label: string; hint: string }> = {
  ABSENCE: { label: "Absence", hint: "Le jour même, quand un élève est noté absent à l'appel." },
  OVERDUE: { label: "Relance d'impayé", hint: "Chaque matin, une relance par facture en retard et par semaine." },
  PAYMENT: { label: "Reçu de paiement", hint: "À chaque paiement encaissé, au guichet ou en ligne." },
  ADMISSION: { label: "Convocation d'admission", hint: "Quand un test ou un entretien reçoit une date." },
};
const EVENT_LABELS: Record<string, string> = { ...Object.fromEntries(Object.entries(EVENTS).map(([k, v]) => [k, v.label])), TEST: "Test" };
const STATUS: Record<Message["status"], { label: string; badge: string }> = {
  SENT: { label: "Envoyé", badge: "badge-green" },
  FAILED: { label: "Échec", badge: "badge-danger" },
  SKIPPED: { label: "Non envoyé", badge: "badge-warning" },
};
const PROVIDERS: Record<string, string> = { log: "Journal uniquement", orange: "Orange SMS", twilio: "Twilio" };
const MANAGEMENT = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];
const FINANCE = [...MANAGEMENT, "COMPTABLE"];

function MessagingContent() {
  const feedback = useFeedback();
  const role = getStoredUser()?.role ?? "";
  const canManage = MANAGEMENT.includes(role);
  const [status, setStatus] = useState<Status | null>(null);
  const [data, setData] = useState<{ items: Message[]; total: number; page: number; pageSize: number; pageCount: number } | null>(null);
  const [filters, setFilters] = useState({ status: "", event: "", q: "" });
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [quota, setQuota] = useState<number | null>(null);

  const loadStatus = useCallback(() => {
    api
      .get<Status>("/messaging/status")
      .then((s) => {
        setStatus(s);
        setQuota(s.quota);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const loadLogs = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "25" });
    for (const [k, v] of Object.entries(filters)) if (v) q.set(k, v);
    api
      .get<NonNullable<typeof data>>(`/messaging/logs?${q}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [filters, page]);

  useEffect(loadStatus, [loadStatus]);
  useEffect(loadLogs, [loadLogs]);

  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters({ ...filters, ...patch });
    setPage(1);
  };

  const saveSettings = async (patch: { quota?: number; events?: string[] }) => {
    setBusy("settings");
    try {
      const next = await api.patch<Status>("/messaging/settings", patch);
      setStatus(next);
      setQuota(next.quota);
      feedback.success("Réglages enregistrés");
    } catch (err) {
      feedback.error("Enregistrement impossible", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleEvent = (event: string) => {
    if (!status) return;
    saveSettings({ events: status.events.includes(event) ? status.events.filter((e) => e !== event) : [...status.events, event] });
  };

  const runReminders = async () => {
    const yes = await feedback.confirm({
      title: "Envoyer les relances d'impayés maintenant ?",
      message: "Chaque famille ayant une facture en retard reçoit un SMS, sauf si elle a déjà été relancée cette semaine pour cette facture.",
      confirmLabel: "Envoyer les relances",
    });
    if (!yes) return;
    setBusy("reminders");
    try {
      const result = await api.post<{ invoices: number; sent: number }>("/messaging/reminders/overdue");
      feedback.success(`${result.sent} relance(s) envoyée(s)`, `${result.invoices} facture(s) en retard examinée(s).`);
      loadStatus();
      loadLogs();
    } catch (err) {
      feedback.error("Relances impossibles", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("test");
    setTestError(null);
    try {
      const entry = await api.post<Message>("/messaging/test", { to: testTo });
      if (entry.status === "SENT") {
        feedback.success("Message de test envoyé", `Vers ${entry.to}`);
        setTesting(false);
      } else {
        setTestError(entry.error ?? "Le message n'a pas été envoyé");
      }
      loadStatus();
      loadLogs();
    } catch (err) {
      setTestError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const usedRate = status && status.quota > 0 ? Math.min(100, (status.used / status.quota) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Messages aux familles"
        description="SMS envoyés automatiquement aux parents : absences, relances d'impayés, reçus de paiement, convocations."
        actions={
          <>
            {canManage && (
              <button
                className="btn btn-outline"
                onClick={() => {
                  setTestError(null);
                  setTesting(true);
                }}
              >
                <Send size={16} /> Message de test
              </button>
            )}
            {FINANCE.includes(role) && (
              <button className="btn btn-primary" onClick={runReminders} disabled={busy === "reminders"}>
                {busy === "reminders" ? <LoaderCircle size={16} className="spin" /> : <BellRing size={16} />} Relancer les impayés
              </button>
            )}
          </>
        }
      />

      {status && !status.live && (
        <div className="alert alert-warning" role="note" style={{ marginBottom: 16 }}>
          <TriangleAlert size={16} />
          <div className="alert-body">
            <strong>Aucun opérateur SMS n&apos;est configuré.</strong> Les messages sont préparés et consignés dans le journal ci-dessous, mais rien n&apos;est envoyé sur les téléphones. Renseignez un compte Orange SMS ou Twilio dans la configuration du serveur pour activer l&apos;envoi.
          </div>
        </div>
      )}

      {status && (
        <div className="kpi-grid">
          <KpiCard label="SMS ce mois-ci" icon={<MessageSquareText size={16} />} value={status.used} meter={usedRate} sub={`sur ${status.quota} autorisés`} accent={usedRate >= 90 ? "danger" : undefined} />
          <KpiCard label="Échecs ce mois-ci" icon={<TriangleAlert size={16} />} value={status.failed} accent={status.failed ? "danger" : "green"} sub="refusés par l'opérateur" />
          <KpiCard label="Opérateur" icon={<Send size={16} />} value={PROVIDERS[status.provider] ?? status.provider} sub={status.live ? status.channels.join(" · ").toUpperCase() : "envoi désactivé"} />
        </div>
      )}

      {status && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 className="card-title" style={{ marginBottom: 4 }}>
            Messages automatiques
          </h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Un parent qui a refusé les SMS (fiche parent) n&apos;en reçoit aucun.
          </p>
          <div className="msg-events">
            {Object.entries(EVENTS).map(([key, e]) => (
              <label key={key} className="msg-event">
                <input type="checkbox" checked={status.events.includes(key)} disabled={!canManage || busy === "settings"} onChange={() => toggleEvent(key)} />
                <span>
                  <strong>{e.label}</strong>
                  <span className="muted">{e.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {canManage && quota !== null && (
            <form
              className="msg-quota"
              onSubmit={(e) => {
                e.preventDefault();
                saveSettings({ quota });
              }}
            >
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="msg-quota">Plafond mensuel (nombre de SMS)</label>
                <input id="msg-quota" type="number" min={0} max={1000000} step={50} className="input" value={quota} onChange={(e) => setQuota(Number(e.target.value))} />
              </div>
              <button type="submit" className="btn btn-secondary" disabled={busy === "settings" || quota === status.quota}>
                Enregistrer
              </button>
              <p className="field-hint">Au-delà, les messages ne partent plus jusqu&apos;au mois suivant : la facture de l&apos;opérateur reste maîtrisée.</p>
            </form>
          )}
        </div>
      )}

      <div className="table-toolbar audit-filters">
        <select className="input" aria-label="Type de message" value={filters.event} onChange={(e) => setFilter({ event: e.target.value })}>
          <option value="">Tous les types</option>
          {Object.entries(EVENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Statut" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Rechercher (numéro, texte…)" aria-label="Rechercher un message" value={filters.q} onChange={(e) => setFilter({ q: e.target.value })} />
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Journal indisponible">
            {error}
          </EmptyState>
        ) : !data ? (
          <TableSkeleton columns={5} rows={6} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<MessageSquareText size={22} />} title={filters.event || filters.status || filters.q ? "Aucun message ne correspond" : "Aucun message pour l'instant"}>
            Les messages apparaissent ici dès qu&apos;une absence, un paiement ou une relance en déclenche un.
          </EmptyState>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Destinataire</th>
                  <th>Message</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap">{new Date(m.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{EVENT_LABELS[m.event] ?? m.event}</td>
                    <td className="nowrap tabular">
                      {m.to}
                      {m.channel !== "sms" && <div className="cell-sub">{m.channel}</div>}
                    </td>
                    <td className="msg-body">
                      {m.body}
                      {m.segments > 1 && <div className="cell-sub">{m.segments} SMS</div>}
                    </td>
                    <td>
                      <span className={`badge ${STATUS[m.status]?.badge ?? "badge-neutral"}`}>{STATUS[m.status]?.label ?? m.status}</span>
                      {m.error && <div className="cell-sub">{m.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPage={setPage} unit="message" />
          </>
        )}
      </div>

      <Modal
        open={testing}
        onClose={() => setTesting(false)}
        busy={busy === "test"}
        title="Message de test"
        description="Vérifie que l'envoi fonctionne vers un numéro de votre choix. Compte dans le plafond mensuel."
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setTesting(false)} disabled={busy === "test"}>
              Annuler
            </button>
            <button type="submit" form="msg-test-form" className="btn btn-primary" disabled={busy === "test"}>
              {busy === "test" ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} Envoyer
            </button>
          </>
        }
      >
        <form id="msg-test-form" onSubmit={sendTest}>
          <FormError message={testError} />
          <div className="field">
            <label htmlFor="msg-test-to" className="required">
              Numéro de téléphone
            </label>
            <input id="msg-test-to" type="tel" className="input" required minLength={8} maxLength={20} placeholder="07 01 02 03 04" autoComplete="off" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <span className="field-hint">Sans indicatif, le numéro est considéré comme ivoirien (+225).</span>
          </div>
        </form>
      </Modal>
    </>
  );
}

export default function MessagingPage() {
  return (
    <Shell title="Messages aux familles">
      <MessagingContent />
    </Shell>
  );
}
