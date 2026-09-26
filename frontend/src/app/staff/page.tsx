"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import Modal from "../../components/ui/Modal";
import { api, ApiError } from "../../lib/api";

interface StaffRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  staffMember: { position: string; department?: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  DIRECTOR: "Directeur",
  SECRETARY: "Secrétaire",
  COMPTABLE: "Comptable",
  ENSEIGNANT: "Enseignant",
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; temporaryPassword?: string } | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "ENSEIGNANT",
    position: "",
    hireDate: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    api.get<StaffRow[]>("/staff").then(setStaff).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.post<{ email: string; temporaryPassword?: string }>("/staff", form);
      setCreated(res);
      setForm({ firstName: "", lastName: "", email: "", role: "ENSEIGNANT", position: "", hireDate: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Enseignants & Personnel">
      <div className="page-header">
        <div>
          <h1>Personnel</h1>
          <p>{staff.length} membre(s) du personnel</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setCreated(null); }}>
          + Nouveau membre
        </button>
      </div>

      {error && <p className="text-danger">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Poste</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{s.lastName} {s.firstName}</td>
                <td><span className="badge badge-green">{ROLE_LABELS[s.role] || s.role}</span></td>
                <td>{s.staffMember?.position || "-"}</td>
                <td>{s.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {staff.length === 0 && <div className="empty-state">Aucun membre du personnel.</div>}
      </div>

      {showForm && (
        <Modal title={<>Nouveau membre du personnel</>} onClose={() => setShowForm(false)}>
            

            {created ? (
              <div>
                <p style={{ marginBottom: 8 }}>Compte créé pour <strong>{created.email}</strong>.</p>
                {created.temporaryPassword && (
                  <p className="card" style={{ fontSize: 13 }}>
                    Mot de passe temporaire : <strong>{created.temporaryPassword}</strong>
                  </p>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <button className="btn btn-primary" onClick={() => setShowForm(false)}>Fermer</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="staff-f1">Prénom</label>
                    <input id="staff-f1" className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="staff-f2">Nom</label>
                    <input id="staff-f2" className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="staff-f3">Email</label>
                    <input id="staff-f3" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="staff-f4">Rôle</label>
                    <select id="staff-f4" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="ENSEIGNANT">Enseignant</option>
                      <option value="SECRETARY">Secrétaire</option>
                      <option value="COMPTABLE">Comptable</option>
                      <option value="DIRECTOR">Directeur</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="staff-f5">Poste</label>
                    <input id="staff-f5" className="input" required placeholder="Ex: Professeur de Maths" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="staff-f6">Date d&apos;embauche</label>
                    <input id="staff-f6" type="date" className="input" required value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
                  </div>
                </div>
                {formError && <p className="text-danger" style={{ marginBottom: 12 }}>{formError}</p>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Création…" : "Créer le compte"}</button>
                </div>
              </form>
            )}
          </Modal>
      )}
    </Shell>
  );
}
