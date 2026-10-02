"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, LoaderCircle, Plus, School, UserRound, Users } from "lucide-react";
import Shell from "../../components/Shell";
import { CardSkeleton, EmptyState, FormError, Modal, PageHeader, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { getStoredUser } from "../../lib/auth";

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

const MANAGEMENT = ["SUPER_ADMIN", "ADMIN_ORGANISATION", "DIRECTOR"];
const EMPTY_FORM = { name: "", code: "", level: "", capacity: 50, teacherId: "" };

/** "6ème A" → level "6ème", code "6A" (suggestions until the user types their own). */
const suggestLevel = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const suggestCode = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/terminale/i, "Tle")
    .replace(/(\d)\s*(?:eme|ere|nde|e)\b/gi, "$1")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 10);

export default function ClassesPage() {
  const feedback = useFeedback();
  const canManage = MANAGEMENT.includes(getStoredUser()?.role ?? "");
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [edited, setEdited] = useState({ code: false, level: false });

  const load = useCallback(() => {
    api
      .get<ClassRow[]>("/classes")
      .then((list) => {
        setClasses(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    load();
    if (canManage) api.get<TeacherOption[]>("/staff?role=ENSEIGNANT").then(setTeachers).catch(() => {});
  }, [load, canManage]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/classes", { ...form, code: form.code.trim().toUpperCase(), teacherId: form.teacherId || undefined });
      setShowForm(false);
      feedback.success("Classe créée", form.name);
      setForm(EMPTY_FORM);
      setEdited({ code: false, level: false });
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const totalStudents = classes?.reduce((s, c) => s + c._count.enrollments, 0) ?? 0;

  return (
    <Shell title="Classes">
      <PageHeader
        title="Classes"
        description={classes ? `${classes.length} classe(s), ${totalStudents} élève(s) inscrit(s) — année scolaire en cours` : "Chargement…"}
        actions={
          <>
            <Link href="/timetable" className="btn btn-outline">
              <CalendarDays size={16} /> Emplois du temps
            </Link>
            {canManage && (
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                <Plus size={16} /> Nouvelle classe
              </button>
            )}
          </>
        }
      />

      {error ? (
        <div className="card">
          <EmptyState tone="error" title="Impossible de charger les classes" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        </div>
      ) : !classes ? (
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} height={60} />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="card">
          <EmptyState icon={<School size={22} />} title="Aucune classe pour l'année en cours" action={canManage && <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Créer la première classe</button>} />
        </div>
      ) : (
        <div className="kpi-grid stagger">
          {classes.map((c, i) => {
            const fill = c.capacity ? Math.round((c._count.enrollments / c.capacity) * 100) : 0;
            return (
              <Link key={c.id} href={`/classes/${c.id}`} className="card card-interactive" style={{ display: "block", textDecoration: "none", color: "inherit", ["--i" as string]: i }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {c.level} · {c.code}
                    </div>
                  </div>
                  <span className={`badge ${fill >= 100 ? "badge-danger" : fill >= 90 ? "badge-warning" : "badge-green"}`}>
                    <Users size={12} /> {c._count.enrollments}/{c.capacity}
                  </span>
                </div>
                <div className={`meter${fill >= 100 ? " is-danger" : fill >= 90 ? " is-warning" : ""}`} style={{ marginTop: 14 }} role="img" aria-label={`Remplissage ${fill} %`}>
                  <span style={{ width: `${Math.min(fill, 100)}%` }} />
                </div>
                <p className="muted" style={{ marginTop: 12, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                  <UserRound size={14} /> {c.teacher ? `${c.teacher.user.firstName} ${c.teacher.user.lastName}` : "Aucun professeur principal"}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        busy={saving}
        title="Nouvelle classe"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="class-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Créer la classe
            </button>
          </>
        }
      >
        <form id="class-form" onSubmit={handleCreate}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cl-name" className="required">
                Nom
              </label>
              <input
                id="cl-name"
                className="input"
                required
                placeholder="Ex. 6ème A"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    level: edited.level ? f.level : suggestLevel(name),
                    code: edited.code ? f.code : suggestCode(name),
                  }));
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="cl-code" className="required">
                Code
              </label>
              <input id="cl-code" className="input" required placeholder="Ex. 6A" value={form.code} onChange={(e) => {
                  setEdited((x) => ({ ...x, code: true }));
                  setForm({ ...form, code: e.target.value });
                }} />
              <span className="field-hint">Unique pour l&apos;année scolaire.</span>
            </div>
            <div className="field">
              <label htmlFor="cl-level" className="required">
                Niveau
              </label>
              <input id="cl-level" className="input" required placeholder="Ex. 6ème" value={form.level} onChange={(e) => {
                  setEdited((x) => ({ ...x, level: true }));
                  setForm({ ...form, level: e.target.value });
                }} />
            </div>
            <div className="field">
              <label htmlFor="cl-capacity">Capacité</label>
              <input id="cl-capacity" type="number" min={1} max={200} className="input" required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </div>
            <div className="field full">
              <label htmlFor="cl-teacher">Professeur principal</label>
              <select id="cl-teacher" className="input" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">— Aucun —</option>
                {teachers.map(
                  (t) =>
                    t.staffMember && (
                      <option key={t.id} value={t.staffMember.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ),
                )}
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
