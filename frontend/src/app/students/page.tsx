"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "../../components/Shell";
import { useSession } from "../../lib/session";
import Modal from "../../components/ui/Modal";
import { api, ApiError } from "../../lib/api";

interface ClassRef {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  gender: string;
  status: string;
  enrollments: { class: ClassRef }[];
}

interface ClassOption {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  INSCRIT: { label: "Inscrit", badge: "badge-green" },
  PRESENT: { label: "Présent", badge: "badge-green" },
  RETIRE: { label: "Retiré", badge: "badge-neutral" },
  DIPLOME: { label: "Diplômé", badge: "badge-info" },
  REDOUBLANT: { label: "Redoublant", badge: "badge-warning" },
};

export default function StudentsPage() {
  const { can } = useSession();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "M",
    classId: "",
  });

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;

  // Server-side pagination: a school can have thousands of students.
  const load = (q?: string, p = 1) => {
    setLoading(true);
    setPage(p);
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
    if (q) params.set("search", q);
    api
      .getPage<StudentRow>(`/students?${params}`)
      .then(({ items, total }) => {
        setStudents(items);
        setTotal(total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Erreur de chargement"))
      .finally(() => setLoading(false));
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    load();
    api.get<ClassOption[]>("/classes").then(setClasses).catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(search);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/students", form);
      setShowForm(false);
      // Show the student just registered (confirmation), whatever the size of the list.
      setSearch(form.lastName);
      load(form.lastName);
      setForm({ firstName: "", lastName: "", dateOfBirth: "", gender: "M", classId: "" });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Élèves">
      <div className="page-header">
        <div>
          <h1>Élèves</h1>
          <p>{total} élève(s) — dossier 360° de chaque élève</p>
        </div>
        {can("students:write") && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nouvel élève
        </button>
        )}
      </div>

      <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 16, maxWidth: 420 }}>
        <input
          className="input"
          placeholder="Rechercher par nom, prénom, matricule…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn btn-outline">
          Rechercher
        </button>
      </form>

      {error && <p className="text-danger">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Matricule</th>
              <th>Nom</th>
              <th>Classe</th>
              <th>Sexe</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              students.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/students/${s.id}`}>{s.matricule}</Link>
                  </td>
                  <td>
                    <Link href={`/students/${s.id}`}>
                      {s.lastName} {s.firstName}
                    </Link>
                  </td>
                  <td>{s.enrollments[0]?.class?.name || <span className="muted">Non affecté</span>}</td>
                  <td>{s.gender}</td>
                  <td>
                    <span className={`badge ${STATUS_LABELS[s.status]?.badge || "badge-neutral"}`}>
                      {STATUS_LABELS[s.status]?.label || s.status}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && students.length === 0 && <div className="empty-state">Aucun élève trouvé.</div>}
        {loading && <div className="empty-state">Chargement…</div>}
      </div>
      <nav className="row" aria-label="Pagination" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <span className="muted">
          Page {page} / {pages} — {total} élève(s)
        </span>
        <div className="row">
          <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1 || loading} onClick={() => load(search, page - 1)}>
            Précédent
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={page >= pages || loading} onClick={() => load(search, page + 1)}>
            Suivant
          </button>
        </div>
      </nav>
      <div>
      </div>

      {showForm && (
        <Modal title={<>Nouvel élève</>} onClose={() => setShowForm(false)}>
            
            <form onSubmit={handleCreate}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="students-f1">Prénom</label>
                  <input id="students-f1"
                    className="input"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="students-f2">Nom</label>
                  <input id="students-f2"
                    className="input"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="students-f3">Date de naissance</label>
                  <input id="students-f3"
                    type="date"
                    className="input"
                    required
                    value={form.dateOfBirth}
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="students-f4">Sexe</label>
                  <select id="students-f4"
                    className="input"
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                  >
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="students-f5">Classe (optionnel)</label>
                  <select id="students-f5"
                    className="input"
                    value={form.classId}
                    onChange={(e) => setForm({ ...form, classId: e.target.value })}
                  >
                    <option value="">— Aucune —</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {formError && <p className="text-danger" style={{ marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Enregistrement…" : "Créer l'élève"}
                </button>
              </div>
            </form>
          </Modal>
      )}
    </Shell>
  );
}
