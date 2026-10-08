"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, Search } from "lucide-react";
import { api, errorMessage } from "../../../../lib/api";
import { FormError } from "../../../../components/ui";
import { FlagBand, ThemeToggle } from "../../../../components/Brand";
import "../showcase.css";

interface Tracking {
  reference: string;
  candidate: string;
  requestedLevel: string | null;
  submittedAt: string;
  status: string;
  statusLabel: string;
  closed: boolean;
  pieces: { label: string; required: boolean; status: string }[];
  missingPieces: string[];
  testAt: string | null;
  interviewAt: string | null;
  school: { name: string; phone: string | null; email: string };
}

const PIECE: Record<string, { label: string; badge: string }> = {
  MANQUANT: { label: "À fournir", badge: "badge-warning" },
  RECU: { label: "Reçue", badge: "badge-info" },
  VALIDE: { label: "Validée", badge: "badge-green" },
  REFUSE: { label: "À refaire", badge: "badge-danger" },
};
const when = (value: string) => new Date(value).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });

/** What the family is told at each step, in plain words. */
function explain(t: Tracking): string {
  if (t.status === "CONFIRME") return "L'inscription est confirmée. Bienvenue !";
  if (t.status === "INSCRIPTION") return "Votre enfant est admis. L'inscription est en cours : l'établissement vous indiquera les dernières formalités.";
  if (t.status === "ADMIS") return "Bonne nouvelle : la candidature est acceptée. L'établissement vous contacte pour l'inscription.";
  if (t.status === "REJETE") return "La candidature n'a pas été retenue. Vous pouvez contacter l'établissement pour en connaître les raisons.";
  if (t.status === "TEST") return t.testAt ? `Un test d'admission est prévu le ${when(t.testAt)}.` : "Un test d'admission est prévu : la date vous sera communiquée.";
  if (t.status === "ENTRETIEN") return t.interviewAt ? `Un entretien est prévu le ${when(t.interviewAt)}.` : "Un entretien est prévu : la date vous sera communiquée.";
  if (t.missingPieces.length) return "Le dossier sera étudié dès que les pièces ci-dessous auront été remises au secrétariat.";
  return "Le dossier est complet et en cours d'étude. Vous serez recontacté.";
}

export default function TrackAdmissionPage() {
  const params = useParams<{ code: string }>();
  const [reference, setReference] = useState("");
  // The link given after an online application carries the dossier number.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setReference(ref);
  }, []);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await api.post<Tracking>(`/public/schools/${params?.code}/admissions/track`, { reference: reference.trim(), email: email.trim() }));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="sc sc-apply">
      <FlagBand />
      <div className="sc-apply-inner">
        <div className="sc-apply-top">
          <Link href={`/ecole/${params?.code}`} className="sc-apply-back">
            <ArrowLeft size={16} aria-hidden="true" /> Retour à la présentation
          </Link>
          <ThemeToggle />
        </div>

        <div className="sc-apply-sheet">
          <div className="sc-apply-stub" aria-hidden="true">
            <span>Suivi</span>
            <strong>{params?.code}</strong>
          </div>
          <div className="sc-apply-body">
            <h1>Suivre une candidature</h1>
            <p className="sc-apply-lead">Saisissez le numéro de dossier reçu lors de la candidature et l&apos;adresse e-mail indiquée ce jour-là.</p>

            <form onSubmit={submit}>
              <FormError message={error} />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="tr-ref" className="required">
                    Numéro de dossier
                  </label>
                  <input id="tr-ref" className="input" required minLength={4} maxLength={40} placeholder="ADM-2026-0042" autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="tr-email" className="required">
                    Adresse e-mail
                  </label>
                  <input id="tr-email" type="email" className="input" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? <LoaderCircle size={18} className="spin" /> : <Search size={18} aria-hidden="true" />} Voir où en est le dossier
              </button>
            </form>

            {result && (
              <section role="status" style={{ marginTop: 28 }}>
                <span className={`stamp ${result.status === "REJETE" ? "stamp-danger" : "stamp-olive"}`}>{result.statusLabel}</span>
                <h2 style={{ marginTop: 14 }}>
                  Dossier {result.reference} · {result.candidate}
                </h2>
                <p>
                  Déposé le {new Date(result.submittedAt).toLocaleDateString("fr-FR", { dateStyle: "long" })}
                  {result.requestedLevel ? ` pour la classe de ${result.requestedLevel}` : ""}.
                </p>
                <p>
                  <strong>{explain(result)}</strong>
                </p>
                {!result.closed && result.pieces.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 18 }}>Pièces du dossier</h3>
                    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                      {result.pieces.map((p) => (
                        <li key={p.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
                          <span>
                            {p.label}
                            {!p.required && <span className="muted"> (facultative)</span>}
                          </span>
                          <span className={`badge ${PIECE[p.status]?.badge ?? "badge-neutral"}`}>{PIECE[p.status]?.label ?? p.status}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="muted" style={{ marginTop: 18 }}>
                  Une question ? {result.school.name}
                  {result.school.phone ? ` · ${result.school.phone}` : ""} · {result.school.email}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
