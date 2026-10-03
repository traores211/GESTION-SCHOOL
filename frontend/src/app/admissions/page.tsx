"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSignature, Globe, LoaderCircle, Plus, Store } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, Pagination, SearchInput, SortHeader, TableSkeleton, useFeedback } from "../../components/ui";
import AdmissionForm, { AdmissionFormValues, EMPTY_ADMISSION, admissionPayload } from "../../components/admissions/AdmissionForm";
import { api, errorMessage } from "../../lib/api";
import { useTable } from "../../lib/useTable";
import { AdmissionRow, AdmissionStatus, STATUS_LABELS, fullName, relativeTime, statusTone } from "../../lib/admissions";
import "./admissions.css";

/** Pipeline columns: each groups one or more workflow steps. */
const STAGES: { id: string; label: string; statuses: AdmissionStatus[]; color: string }[] = [
  { id: "new", label: "Nouvelles", statuses: ["CANDIDATURE"], color: "var(--info)" },
  { id: "incomplete", label: "Incomplètes", statuses: ["DOSSIER_INCOMPLET"], color: "var(--warning-mark)" },
  { id: "complete", label: "Dossiers complets", statuses: ["DOSSIER_COMPLET"], color: "var(--info)" },
  { id: "review", label: "Étude, test, entretien", statuses: ["ETUDE", "TEST", "ENTRETIEN"], color: "var(--clay)" },
  { id: "admitted", label: "Admis", statuses: ["ADMIS"], color: "var(--success)" },
  { id: "enrolment", label: "En inscription", statuses: ["INSCRIPTION"], color: "var(--success)" },
  { id: "confirmed", label: "Confirmés", statuses: ["CONFIRME"], color: "var(--success)" },
  { id: "rejected", label: "Non retenus", statuses: ["REJETE"], color: "var(--danger)" },
];
const ORDER: AdmissionStatus[] = ["CANDIDATURE", "DOSSIER_INCOMPLET", "DOSSIER_COMPLET", "ETUDE", "TEST", "ENTRETIEN", "ADMIS", "INSCRIPTION", "CONFIRME", "REJETE"];

export default function AdmissionsPage() {
  const router = useRouter();
  const feedback = useFeedback();
  const [admissions, setAdmissions] = useState<AdmissionRow[] | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AdmissionFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<AdmissionRow[]>("/admissions")
      .then((list) => {
        setAdmissions(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.id, admissions?.filter((a) => s.statuses.includes(a.status)).length ?? 0])), [admissions]);
  const inProgress = admissions?.filter((a) => !["CONFIRME", "REJETE"].includes(a.status)).length ?? 0;
  const current = STAGES.find((s) => s.id === stage);
  const table = useTable<AdmissionRow, "name" | "date" | "status" | "activity">({
    rows: (admissions ?? []).filter((a) => !current || current.statuses.includes(a.status)),
    accessors: {
      name: (a) => `${a.lastName} ${a.firstName}`,
      date: (a) => a.submittedAt,
      status: (a) => ORDER.indexOf(a.status),
      activity: (a) => a.lastEvent?.createdAt ?? a.updatedAt,
    },
    searchText: (a) => `${a.reference ?? ""} ${a.firstName} ${a.lastName} ${a.email} ${a.phone ?? ""} ${a.guardianName ?? ""} ${a.guardianPhone ?? ""} ${a.requestedLevel ?? ""}`,
    initialSort: { key: "activity", dir: "desc" },
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.post<{ id: string; reference: string }>("/admissions", admissionPayload(form));
      feedback.success("Candidature enregistrée", `Dossier ${created.reference}`);
      setForm(null);
      router.push(`/admissions/${created.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Admissions">
      <PageHeader
        title="Admissions"
        description={admissions ? `${inProgress} dossier(s) en cours · ${admissions.length} au total cette année. Ouvrez un dossier pour le faire avancer et voir son historique.` : "Chargement…"}
        actions={
          <button className="btn btn-primary" onClick={() => setForm(EMPTY_ADMISSION)}>
            <Plus size={16} /> Nouvelle candidature
          </button>
        }
      />

      <div className="adm-pipeline" role="group" aria-label="Filtrer par étape">
        {STAGES.map((s) => (
          <button key={s.id} type="button" className="adm-stage" style={{ ["--stage" as string]: s.color }} aria-pressed={stage === s.id} onClick={() => setStage(stage === s.id ? null : s.id)}>
            <strong>{admissions ? counts[s.id] : "…"}</strong>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="table-toolbar">
        <SearchInput value={table.query} onChange={table.setQuery} placeholder="Référence, nom, téléphone, responsable…" label="Rechercher une candidature" />
        {current && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage(null)}>
            Toutes les étapes
          </button>
        )}
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Impossible de charger les candidatures" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        ) : !admissions ? (
          <TableSkeleton columns={6} />
        ) : table.total === 0 ? (
          <EmptyState icon={<FileSignature size={22} />} title={table.query ? "Aucun résultat" : "Aucune candidature à cette étape"} />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Candidat" column="name" sort={table.sort} onSort={table.toggleSort} />
                  <th>Responsable</th>
                  <th>Pièces</th>
                  <SortHeader label="Étape" column="status" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Dernière action" column="activity" sort={table.sort} onSort={table.toggleSort} />
                  <th className="actions">
                    <span className="visually-hidden">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((a) => {
                  const tone = statusTone(a.status);
                  const pct = a.piecesRequired ? (a.piecesReceived / a.piecesRequired) * 100 : 100;
                  return (
                    <tr key={a.id} className="adm-row" onClick={() => router.push(`/admissions/${a.id}`)}>
                      <td>
                        <Link href={`/admissions/${a.id}`} className="cell-main" onClick={(e) => e.stopPropagation()}>
                          {fullName(a)}
                        </Link>
                        <div className="cell-sub">
                          <span className="adm-ref">{a.reference}</span> · {a.requestedLevel ?? "niveau ?"} ·{" "}
                          {a.source === "EN_LIGNE" ? (
                            <span title="Déposée en ligne">
                              <Globe size={11} style={{ verticalAlign: "-1px" }} /> en ligne
                            </span>
                          ) : (
                            <span title="Saisie au guichet">
                              <Store size={11} style={{ verticalAlign: "-1px" }} /> guichet
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {a.guardianName ?? <span className="muted">—</span>}
                        {(a.guardianPhone || a.phone) && <div className="cell-sub">{a.guardianPhone ?? a.phone}</div>}
                      </td>
                      <td>
                        <span className="adm-mini" title={`${a.piecesReceived} pièce(s) obligatoire(s) reçue(s) sur ${a.piecesRequired}`}>
                          <span className={`meter${pct < 100 ? " is-warning" : ""}`}>
                            <span style={{ width: `${pct}%` }} />
                          </span>
                          {a.piecesReceived}/{a.piecesRequired}
                        </span>
                      </td>
                      <td>
                        <span className={a.status === "CONFIRME" ? "stamp stamp-olive" : a.status === "REJETE" ? "badge badge-danger" : `badge badge-${tone === "olive" ? "green" : tone}`}>{STATUS_LABELS[a.status]}</span>
                        {a.student && <div className="cell-sub">Élève {a.student.matricule}</div>}
                      </td>
                      <td>
                        {a.lastEvent ? (
                          <>
                            <div style={{ fontSize: 13 }}>{a.lastEvent.title}</div>
                            <div className="cell-sub">
                              {a.lastEvent.userName ?? "—"} · {relativeTime(a.lastEvent.createdAt)}
                            </div>
                          </>
                        ) : (
                          <span className="muted">{relativeTime(a.submittedAt)}</span>
                        )}
                      </td>
                      <td className="actions">
                        <ChevronRight size={16} aria-hidden="true" className="muted" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onPage={table.setPage} unit="candidature" />
          </>
        )}
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        busy={saving}
        size="lg"
        title="Nouvelle candidature"
        description="Le dossier est créé avec sa référence et la liste des pièces à fournir."
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="admission-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Créer le dossier
            </button>
          </>
        }
      >
        {form && (
          <>
            <FormError message={formError} />
            <AdmissionForm id="admission-form" values={form} onChange={setForm} onSubmit={create} />
          </>
        )}
      </Modal>
    </Shell>
  );
}
