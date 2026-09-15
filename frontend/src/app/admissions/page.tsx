"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";

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

const WORKFLOW = [
  "CANDIDATURE",
  "DOSSIER_INCOMPLET",
  "DOSSIER_COMPLET",
  "ETUDE",
  "TEST",
  "ENTRETIEN",
  "ADMIS",
  "INSCRIPTION",
  "CONFIRME",
];

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

export default function AdmissionsPage() {
  const [admissions, setAdmissions] = useState<AdmissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", gender: "M" });

  const load = () => {
    api.get<AdmissionRow[]>("/admissions").then(setAdmissions).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/admissions", form);
      setShowForm(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", gender: "M" });
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  const advance = async (admission: AdmissionRow, status: string) => {
    setBusyId(admission.id);
    try {
      await api.patch(`/admissions/${admission.id}/status`, { status });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  };

  const nextStatus = (current: string) => {
    const idx = WORKFLOW.indexOf(current);
    return idx >= 0 && idx < WORKFLOW.length - 1 ? WORKFLOW[idx + 1] : null;
  };

  return (
    <Shell title="Admissions">
      <div className="page-header">
        <div>
          <h1>Admissions</h1>
          <p>{admissions.length} candidature(s) — workflow complet de l&apos;inscription</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nouvelle candidature
        </button>
      </div>

      {error && <p className="text-danger">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Contact</th>
              <th>Soumis le</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admissions.map((a) => {
              const next = nextStatus(a.status);
              return (
                <tr key={a.id}>
                  <td>{a.lastName} {a.firstName}</td>
                  <td>{a.email}{a.phone ? ` · ${a.phone}` : ""}</td>
                  <td>{new Date(a.submittedAt).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <span className={`badge ${a.status === "REJETE" ? "badge-danger" : a.status === "CONFIRME" ? "badge-green" : "badge-orange"}`}>
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {next && (
                      <button className="btn btn-secondary btn-sm" disabled={busyId === a.id} onClick={() => advance(a, next)}>
                        → {STATUS_LABELS[next]}
                      </button>
                    )}
                    {a.status !== "REJETE" && a.status !== "CONFIRME" && (
                      <button className="btn btn-outline btn-sm" disabled={busyId === a.id} onClick={() => advance(a, "REJETE")}>
                        Rejeter
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {admissions.length === 0 && <div className="empty-state">Aucune candidature.</div>}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>Nouvelle candidature</h2>
            <form onSubmit={handleCreate}>
              <div className="form-grid">
                <div className="field">
                  <label>Prénom</label>
                  <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Nom</label>
                  <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="field">
                  <label>Téléphone</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Sexe</label>
                  <select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
              </div>
              {formError && <p className="text-danger" style={{ marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Créer la candidature"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
