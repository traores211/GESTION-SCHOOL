"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Download, FileSpreadsheet, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, PageHeader, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { downloadFile } from "../../lib/download";

interface ImportType {
  kind: string;
  label: string;
  columns: { header: string; required: boolean; example: string }[];
}

interface Report {
  kind: string;
  committed: boolean;
  total: number;
  ok: number;
  errors: number;
  skipped: number;
  imported: number;
  recognised: string[];
  ignoredColumns: string[];
  rows: { line: number; label: string; status: "ok" | "error" | "skipped"; messages: string[] }[];
}

const HINTS: Record<string, string> = {
  students: "Crée les élèves, les inscrit dans leur classe et rattache leurs responsables. Deux enfants ayant le même numéro de parent partagent la même fiche responsable.",
  staff: "Crée les comptes du personnel. Aucun mot de passe n'est envoyé : chacun choisit le sien avec « Mot de passe oublié » sur la page de connexion.",
  balances: "Crée une facture par ligne pour reprendre les restes à payer de votre ancien système.",
  grades: "Ajoute des notes aux élèves inscrits, d'après leur matricule, la matière et la période.",
};
const STATUS = {
  ok: { label: "Prêt", badge: "badge-green" },
  error: { label: "À corriger", badge: "badge-danger" },
  skipped: { label: "Ignoré", badge: "badge-neutral" },
} as const;

function ImportsContent() {
  const feedback = useFeedback();
  const [types, setTypes] = useState<ImportType[] | null>(null);
  const [kind, setKind] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<"analyse" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<ImportType[]>("/imports")
      .then((list) => {
        setTypes(list);
        setKind(list[0]?.kind ?? "");
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const current = types?.find((t) => t.kind === kind);

  const reset = () => {
    setFile(null);
    setReport(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  const send = async (chosen: File, commit: boolean) => {
    setBusy(commit ? "commit" : "analyse");
    setError(null);
    try {
      const result = await api.upload<Report>(`/imports/${kind}${commit ? "?commit=true" : ""}`, chosen);
      setReport(result);
      if (commit) feedback.success(`${result.imported} ligne(s) importée(s)`, result.errors ? `${result.errors} ligne(s) restent à corriger.` : undefined);
    } catch (err) {
      setReport(null);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const choose = (chosen: File | undefined) => {
    if (!chosen) return;
    setFile(chosen);
    void send(chosen, false);
  };

  if (types && types.length === 0) {
    return (
      <>
        <PageHeader title="Imports" description="Reprise de données depuis Excel ou CSV." />
        <div className="card">
          <EmptyState title="Aucun import disponible pour votre rôle" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Imports" description="Reprenez vos listes Excel ou CSV : le fichier est d'abord analysé, rien n'est enregistré avant votre confirmation." />

      <div className="tabs" role="tablist" aria-label="Type d'import">
        {(types ?? []).map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            className="tab"
            aria-selected={kind === t.kind}
            onClick={() => {
              setKind(t.kind);
              reset();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {current && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ marginBottom: 12 }}>{HINTS[current.kind]}</p>
          <div className="import-columns" aria-label="Colonnes attendues">
            {current.columns.map((c) => (
              <span key={c.header} className={`badge ${c.required ? "badge-info" : "badge-neutral"}`} title={c.example ? `Exemple : ${c.example}` : undefined}>
                {c.header}
                {c.required && " *"}
              </span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: "8px 0 16px" }}>
            * colonnes obligatoires. L&apos;ordre des colonnes est libre et les en-têtes habituels (« Né le », « Tel parent »…) sont reconnus. 2 000 lignes au maximum par fichier.
          </p>
          <div className="import-actions">
            <button type="button" className="btn btn-outline" onClick={() => downloadFile(`/imports/${current.kind}/template`, `modele-${current.kind}.csv`).catch((err) => feedback.error("Téléchargement impossible", errorMessage(err)))}>
              <Download size={16} /> Télécharger le modèle
            </button>
            <label className={`btn btn-primary${busy ? " is-disabled" : ""}`}>
              {busy === "analyse" ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />} {file ? "Choisir un autre fichier" : "Choisir un fichier Excel ou CSV"}
              <input ref={input} type="file" className="visually-hidden" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy !== null} onChange={(e) => choose(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 16 }}>
          <TriangleAlert size={16} />
          <div className="alert-body">{error}</div>
        </div>
      )}

      {report && file && (
        <>
          <div className="gen-stats" style={{ marginTop: 0 }}>
            <div className="gen-stat">
              <strong>{report.total}</strong>
              <span>ligne(s) lue(s) dans {file.name}</span>
            </div>
            <div className="gen-stat is-good">
              <strong>{report.committed ? report.imported : report.ok}</strong>
              <span>{report.committed ? "importée(s)" : "prête(s) à importer"}</span>
            </div>
            <div className={`gen-stat ${report.errors ? "is-bad" : ""}`}>
              <strong>{report.errors}</strong>
              <span>à corriger</span>
            </div>
            <div className="gen-stat">
              <strong>{report.skipped}</strong>
              <span>déjà présente(s)</span>
            </div>
          </div>

          {report.ignoredColumns.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Colonnes non utilisées : {report.ignoredColumns.join(", ")}.
            </p>
          )}

          {report.committed ? (
            <div className="alert alert-success" role="status" style={{ margin: "12px 0" }}>
              <CircleCheck size={16} />
              <div className="alert-body">
                <strong>Import terminé.</strong> {report.imported} ligne(s) enregistrée(s).{report.errors > 0 && " Corrigez les lignes en erreur dans votre fichier et renvoyez-le : les lignes déjà importées seront ignorées."}
              </div>
            </div>
          ) : (
            <div className="import-actions" style={{ margin: "12px 0" }}>
              <button type="button" className="btn btn-primary" disabled={busy !== null || report.ok === 0} onClick={() => send(file, true)}>
                {busy === "commit" ? <LoaderCircle size={16} className="spin" /> : <CircleCheck size={16} />} Importer {report.ok} ligne(s)
              </button>
              <button type="button" className="btn btn-outline" onClick={reset} disabled={busy !== null}>
                Annuler
              </button>
              {report.errors > 0 && report.ok > 0 && <span className="muted">Les {report.errors} ligne(s) en erreur ne seront pas importées.</span>}
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Élément</th>
                  <th>État</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.line}>
                    <td className="tabular">{r.line}</td>
                    <td className="cell-main">{r.label}</td>
                    <td>
                      <span className={`badge ${STATUS[r.status].badge}`}>{report.committed && r.status === "ok" ? "Importé" : STATUS[r.status].label}</span>
                    </td>
                    <td className="msg-body">{r.messages.join(" · ") || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.total > report.rows.length && <p className="muted" style={{ padding: 12, fontSize: 13 }}>Les {report.rows.length} premières lignes sont affichées (problèmes en premier).</p>}
          </div>
        </>
      )}

      {!report && !error && current && (
        <div className="card">
          <EmptyState icon={<FileSpreadsheet size={22} />} title="Aucun fichier analysé">
            Téléchargez le modèle, remplissez-le dans Excel, puis choisissez le fichier : vous verrez ligne par ligne ce qui sera importé.
          </EmptyState>
        </div>
      )}
    </>
  );
}

export default function ImportsPage() {
  return (
    <Shell title="Imports">
      <ImportsContent />
    </Shell>
  );
}
