"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, LoaderCircle, Plus, UserPlus } from "lucide-react";
import Shell from "../../components/Shell";
import { Avatar, EmptyState, FormError, Modal, PageHeader, Pagination, SearchInput, SortHeader, TableSkeleton, useFeedback } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useTable } from "../../lib/useTable";
import { STUDENT_STATUS as STATUS_LABELS } from "../../lib/labels";

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


const EMPTY_FORM = { firstName: "", lastName: "", dateOfBirth: "", gender: "M", classId: "" };

export default function StudentsPage() {
  const router = useRouter();
  const feedback = useFeedback();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [classFilter, setClassFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(() => {
    api
      .get<StudentRow[]>(`/students${classFilter ? `?classId=${classFilter}` : ""}`)
      .then((list) => {
        setStudents(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [classFilter]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get<ClassRef[]>("/classes").then(setClasses).catch(() => {});
  }, []);

  const table = useTable<StudentRow, "matricule" | "name" | "class" | "status">({
    rows: students ?? [],
    accessors: {
      matricule: (s) => s.matricule,
      name: (s) => `${s.lastName} ${s.firstName}`,
      class: (s) => s.enrollments[0]?.class?.name,
      status: (s) => STATUS_LABELS[s.status]?.label ?? s.status,
    },
    searchText: (s) => `${s.firstName} ${s.lastName} ${s.matricule} ${s.enrollments[0]?.class?.name ?? ""}`,
    initialSort: { key: "name", dir: "asc" },
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.dateOfBirth && new Date(form.dateOfBirth) > new Date()) {
      setFormError("La date de naissance ne peut pas être dans le futur");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.post<StudentRow>("/students", { ...form, classId: form.classId || undefined });
      setShowForm(false);
      setForm(EMPTY_FORM);
      feedback.toast({
        kind: "success",
        title: "Élève inscrit",
        message: `${created.firstName} ${created.lastName} — matricule ${created.matricule}`,
        action: { label: "Voir le dossier", onClick: () => router.push(`/students/${created.id}`) },
      });
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Élèves">
      <PageHeader
        title="Élèves"
        description={students ? `${students.length} élève(s)${classFilter ? " dans cette classe" : ""} — cliquez sur un élève pour ouvrir son dossier complet.` : "Chargement…"}
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <UserPlus size={16} /> Nouvel élève
          </button>
        }
      />

      <div className="table-toolbar">
        <div className="table-toolbar-left">
          <SearchInput value={table.query} onChange={table.setQuery} placeholder="Nom, prénom, matricule…" label="Rechercher un élève" />
          <select className="input" style={{ width: "auto", minWidth: 170 }} aria-label="Filtrer par classe" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Toutes les classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        {error ? (
          <EmptyState tone="error" title="Impossible de charger les élèves" action={<button className="btn btn-outline" onClick={load}>Réessayer</button>}>
            {error}
          </EmptyState>
        ) : !students ? (
          <TableSkeleton columns={5} />
        ) : table.total === 0 ? (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title={table.query || classFilter ? "Aucun élève ne correspond" : "Aucun élève inscrit"}
            action={
              table.query || classFilter ? (
                <button className="btn btn-outline" onClick={() => { table.setQuery(""); setClassFilter(""); }}>
                  Effacer les filtres
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                  <Plus size={16} /> Inscrire un élève
                </button>
              )
            }
          />
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Élève" column="name" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Matricule" column="matricule" sort={table.sort} onSort={table.toggleSort} />
                  <SortHeader label="Classe" column="class" sort={table.sort} onSort={table.toggleSort} />
                  <th>Sexe</th>
                  <SortHeader label="Statut" column="status" sort={table.sort} onSort={table.toggleSort} />
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((s) => (
                  <tr key={s.id} className="row-link" onClick={() => router.push(`/students/${s.id}`)}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={`${s.firstName} ${s.lastName}`} size="sm" />
                        <Link href={`/students/${s.id}`} className="cell-main" onClick={(e) => e.stopPropagation()}>
                          {s.lastName} {s.firstName}
                        </Link>
                      </div>
                    </td>
                    <td className="tabular">{s.matricule}</td>
                    <td>{s.enrollments[0]?.class?.name || <span className="muted">Non affecté</span>}</td>
                    <td>{s.gender === "F" ? "Fille" : "Garçon"}</td>
                    <td>
                      <span className={`badge ${STATUS_LABELS[s.status]?.badge || "badge-neutral"}`}>{STATUS_LABELS[s.status]?.label || s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={table.page} pageCount={table.pageCount} total={table.total} pageSize={table.pageSize} onPage={table.setPage} unit="élève" />
          </>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        busy={saving}
        title="Nouvel élève"
        description="Le matricule est attribué automatiquement."
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)} disabled={saving}>
              Annuler
            </button>
            <button type="submit" form="student-form" className="btn btn-primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <UserPlus size={16} />} Inscrire l&apos;élève
            </button>
          </>
        }
      >
        <form id="student-form" onSubmit={handleCreate}>
          <FormError message={formError} />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="st-first" className="required">
                Prénom
              </label>
              <input id="st-first" className="input" required autoComplete="off" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="st-last" className="required">
                Nom
              </label>
              <input id="st-last" className="input" required autoComplete="off" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="st-birth" className="required">
                Date de naissance
              </label>
              <input id="st-birth" type="date" className="input" required max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="st-gender">Sexe</label>
              <select id="st-gender" className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="st-class">Classe</label>
              <select id="st-class" className="input" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">— À affecter plus tard —</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
