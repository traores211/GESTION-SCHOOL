"use client";

import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { useSession } from "../../lib/session";
import Modal from "../../components/ui/Modal";
import { api, ApiError } from "../../lib/api";

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
}

interface ParentRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  relationship: string;
  students: StudentOption[];
}

export default function ParentsPage() {
  const { can } = useSession();
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    relationship: "Père",
    studentIds: [] as string[],
  });

  const load = () => {
    api.get<ParentRow[]>("/parents").then(setParents).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(() => {
    load();
    api.get<StudentOption[]>("/students").then(setStudents).catch(() => {});
  }, []);

  const toggleStudent = (id: string) => {
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id) ? f.studentIds.filter((s) => s !== id) : [...f.studentIds, id],
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/parents", form);
      setShowForm(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", relationship: "Père", studentIds: [] });
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Parents">
      <div className="page-header">
        <div>
          <h1>Parents & Tuteurs</h1>
          <p>{parents.length} contact(s) parental(aux)</p>
        </div>
        {can("parents:write") && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nouveau parent
        </button>
        )}
      </div>

      {error && <p className="text-danger">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Lien</th>
              <th>Téléphone</th>
              <th>Email</th>
              <th>Enfants</th>
            </tr>
          </thead>
          <tbody>
            {parents.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.lastName} {p.firstName}
                </td>
                <td>{p.relationship}</td>
                <td>{p.phone}</td>
                <td>{p.email}</td>
                <td>{p.students.map((s) => `${s.firstName} ${s.lastName}`).join(", ") || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {parents.length === 0 && <div className="empty-state">Aucun parent enregistré.</div>}
      </div>

      {showForm && (
        <Modal title={<>Nouveau parent</>} onClose={() => setShowForm(false)}>
            
            <form onSubmit={handleCreate}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="parents-f1">Prénom</label>
                  <input id="parents-f1" className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="parents-f2">Nom</label>
                  <input id="parents-f2" className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="parents-f3">Email</label>
                  <input id="parents-f3" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="parents-f4">Téléphone</label>
                  <input id="parents-f4" className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="parents-f5">Lien de parenté</label>
                  <select id="parents-f5" className="input" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                    <option>Père</option>
                    <option>Mère</option>
                    <option>Tuteur</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <span className="field-label" id="parents-children-label">Enfants rattachés</span>
                <div role="group" aria-labelledby="parents-children-label" style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                  {students.map((s) => (
                    <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontWeight: 400 }}>
                      <input type="checkbox" checked={form.studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                      {s.lastName} {s.firstName} ({s.matricule})
                    </label>
                  ))}
                </div>
              </div>
              {formError && <p className="text-danger" style={{ marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Enregistrement…" : "Créer le parent"}
                </button>
              </div>
            </form>
          </Modal>
      )}
    </Shell>
  );
}
