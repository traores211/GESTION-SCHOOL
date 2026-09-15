"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "../../components/Shell";
import { api, ApiError } from "../../lib/api";

interface ClassRow {
  id: string;
  name: string;
  code: string;
  level: string;
  capacity: number;
  teacher: { user: { firstName: string; lastName: string } } | null;
  _count: { enrollments: number };
}

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
  staffMember: { id: string } | null;
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", code: "", level: "", capacity: 50, teacherId: "" });

  const load = () => {
    api.get<ClassRow[]>("/classes").then(setClasses).catch((err) => setError(err instanceof ApiError ? err.message : "Erreur"));
  };

  useEffect(() => {
    load();
    api.get<TeacherOption[]>("/staff?role=ENSEIGNANT").then(setTeachers).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/classes", { ...form, teacherId: form.teacherId || undefined });
      setShowForm(false);
      setForm({ name: "", code: "", level: "", capacity: 50, teacherId: "" });
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Classes">
      <div className="page-header">
        <div>
          <h1>Classes</h1>
          <p>{classes.length} classe(s) — année scolaire en cours</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          + Nouvelle classe
        </button>
      </div>

      {error && <p className="text-danger">{error}</p>}

      <div className="kpi-grid">
        {classes.map((c) => (
          <Link key={c.id} href={`/classes/${c.id}`} className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{c.level} — {c.code}</div>
              </div>
              <span className="badge badge-orange">{c._count.enrollments}/{c.capacity}</span>
            </div>
            <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
              👨‍🏫 {c.teacher ? `${c.teacher.user.firstName} ${c.teacher.user.lastName}` : "Aucun professeur principal"}
            </p>
          </Link>
        ))}
        {classes.length === 0 && <div className="empty-state">Aucune classe créée.</div>}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>Nouvelle classe</h2>
            <form onSubmit={handleCreate}>
              <div className="form-grid">
                <div className="field">
                  <label>Nom</label>
                  <input className="input" required placeholder="Ex: 6ème A" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Code</label>
                  <input className="input" required placeholder="Ex: 6A" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div className="field">
                  <label>Niveau</label>
                  <input className="input" required placeholder="Ex: 6ème" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
                </div>
                <div className="field">
                  <label>Capacité</label>
                  <input type="number" className="input" required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Professeur principal</label>
                  <select className="input" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                    <option value="">— Aucun —</option>
                    {teachers.map((t) => t.staffMember && (
                      <option key={t.id} value={t.staffMember.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </select>
                </div>
              </div>
              {formError && <p className="text-danger" style={{ marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Enregistrement…" : "Créer la classe"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
