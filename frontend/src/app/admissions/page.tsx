"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, FileSignature, LoaderCircle, Plus, XCircle } from "lucide-react";
import Shell from "../../components/Shell";
import { EmptyState, FormError, Modal, PageHeader, Pagination, SearchInput, SortHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useTable } from "../../lib/useTable";

interface AdmissionRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  status: string;
  submittedAt: string;
  student: { id: string } | null;
}

const WORKFLOW = ["CANDIDATURE", "DOSSIER_INCOMPLET", "DOSSIER_COMPLET", "ETUDE", "TEST", "ENTRETIEN", "ADMIS", "INSCRIPTION", "CONFIRME"];

const STATUS_LABELS: Record<string, string> = {
  CANDIDATURE: "Candidature",
  DOSSIER_INCOMPLET: "Dossier incomplet",
  DOSSIER_COMPLET: "Dossier complet",
  ETUDE: "À l'étude",
  TEST: "Test",
  ENTRETIEN: "Entretien",
  ADMIS: "Admis",
  REJETE: "Rejeté",
  INSCRIPTION: "Inscription",
  CONFIRME: "Confirmé",
};

type Stage = "all" | "open" | "admitted" | "closed";
const STAGES: { id: Stage; label: string; match: (s: string) => boolean }[] = [
  { id: "open", label: "En cours", match: (s) => WORKFLOW.indexOf(s) >= 0 && WORKFLOW.indexOf(s) < WORKFLOW.indexOf("ADMIS") },
  { id: "admitted", label: "Admis / inscription", match: (s) => ["ADMIS", "INSCRIPTION"].includes(s) },
  { id: "closed", label: "Confirmés & rejetés", match: (s) => ["CONFIRME", "REJETE"].includes(s) },
  { id: "all", label: "Toutes", match: () => true },
];

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "", gender: "M" };

const nextStatus = (current: string) => {
  const idx = WORKFLOW.indexOf(current);
  return idx >= 0 && idx < WORKFLOW.length - 1 ? WORKFLOW[idx + 1] : null;
};

export default function AdmissionsPage() {
  const feedback = useFeedback();
  const [admissions, setAdmissions] = useState<AdmissionRow[] | null>(null);
  const [stage, setStage] = useState<Stage>("open");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

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

  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.id, admissions?.filter((a) => s.match(a.status)).length ?? 0])), [admissions]);
  const current = STAGES.find((s) => s.id === stage)!;
  const table = useTable<AdmissionRow, "name" | "date" | "status">({
    rows: (admissions ?? []).filter((a) => current.match(a.status)),
    accessors: { name: (a) => `${a.lastName} ${a.firstName}`, date: (a) => a.submittedAt, status: (a) => WORKFLOW.indexOf(a.status) },
    searchText: (a) => `${a.firstName} ${a.lastName} ${a.email} ${a.phone ?? ""}`,
    initialSort: { key: "date", dir: "desc" },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/admissions", form);
      setShowForm(false);
      feedback.success("Candidature enregistrée", `${form.firstName} ${form.lastName}`);
      setForm(EMPTY_FORM);
      setStage("open");
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const advance = async (admission: AdmissionRow, status: string) => {
    if (status === "REJETE") {
      const ok = await feedback.confirm({
        title: `Rejeter la candidature de ${admission.firstName} ${admission.lastName} ?`,
        message: "La candidature sortira du processus d'admission.",
        confirmLabel: "Rejeter",
      });
      if (!ok) return;
    }
    setBusyId(admission.id);
    try {
      await api.patch(`/admissions/${admission.id}/status`, { status });
      feedback.success(status === "REJETE" ? "Candidature rejetée" : `Étape suivante : ${STATUS_LABELS[status]}`, `${admission.firstName} ${admission.lastName}`);
      load();
    } catch (err) {
      feedback.error("Mise à jour impossible", errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Shell title="Admissions">
      <PageHeader
        title="Admissions"
        description="Suivez chaque candidature, de la demande jusqu'à l'inscription confirmée."
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Nouvelle candidature
          </button>
        }
      />

      <div className="tabs" role="tablist" aria-label="Étapes">
        {STAGES.map((s) => (
          <button key={s.id} type="button" role="tab" className="tab" aria-selected={stage === s.id} onClick={() => setStage(s.id)}>
            {s.label} <span className="tab-count">{counts[s.id]}</span>
          </button>
        ))}
      </div>

      <div className="table-toolbar">
        <SearchInput value={table.query} onChange={table.setQuery} placeholder="Nom, email, téléphone…" label="Rechercher une candidature" />
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Impossible de charger les candidatures" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        ) : !admissions ? (
          <TableSkeleton columns={5} />
        ) : table.total === 0 ? (
          <EmptyState icon={<FileSignature size={22} />} title={table.query ? "Aucun résultat" : "Aucune candidature à cette étape"} />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Candidat" column="name" sort={table.sort} onSort={table.toggleSort} />
                  <th>Contact</th>
                  <SortHeader label="Soumis le" column="date" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Étape" column="status" sort={table.sort} onSort={table.toggleSort} />
                  <th className="actions">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((a) => {
                  const next = nextStatus(a.status);
                  const step = WORKFLOW.indexOf(a.status);
                  return (
                    <tr key={a.id}>
                      <td className="cell-main">
                        {a.lastName} {a.firstName}
                      </td>
                      <td>
                        {a.email}
                        {a.phone && <div className="cell-sub">{a.phone}</div>}
                      </td>
                      <td className="nowrap">{new Date(a.submittedAt).toLocaleDateString("fr-FR")}</td>
                      <td>
                        <span className={`badge ${a.status === "REJETE" ? "badge-danger" : a.status === "CONFIRME" ? "badge-green" : "badge-orange"}`}>{STATUS_LABELS[a.status] || a.status}</span>
                        {step >= 0 && a.status !== "CONFIRME" && (
                          <div className="meter" style={{ height: 4, marginTop: 6, maxWidth: 120 }} aria-hidden="true">
                            <span style={{ width: `${((step + 1) / WORKFLOW.length) * 100}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="actions">
                        <div className="btn-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {next && (
                            <button className="btn btn-secondary btn-sm" disabled={busyId === a.id} onClick={() => advance(a, next)}>
                              {busyId === a.id ? <LoaderCircle size={14} className="spin" /> : <ArrowRight size={14} />} {STATUS_LABELS[next]}
                            </button>
                          )}
                          {a.status !== "REJETE" && a.status !== "CONFIRME" && (
                            <button className="btn btn-danger-ghost btn-sm" disabled={busyId === a.id} onClick={() => advance(a, "REJETE")}>
                              <XCircle size={14} /> Rejeter
                            </button>
                          )}
                        </div>
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
        open={showForm}
        onClose={() => setShowForm(false)}
        busy={saving}
        title="Nouvelle candidature"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="admission-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Enregistrer
            </button>
          </>
        }
      >
        <form id="admission-form" onSubmit={handleCreate}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ad-first" className="required">
                Prénom
              </label>
              <input id="ad-first" className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ad-last" className="required">
                Nom
              </label>
              <input id="ad-last" className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ad-email" className="required">
                Email
              </label>
              <input id="ad-email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ad-phone">Téléphone</label>
              <input id="ad-phone" type="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field full">
              <label htmlFor="ad-gender">Sexe</label>
              <select id="ad-gender" className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
