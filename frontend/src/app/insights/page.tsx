"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Info, LoaderCircle, Mail, TriangleAlert } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, PageHeader, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";
import "./insights.css";

interface Line {
  topic: "attendance" | "finance" | "grades" | "admissions";
  tone: "good" | "warning" | "info";
  text: string;
}

interface Weekly {
  from: string;
  to: string;
  lines: Line[];
}

interface Forecast {
  basis: "history" | "default";
  historySize: number;
  outstanding: number;
  expected: number;
  atRisk: number;
  buckets: { key: string; label: string; invoices: number; outstanding: number; rate: number; expected: number }[];
}

const TOPICS: { id: Line["topic"]; label: string }[] = [
  { id: "attendance", label: "Présence" },
  { id: "finance", label: "Scolarité" },
  { id: "grades", label: "Notes" },
  { id: "admissions", label: "Admissions" },
];
const MANAGEMENT = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];
const fcfa = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
const day = (value: string) => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

function ToneIcon({ tone }: { tone: Line["tone"] }) {
  if (tone === "warning") return <TriangleAlert size={16} aria-label="À surveiller" />;
  if (tone === "good") return <CircleCheck size={16} aria-label="Bon point" />;
  return <Info size={16} aria-label="Information" />;
}

function InsightsContent() {
  const feedback = useFeedback();
  const isManagement = MANAGEMENT.includes(getStoredUser()?.role ?? "");
  const [previous, setPrevious] = useState(false);
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const loadWeekly = useCallback(() => {
    if (!isManagement) return;
    setWeekly(null);
    api
      .get<Weekly>(`/insights/weekly${previous ? "?week=previous" : ""}`)
      .then(setWeekly)
      .catch((err) => setError(errorMessage(err)));
  }, [previous, isManagement]);
  useEffect(loadWeekly, [loadWeekly]);

  useEffect(() => {
    api
      .get<Forecast>("/insights/forecast")
      .then(setForecast)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const send = async () => {
    setSending(true);
    try {
      const result = await api.post<{ delivered: boolean; to: string }>("/insights/weekly/send");
      if (result.delivered) feedback.success("Synthèse envoyée", `À ${result.to}`);
      else feedback.error("E-mail non envoyé", "Le serveur d'e-mail n'est pas configuré.");
    } catch (err) {
      feedback.error("Envoi impossible", errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Synthèse et prévisions"
        description="L'essentiel de la semaine en quelques phrases et ce que l'établissement peut espérer encaisser. Tout est calculé à partir de vos données, sans estimation extérieure."
        actions={
          isManagement && (
            <button type="button" className="btn btn-outline" onClick={send} disabled={sending}>
              {sending ? <LoaderCircle size={16} className="spin" /> : <Mail size={16} />} Me l&apos;envoyer par e-mail
            </button>
          )
        }
      />

      {error && !weekly && !forecast && (
        <div className="card">
          <EmptyState tone="error" title="Synthèse indisponible">
            {error}
          </EmptyState>
        </div>
      )}

      {isManagement && (
        <section className="card" style={{ marginBottom: 20 }} aria-labelledby="weekly-title">
          <div className="insight-head">
            <div>
              <h2 id="weekly-title" className="card-title">
                {previous ? "Semaine dernière" : "Cette semaine"}
              </h2>
              {weekly && (
                <p className="muted">
                  Du {day(weekly.from)} au {day(weekly.to)} · la synthèse de la semaine écoulée est envoyée à la direction chaque lundi matin.
                </p>
              )}
            </div>
            <div className="segmented" role="group" aria-label="Semaine affichée">
              <button type="button" aria-pressed={!previous} onClick={() => setPrevious(false)}>
                Cette semaine
              </button>
              <button type="button" aria-pressed={previous} onClick={() => setPrevious(true)}>
                Semaine dernière
              </button>
            </div>
          </div>
          {!weekly ? (
            <div className="skeleton" style={{ height: 140 }} />
          ) : (
            <div className="insight-topics">
              {TOPICS.map((t) => {
                const lines = weekly.lines.filter((l) => l.topic === t.id);
                if (!lines.length) return null;
                return (
                  <div key={t.id}>
                    <h3>{t.label}</h3>
                    <ul className="insight-lines">
                      {lines.map((l, i) => (
                        <li key={i} className={`insight-line is-${l.tone}`}>
                          <ToneIcon tone={l.tone} />
                          <span>{l.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {forecast && (
        <section className="card" aria-labelledby="forecast-title">
          <h2 id="forecast-title" className="card-title">
            Prévision d&apos;encaissement
          </h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            {forecast.basis === "history"
              ? `Taux mesurés sur vos ${forecast.historySize} factures échues depuis plus de 4 mois : pour chaque ancienneté, la part de ce qui restait dû et qui a fini par être payée.`
              : `Historique encore trop court (${forecast.historySize} factures anciennes) : des taux prudents par défaut sont appliqués en attendant.`}
          </p>
          <div className="gen-stats" style={{ marginTop: 0 }}>
            <div className="gen-stat">
              <strong>{fcfa(forecast.outstanding)}</strong>
              <span>reste à encaisser</span>
            </div>
            <div className="gen-stat is-good">
              <strong>{fcfa(forecast.expected)}</strong>
              <span>encaissement probable</span>
            </div>
            <div className={`gen-stat ${forecast.atRisk > 0 ? "is-bad" : ""}`}>
              <strong>{fcfa(forecast.atRisk)}</strong>
              <span>risque de non-paiement</span>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ancienneté</th>
                  <th className="num">Factures</th>
                  <th className="num">Reste dû</th>
                  <th className="num">Taux de paiement</th>
                  <th className="num">Encaissement probable</th>
                </tr>
              </thead>
              <tbody>
                {forecast.buckets.map((b) => (
                  <tr key={b.key}>
                    <td>{b.label}</td>
                    <td className="num">{b.invoices}</td>
                    <td className="num">{fcfa(b.outstanding)}</td>
                    <td className="num">{Math.round(b.rate * 100)} %</td>
                    <td className="num">
                      <strong>{fcfa(b.expected)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export default function InsightsPage() {
  return (
    <Shell title="Synthèse et prévisions">
      <InsightsContent />
    </Shell>
  );
}
